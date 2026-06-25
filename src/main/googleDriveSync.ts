import fs from 'fs';
import path from 'path';
import http from 'http';
import { safeStorage, shell } from 'electron';
import Store from 'electron-store';
import * as hierarchyService from './hierarchyService';

const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const SNAPSHOT_NAME = 'diff-commit-projects-backup.json';

interface GoogleDriveTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scope?: string;
    tokenType?: string;
}

interface GoogleDriveCredentials {
    clientId: string;
    clientSecret: string;
}

interface DriveFile {
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
}

interface ProjectSnapshot {
    name: string;
    content: string;
    commits: unknown[];
    metadata: Record<string, unknown> | null;
    updatedAt: number;
}

interface RepositorySnapshot {
    name: string;
    metadata: Record<string, unknown> | null;
    projects: ProjectSnapshot[];
}

interface WorkspaceSnapshot {
    schemaVersion: 1;
    app: 'diff-commit-ai';
    createdAt: number;
    repositories: RepositorySnapshot[];
}

export interface GoogleDriveSyncStatus {
    configured: boolean;
    connected: boolean;
    autoSync: boolean;
    lastSyncAt: number | null;
    lastRestoreAt: number | null;
    lastError: string | null;
    remoteModifiedTime: string | null;
}

export interface GoogleDriveAuthStart {
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    verificationUrlComplete?: string;
    expiresIn: number;
    interval: number;
}

function encryptSecret(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) return value;
    return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) return value;
    try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch (error) {
        throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function sanitizeFolderName(name: string): string {
    return name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 120) || 'Untitled';
}

async function parseGoogleResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    return response.text();
}

export class GoogleDriveSyncService {
    private pendingAutoSync: NodeJS.Timeout | null = null;
    private autoSyncInFlight = false;
    private oauthServer: http.Server | null = null;
    private authError: string | null = null;
    private authSuccess = false;

    constructor(
        private store: Store,
        private getReposRootPath: () => string,
        private options: {
            projectContentFile: string;
            diffCommitDir: string;
            commitsFile: string;
            metadataFile: string;
        }
    ) { }

    setCredentials(clientId: string, clientSecret: string): void {
        const credentials: GoogleDriveCredentials = {
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim(),
        };
        if (!credentials.clientId || !credentials.clientSecret) {
            throw new Error('Google OAuth client ID and client secret are required.');
        }
        this.store.set('googleDriveOAuthClientId', encryptSecret(credentials.clientId));
        this.store.set('googleDriveOAuthClientSecret', encryptSecret(credentials.clientSecret));
    }

    async setAutoSync(enabled: boolean): Promise<GoogleDriveSyncStatus> {
        this.store.set('googleDriveAutoSyncEnabled', Boolean(enabled));
        return await this.getStatus();
    }

    async getStatus(): Promise<GoogleDriveSyncStatus> {
        let remoteModifiedTime: string | null = null;
        if (this.hasTokens()) {
            try {
                const remote = await this.findSnapshotFile();
                remoteModifiedTime = remote?.modifiedTime || null;
            } catch {
                remoteModifiedTime = null;
            }
        }
        return {
            configured: Boolean(this.getCredentials()),
            connected: this.hasTokens(),
            autoSync: this.isAutoSyncEnabled(),
            lastSyncAt: (this.store.get('googleDriveLastSyncAt') as number | undefined) ?? null,
            lastRestoreAt: (this.store.get('googleDriveLastRestoreAt') as number | undefined) ?? null,
            lastError: (this.store.get('googleDriveLastError') as string | undefined) ?? null,
            remoteModifiedTime,
        };
    }

    async startAuth(): Promise<GoogleDriveAuthStart> {
        const credentials = this.requireCredentials();
        
        if (this.oauthServer) {
            this.oauthServer.close();
            this.oauthServer = null;
        }

        this.authError = null;
        this.authSuccess = false;

        return new Promise<GoogleDriveAuthStart>((resolve, reject) => {
            let port = 0;
            const server = http.createServer(async (req, res) => {
                const reqUrl = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
                const code = reqUrl.searchParams.get('code');
                const error = reqUrl.searchParams.get('error');

                if (error) {
                    this.authError = `Google authorization failed: ${error}`;
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authorization Failed</h1><p>Google returned an error. You can close this tab now.</p>');
                    server.close();
                    this.oauthServer = null;
                    return;
                }

                if (!code) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authorization Failed</h1><p>No authorization code was received. You can close this tab now.</p>');
                    return;
                }

                try {
                    const tokenBody = new URLSearchParams({
                        code,
                        client_id: credentials.clientId,
                        client_secret: credentials.clientSecret,
                        redirect_uri: `http://127.0.0.1:${port}`,
                        grant_type: 'authorization_code',
                    });

                    const response = await fetch(TOKEN_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: tokenBody,
                    });

                    const data = await parseGoogleResponse(response) as Record<string, unknown>;
                    if (!response.ok) {
                        throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
                    }

                    this.saveTokens({
                        accessToken: String(data.access_token || ''),
                        refreshToken: String(data.refresh_token || ''),
                        expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000,
                        scope: typeof data.scope === 'string' ? data.scope : undefined,
                        tokenType: typeof data.token_type === 'string' ? data.token_type : undefined,
                    });
                    this.store.delete('googleDriveLastError');
                    
                    this.authSuccess = true;
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h1>Authorization Successful!</h1><p>You have successfully connected Diff & Commit to Google Drive. You can close this tab and return to the application.</p>');
                } catch (err) {
                    this.authError = (err as Error).message;
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Authorization Error</h1><p>${(err as Error).message}</p>`);
                } finally {
                    server.close();
                    this.oauthServer = null;
                }
            });

            server.on('error', (err) => {
                reject(err);
            });

            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                const listeningPort = typeof address === 'string' ? 0 : address?.port || 0;
                if (!listeningPort) {
                    reject(new Error('Failed to obtain loopback server port.'));
                    return;
                }

                port = listeningPort;
                this.oauthServer = server;

                const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                authUrl.searchParams.set('client_id', credentials.clientId);
                authUrl.searchParams.set('redirect_uri', `http://127.0.0.1:${port}`);
                authUrl.searchParams.set('response_type', 'code');
                authUrl.searchParams.set('scope', DRIVE_APPDATA_SCOPE);
                authUrl.searchParams.set('access_type', 'offline');
                authUrl.searchParams.set('prompt', 'consent');

                void shell.openExternal(authUrl.toString());

                resolve({
                    deviceCode: `loopback_${port}`,
                    userCode: 'Open Browser...',
                    verificationUrl: authUrl.toString(),
                    verificationUrlComplete: authUrl.toString(),
                    expiresIn: 300,
                    interval: 1,
                });
            });
        });
    }

    async pollAuth(deviceCode: string): Promise<GoogleDriveSyncStatus | { pending: true; slowDown?: boolean }> {
        if (this.authError) {
            const err = this.authError;
            this.authError = null;
            throw new Error(err);
        }
        if (this.authSuccess) {
            this.authSuccess = false;
            return this.getStatus();
        }
        return { pending: true };
    }

    scheduleAutoUpload(delayMs = 2000): void {
        if (!this.isAutoSyncEnabled() || !this.hasTokens()) return;
        if (this.pendingAutoSync) clearTimeout(this.pendingAutoSync);
        this.pendingAutoSync = setTimeout(() => {
            this.pendingAutoSync = null;
            void this.uploadSnapshot().catch((error) => {
                console.warn('[GoogleDrive] Auto sync failed:', error);
                this.store.set('googleDriveLastError', (error as Error).message);
            });
        }, delayMs);
    }

    async restoreIfRemoteIsNewer(): Promise<boolean> {
        if (!this.isAutoSyncEnabled() || !this.hasTokens()) return false;
        const remote = await this.findSnapshotFile();
        if (!remote?.modifiedTime) return false;
        const remoteTime = Date.parse(remote.modifiedTime);
        const lastRestoreAt = (this.store.get('googleDriveLastRestoreAt') as number | undefined) ?? 0;
        const localTime = this.getLocalLatestUpdatedAt();
        if (Number.isNaN(remoteTime) || remoteTime <= Math.max(localTime, lastRestoreAt)) return false;
        await this.restoreSnapshot();
        return true;
    }

    async uploadSnapshot(): Promise<GoogleDriveSyncStatus> {
        if (this.autoSyncInFlight) return this.getStatus();
        this.autoSyncInFlight = true;
        try {
            const snapshot = this.createSnapshot();
            const content = JSON.stringify(snapshot, null, 2);
            const remote = await this.findSnapshotFile();
            if (remote) {
                await this.uploadContent(content, remote.id, 'PATCH');
            } else {
                await this.uploadContent(content, undefined, 'POST');
            }
            this.store.set('googleDriveLastSyncAt', Date.now());
            this.store.delete('googleDriveLastError');
            return await this.getStatus();
        } catch (error) {
            this.store.set('googleDriveLastError', (error as Error).message);
            throw error;
        } finally {
            this.autoSyncInFlight = false;
        }
    }

    async restoreSnapshot(): Promise<GoogleDriveSyncStatus> {
        const remote = await this.findSnapshotFile();
        if (!remote) throw new Error('No Diff & Commit backup was found in Google Drive.');
        const accessToken = await this.getAccessToken();
        const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(remote.id)}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await parseGoogleResponse(response);
        if (!response.ok) {
            throw new Error(`Google Drive download failed: ${JSON.stringify(data)}`);
        }
        const snapshot = typeof data === 'string' ? JSON.parse(data) as WorkspaceSnapshot : data as WorkspaceSnapshot;
        this.applySnapshot(snapshot);
        this.store.set('googleDriveLastRestoreAt', Date.now());
        this.store.delete('googleDriveLastError');
        return this.getStatus();
    }

    private getCredentials(): GoogleDriveCredentials | null {
        const clientId = this.store.get('googleDriveOAuthClientId') as string | undefined;
        const clientSecret = this.store.get('googleDriveOAuthClientSecret') as string | undefined;
        if (!clientId || !clientSecret) return null;
        try {
            return {
                clientId: decryptSecret(clientId),
                clientSecret: decryptSecret(clientSecret),
            };
        } catch (error) {
            console.error('[GoogleDrive] Failed to decrypt saved credentials:', error);
            return null;
        }
    }

    private requireCredentials(): GoogleDriveCredentials {
        const credentials = this.getCredentials();
        if (!credentials) {
            throw new Error('Google Drive OAuth credentials are not configured.');
        }
        return credentials;
    }

    private hasTokens(): boolean {
        return Boolean(this.store.get('googleDriveTokens'));
    }

    private isAutoSyncEnabled(): boolean {
        return this.store.get('googleDriveAutoSyncEnabled') !== false;
    }

    private getTokens(): GoogleDriveTokens | null {
        const encrypted = this.store.get('googleDriveTokens') as string | undefined;
        if (!encrypted) return null;
        try {
            return JSON.parse(decryptSecret(encrypted)) as GoogleDriveTokens;
        } catch (error) {
            console.error('[GoogleDrive] Failed to decrypt saved tokens:', error);
            return null;
        }
    }

    private saveTokens(tokens: GoogleDriveTokens): void {
        this.store.set('googleDriveTokens', encryptSecret(JSON.stringify(tokens)));
    }

    private async getAccessToken(): Promise<string> {
        const tokens = this.getTokens();
        if (!tokens?.accessToken || !tokens.refreshToken) {
            throw new Error('Google Drive is not connected.');
        }
        if (tokens.expiresAt > Date.now()) return tokens.accessToken;

        const credentials = this.requireCredentials();
        const body = new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            refresh_token: tokens.refreshToken,
            grant_type: 'refresh_token',
        });
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        const data = await parseGoogleResponse(response) as Record<string, unknown>;
        if (!response.ok) {
            throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
        }
        const updatedTokens: GoogleDriveTokens = {
            ...tokens,
            accessToken: String(data.access_token || ''),
            expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000,
            scope: typeof data.scope === 'string' ? data.scope : tokens.scope,
            tokenType: typeof data.token_type === 'string' ? data.token_type : tokens.tokenType,
        };
        this.saveTokens(updatedTokens);
        return updatedTokens.accessToken;
    }

    private async findSnapshotFile(): Promise<DriveFile | null> {
        if (!this.hasTokens()) return null;
        const accessToken = await this.getAccessToken();
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id,name,modifiedTime,size)',
            pageSize: '10',
            q: `name='${SNAPSHOT_NAME}' and 'appDataFolder' in parents and trashed=false`,
        });
        const response = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await parseGoogleResponse(response) as { files?: DriveFile[] };
        if (!response.ok) {
            throw new Error(`Google Drive lookup failed: ${JSON.stringify(data)}`);
        }
        return data.files?.[0] ?? null;
    }

    private async uploadContent(content: string, fileId: string | undefined, method: 'POST' | 'PATCH'): Promise<void> {
        const accessToken = await this.getAccessToken();
        const boundary = `diff_commit_${Date.now()}`;
        const metadata: Record<string, unknown> = {
            name: SNAPSHOT_NAME,
            mimeType: 'application/json',
        };
        if (!fileId) {
            metadata.parents = ['appDataFolder'];
        }
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            content,
            `--${boundary}--`,
            '',
        ].join('\r\n');
        const url = fileId
            ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=multipart`
            : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        });
        const data = await parseGoogleResponse(response);
        if (!response.ok) {
            throw new Error(`Google Drive upload failed: ${JSON.stringify(data)}`);
        }
    }

    private createSnapshot(): WorkspaceSnapshot {
        const reposRootPath = this.getReposRootPath();
        const repositories: RepositorySnapshot[] = [];
        if (!fs.existsSync(reposRootPath)) {
            return { schemaVersion: 1, app: 'diff-commit-ai', createdAt: Date.now(), repositories };
        }

        for (const repoEntry of fs.readdirSync(reposRootPath, { withFileTypes: true })) {
            if (!repoEntry.isDirectory() || repoEntry.name.startsWith('.')) continue;
            const repoPath = path.join(reposRootPath, repoEntry.name);
            if (hierarchyService.getNodeType(repoPath) !== 'repository') continue;
            const projects: ProjectSnapshot[] = [];

            for (const projectEntry of fs.readdirSync(repoPath, { withFileTypes: true })) {
                if (!projectEntry.isDirectory() || projectEntry.name.startsWith('.')) continue;
                const projectPath = path.join(repoPath, projectEntry.name);
                const diffCommitPath = path.join(projectPath, this.options.diffCommitDir);
                if (!fs.existsSync(diffCommitPath)) continue;
                const contentPath = path.join(projectPath, this.options.projectContentFile);
                const commitsPath = path.join(diffCommitPath, this.options.commitsFile);
                const metadataPath = path.join(diffCommitPath, this.options.metadataFile);
                const content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';
                const commits = fs.existsSync(commitsPath) ? JSON.parse(fs.readFileSync(commitsPath, 'utf-8')) : [];
                const stats = fs.existsSync(contentPath) ? fs.statSync(contentPath) : fs.statSync(projectPath);
                projects.push({
                    name: projectEntry.name,
                    content,
                    commits: Array.isArray(commits) ? commits : [],
                    metadata: readJsonFile(metadataPath),
                    updatedAt: stats.mtimeMs,
                });
            }

            repositories.push({
                name: repoEntry.name,
                metadata: readJsonFile(path.join(repoPath, '.hierarchy-meta.json')),
                projects,
            });
        }

        return { schemaVersion: 1, app: 'diff-commit-ai', createdAt: Date.now(), repositories };
    }

    private applySnapshot(snapshot: WorkspaceSnapshot): void {
        if (snapshot?.schemaVersion !== 1 || snapshot.app !== 'diff-commit-ai' || !Array.isArray(snapshot.repositories)) {
            throw new Error('Google Drive backup format is not supported.');
        }
        const reposRootPath = this.getReposRootPath();
        fs.mkdirSync(reposRootPath, { recursive: true });

        for (const repository of snapshot.repositories) {
            const repoName = sanitizeFolderName(repository.name);
            const repoPath = path.join(reposRootPath, repoName);
            fs.mkdirSync(repoPath, { recursive: true });
            hierarchyService.writeHierarchyMeta(repoPath, {
                type: 'repository',
                createdAt: typeof repository.metadata?.createdAt === 'number' ? repository.metadata.createdAt : Date.now(),
                name: repoName,
            });

            for (const project of repository.projects) {
                const projectName = sanitizeFolderName(project.name);
                const projectPath = path.join(repoPath, projectName);
                const diffCommitPath = path.join(projectPath, this.options.diffCommitDir);
                fs.mkdirSync(diffCommitPath, { recursive: true });
                hierarchyService.writeHierarchyMeta(projectPath, {
                    type: 'project',
                    createdAt: typeof project.metadata?.createdAt === 'number' ? project.metadata.createdAt : Date.now(),
                    name: projectName,
                });
                fs.writeFileSync(path.join(projectPath, this.options.projectContentFile), project.content || '', 'utf-8');
                fs.writeFileSync(path.join(diffCommitPath, this.options.commitsFile), JSON.stringify(project.commits || [], null, 2), 'utf-8');
                const metadata = {
                    ...(project.metadata || {}),
                    createdAt: typeof project.metadata?.createdAt === 'number' ? project.metadata.createdAt : Date.now(),
                };
                fs.writeFileSync(path.join(diffCommitPath, this.options.metadataFile), JSON.stringify(metadata, null, 2), 'utf-8');
            }
        }
    }

    private getLocalLatestUpdatedAt(): number {
        const reposRootPath = this.getReposRootPath();
        if (!fs.existsSync(reposRootPath)) return 0;
        let latest = 0;
        const visit = (dirPath: string) => {
            for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
                const entryPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    visit(entryPath);
                } else {
                    latest = Math.max(latest, fs.statSync(entryPath).mtimeMs);
                }
            }
        };
        visit(reposRootPath);
        return latest;
    }
}
