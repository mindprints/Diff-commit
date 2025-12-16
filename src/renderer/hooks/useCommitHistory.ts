import { useState, useEffect, useCallback } from 'react';
import { TextCommit } from '../types';

interface UseCommitHistoryOptions {
    getCommitText: () => string;
    onAfterCommit?: (committedText: string) => void;
    currentProjectPath?: string;
    currentProjectName?: string;
    // Browser file system callbacks (passed from parent that has the handle)
    browserLoadCommits?: () => Promise<TextCommit[]>;
    browserSaveCommits?: (commits: TextCommit[]) => Promise<boolean>;
}

export function useCommitHistory({
    getCommitText,
    onAfterCommit,
    currentProjectPath,
    currentProjectName,
    browserLoadCommits,
    browserSaveCommits
}: UseCommitHistoryOptions) {
    const [commits, setCommits] = useState<TextCommit[]>([]);
    const [showCommitHistory, setShowCommitHistory] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from Electron store, browser FS, or localStorage
    useEffect(() => {
        setIsLoaded(false); // Reset loaded state on path change
        const loadCommits = async () => {
            // Priority 1: Project-specific file storage (Electron)
            if (currentProjectPath && window.electron?.loadProjectCommits) {
                const projectCommits = await window.electron.loadProjectCommits(currentProjectPath);
                setCommits(projectCommits || []);
                setIsLoaded(true);
                return;
            }

            // Priority 2: Browser file system (via callback)
            if (browserLoadCommits && currentProjectName) {
                try {
                    const projectCommits = await browserLoadCommits();
                    setCommits(projectCommits || []);
                    setIsLoaded(true);
                    return;
                } catch (e) {
                    console.warn('Failed to load commits from browser FS:', e);
                }
            }

            // Priority 3: Global Electron Store (Legacy / Non-Project)
            if (window.electron && window.electron.getVersions) {
                const storedCommits = await window.electron.getVersions();
                if (storedCommits && Array.isArray(storedCommits)) {
                    setCommits(storedCommits);
                }
            } else {
                // Priority 4: localStorage (Web fallback)
                const stored = localStorage.getItem('diff-commit-commits');
                if (stored) {
                    try {
                        setCommits(JSON.parse(stored));
                    } catch (e) {
                        console.warn('Failed to parse stored commits:', e);
                    }
                }
            }
            setIsLoaded(true);
        };
        loadCommits();
    }, [currentProjectPath, currentProjectName, browserLoadCommits]);

    // Save to Electron store, browser FS, or localStorage
    useEffect(() => {
        if (!isLoaded) return; // Don't save if we haven't finished loading for the current context yet

        const saveCommits = async () => {
            // Priority 1: Project-specific file storage (Electron)
            if (currentProjectPath && window.electron?.saveProjectCommits) {
                await window.electron.saveProjectCommits(currentProjectPath, commits);
                return;
            }

            // Priority 2: Browser file system (via callback)
            if (browserSaveCommits && currentProjectName && commits.length > 0) {
                try {
                    await browserSaveCommits(commits);
                    return;
                } catch (e) {
                    console.warn('Failed to save commits to browser FS:', e);
                }
            }

            // Priority 3: Global Electron Store
            if (window.electron && window.electron.saveVersions) {
                await window.electron.saveVersions(commits);
            } else {
                // Priority 4: localStorage fallback
                localStorage.setItem('diff-commit-commits', JSON.stringify(commits));
            }
        };

        // Only save if we have commits
        if (commits.length > 0) {
            saveCommits();
        }
    }, [commits, currentProjectPath, currentProjectName, browserSaveCommits, isLoaded]);

    const handleCommit = useCallback(() => {
        const textToCommit = getCommitText();
        if (!textToCommit.trim()) return;

        // Prevent duplicate commits (identical to last commit)
        const lastCommit = commits[commits.length - 1];
        if (lastCommit && lastCommit.content === textToCommit) {
            return; // Don't commit identical content
        }

        const newCommit: TextCommit = {
            id: crypto.randomUUID(),
            commitNumber: commits.length + 1,
            content: textToCommit,
            timestamp: Date.now(),
        };

        setCommits(prev => [...prev, newCommit]);

        // Call the callback to let App handle any post-commit actions (like transferring text)
        onAfterCommit?.(textToCommit);
    }, [getCommitText, commits, onAfterCommit]);

    const handleDeleteCommit = useCallback((commitId: string) => {
        setCommits(prev => prev.filter(c => c.id !== commitId));
    }, []);

    const handleClearAllCommits = useCallback(async () => {
        setCommits([]);

        // Clear in project-specific file storage (Electron)
        if (currentProjectPath && window.electron?.saveProjectCommits) {
            await window.electron.saveProjectCommits(currentProjectPath, []);
            return;
        }

        // Clear in browser file system
        if (browserSaveCommits && currentProjectName) {
            await browserSaveCommits([]);
            return;
        }

        // Clear in global Electron store
        if (window.electron && window.electron.clearVersions) {
            await window.electron.clearVersions();
        } else {
            // Clear in localStorage
            localStorage.removeItem('diff-commit-commits');
        }
    }, [currentProjectPath, currentProjectName, browserSaveCommits]);

    return {
        commits,
        setCommits,
        showCommitHistory,
        setShowCommitHistory,
        handleCommit,
        handleDeleteCommit,
        handleClearAllCommits,
    };
}
