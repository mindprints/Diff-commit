import { useState, useEffect, useCallback, useRef } from 'react';
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

/**
 * Hook for managing commit history.
 * 
 * SIMPLIFIED ARCHITECTURE:
 * - Each project is a folder with its own .diff-commit/commits.json
 * - No shared commit storage = no race conditions
 * - projectPath directly identifies the commit storage location
 */
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

    // Track current project to detect changes
    const currentProjectRef = useRef(currentProjectPath);

    // Load commits when project changes
    useEffect(() => {
        const projectChanged = currentProjectRef.current !== currentProjectPath;
        currentProjectRef.current = currentProjectPath;

        // Clear commits immediately when project changes
        if (projectChanged) {
            setCommits([]);
            setIsLoaded(false);
        }

        // No project = no commits to load
        if (!currentProjectPath && !currentProjectName) {
            setCommits([]);
            setIsLoaded(true);
            return;
        }

        const loadCommits = async () => {
            // Priority 1: Electron file system (project folder based)
            if (currentProjectPath && window.electron?.loadProjectCommits) {
                try {
                    const projectCommits = await window.electron.loadProjectCommits(currentProjectPath);
                    setCommits(projectCommits || []);
                } catch (e) {
                    console.error('Failed to load commits from Electron:', e);
                    setCommits([]);
                }
                setIsLoaded(true);
                return;
            }

            // Priority 2: Browser file system (via callback)
            if (browserLoadCommits && currentProjectName) {
                try {
                    const projectCommits = await browserLoadCommits();
                    setCommits(projectCommits || []);
                } catch (e) {
                    console.warn('Failed to load commits from browser FS:', e);
                    setCommits([]);
                }
                setIsLoaded(true);
                return;
            }

            // No storage available
            setCommits([]);
            setIsLoaded(true);
        };

        loadCommits();
    }, [currentProjectPath, currentProjectName, browserLoadCommits]);

    // Save commits when they change (and after initial load)
    useEffect(() => {
        // Don't save during initial load
        if (!isLoaded) return;

        // Don't save if no project is selected
        if (!currentProjectPath && !currentProjectName) return;

        // Don't save empty commits (handled by initial project creation)
        if (commits.length === 0) return;

        const saveCommits = async () => {
            // Priority 1: Electron file system
            if (currentProjectPath && window.electron?.saveProjectCommits) {
                try {
                    await window.electron.saveProjectCommits(currentProjectPath, commits);
                } catch (e) {
                    console.error('Failed to save commits to Electron:', e);
                }
                return;
            }

            // Priority 2: Browser file system
            if (browserSaveCommits && currentProjectName) {
                try {
                    await browserSaveCommits(commits);
                } catch (e) {
                    console.warn('Failed to save commits to browser FS:', e);
                }
                return;
            }
        };

        saveCommits();
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

        // Call the callback to let App handle any post-commit actions
        onAfterCommit?.(textToCommit);
    }, [getCommitText, commits, onAfterCommit]);

    const handleDeleteCommit = useCallback((commitId: string) => {
        setCommits(prev => prev.filter(c => c.id !== commitId));
    }, []);

    const handleClearAllCommits = useCallback(async () => {
        setCommits([]);

        // Clear in Electron file system
        if (currentProjectPath && window.electron?.saveProjectCommits) {
            await window.electron.saveProjectCommits(currentProjectPath, []);
            return;
        }

        // Clear in browser file system
        if (browserSaveCommits && currentProjectName) {
            await browserSaveCommits([]);
            return;
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
