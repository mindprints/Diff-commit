import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GoogleDriveSyncService } from './googleDriveSync';
import { safeStorage, shell } from 'electron';
import Store from 'electron-store';
import path from 'path';

// Mock Electron modules
vi.mock('electron', () => {
    return {
        safeStorage: {
            isEncryptionAvailable: () => true,
            encryptString: (str: string) => Buffer.from(`mock_enc:${str}`),
            decryptString: (buf: Buffer) => buf.toString().replace('mock_enc:', ''),
        },
        shell: {
            openExternal: vi.fn(),
        },
    };
});

// Mock electron-store
vi.mock('electron-store', () => {
    return {
        default: class MockStore {
            private data = new Map<string, unknown>();
            get(key: string) {
                return this.data.get(key);
            }
            set(key: string, value: unknown) {
                this.data.set(key, value);
            }
            delete(key: string) {
                this.data.delete(key);
            }
        }
    };
});

describe('GoogleDriveSyncService OAuth Loopback Flow', () => {
    let store: Store;
    let service: GoogleDriveSyncService;
    const mockGetReposRootPath = () => path.join('C:', 'repos');
    const mockOptions = {
        projectContentFile: 'content.md',
        diffCommitDir: '.diff-commit',
        commitsFile: 'commits.json',
        metadataFile: 'metadata.json',
    };

    beforeEach(() => {
        store = new Store();
        service = new GoogleDriveSyncService(store, mockGetReposRootPath, mockOptions);
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Ensure any running loopback server is closed
        if ((service as any).oauthServer) {
            (service as any).oauthServer.close();
        }
        vi.restoreAllMocks();
    });

    describe('Credentials management', () => {
        it('encrypts and stores client credentials successfully', () => {
            service.setCredentials('my-client-id', 'my-client-secret');
            
            // Check that values in store are encrypted (start with mock_enc:)
            const storedId = store.get('googleDriveOAuthClientId') as string;
            const storedSecret = store.get('googleDriveOAuthClientSecret') as string;
            
            // The stored values are base64-encoded ciphertext
            const decryptedId = Buffer.from(storedId, 'base64').toString();
            const decryptedSecret = Buffer.from(storedSecret, 'base64').toString();
            expect(decryptedId).toContain('mock_enc:my-client-id');
            expect(decryptedSecret).toContain('mock_enc:my-client-secret');

            // Retrieve and verify decryption
            const creds = (service as any).getCredentials();
            expect(creds).not.toBeNull();
            expect(creds.clientId).toBe('my-client-id');
            expect(creds.clientSecret).toBe('my-client-secret');
        });

        it('handles decryption failure by returning null and logging error', () => {
            service.setCredentials('my-client-id', 'my-client-secret');
            
            // Force decryptString to throw an error
            const spyDecrypt = vi.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
                throw new Error('DPAPI decryption error');
            });
            const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

            const creds = (service as any).getCredentials();
            expect(creds).toBeNull();
            expect(spyConsole).toHaveBeenCalledWith(
                '[GoogleDrive] Failed to decrypt saved credentials:',
                expect.any(Error)
            );

            spyDecrypt.mockRestore();
            spyConsole.mockRestore();
        });
    });

    describe('OAuth Flow (Loopback integration)', () => {
        it('starts loopback server, opens browser and completes token exchange successfully', async () => {
            service.setCredentials('my-client-id', 'my-client-secret');

            // Mock global fetch for the token exchange POST request
            const mockTokenResponse = {
                access_token: 'access_12345',
                refresh_token: 'refresh_67890',
                expires_in: 3600,
                scope: 'https://www.googleapis.com/auth/drive.appdata',
                token_type: 'Bearer',
            };
            const originalFetch = global.fetch;
            const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
                if (String(url) === 'https://oauth2.googleapis.com/token') {
                    return Promise.resolve({
                        ok: true,
                        headers: new Headers({ 'content-type': 'application/json' }),
                        json: () => Promise.resolve(mockTokenResponse),
                    } as Response);
                }
                return originalFetch(url, init);
            });

            // 1. Start the authentication flow
            const authStart = await service.startAuth();
            
            // Verify loopback configuration returned
            expect(authStart.deviceCode).toContain('loopback_');
            expect(authStart.userCode).toBe('Open Browser...');
            expect(authStart.verificationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');

            // Verify shell.openExternal was called with the auth URL containing the client ID
            expect(shell.openExternal).toHaveBeenCalledTimes(1);
            const openedUrl = vi.mocked(shell.openExternal).mock.calls[0][0];
            expect(openedUrl).toContain('client_id=my-client-id');
            expect(openedUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.appdata');

            // Extract port from loopback code
            const port = authStart.deviceCode.split('_')[1];
            expect(port).not.toBeUndefined();

            // 2. Verify that pollAuth returns pending initially
            let pollResult = await service.pollAuth(authStart.deviceCode);
            expect(pollResult).toEqual({ pending: true });

            // 3. Simulate the Google redirect callback to our local loopback server
            // We use the real global fetch to hit the local server running in this test process!
            const callbackUrl = `http://127.0.0.1:${port}/?code=google_auth_code_999`;
            const callbackResponse = await fetch(callbackUrl);
            
            // Verify server response HTML
            expect(callbackResponse.status).toBe(200);
            const html = await callbackResponse.text();
            expect(html).toContain('Authorization Successful!');

            // Verify Google token endpoint was hit by our loopback server
            const tokenCall = fetchSpy.mock.calls.find(call => String(call[0]) === 'https://oauth2.googleapis.com/token');
            expect(tokenCall).not.toBeUndefined();
            const bodyParams = new URLSearchParams(tokenCall![1]?.body as string);
            expect(bodyParams.get('code')).toBe('google_auth_code_999');
            expect(bodyParams.get('client_id')).toBe('my-client-id');
            expect(bodyParams.get('grant_type')).toBe('authorization_code');

            // 4. Verify pollAuth now returns success (connected status)
            pollResult = await service.pollAuth(authStart.deviceCode);
            expect('connected' in pollResult && pollResult.connected).toBe(true);

            // Verify tokens were saved
            const savedTokens = (service as any).getTokens();
            expect(savedTokens).not.toBeNull();
            expect(savedTokens.accessToken).toBe('access_12345');
            expect(savedTokens.refreshToken).toBe('refresh_67890');

            fetchSpy.mockRestore();
        });

        it('handles authorization error redirected from Google', async () => {
            service.setCredentials('my-client-id', 'my-client-secret');

            const authStart = await service.startAuth();
            const port = authStart.deviceCode.split('_')[1];

            // Simulate callback with access_denied error from Google
            const callbackUrl = `http://127.0.0.1:${port}/?error=access_denied`;
            const callbackResponse = await fetch(callbackUrl);
            
            expect(callbackResponse.status).toBe(400);
            const html = await callbackResponse.text();
            expect(html).toContain('Authorization Failed');

            // Verify pollAuth throws the authorization error
            await expect(service.pollAuth(authStart.deviceCode)).rejects.toThrow(
                'Google authorization failed: access_denied'
            );
        });
    });
});
