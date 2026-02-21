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

    // Track current project to detect changes
    const currentProjectRef = useRef(currentProjectPath);
    // Keep commits in a ref for stable callbacks (prevent stale closures in async handlers)
    const commitsRef = useRef<TextCommit[]>(commits);
    useEffect(() => {
        commitsRef.current = commits;
    }, [commits]);

    // Load commits when project changes
    useEffect(() => {
        const projectChanged = currentProjectRef.current !== currentProjectPath;
        currentProjectRef.current = currentProjectPath;

        // Clear commits immediately when project changes
        if (projectChanged) {
            setCommits([]);
        }

        // No project = no commits to load
        if (!currentProjectPath && !currentProjectName) {
            setCommits([]);
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
                return;
            }

            // No storage available
            setCommits([]);
        };

        loadCommits();
    }, [currentProjectPath, currentProjectName, browserLoadCommits]);

    /**
     * Internal manual commit save function.
     * Replaces the fragile useEffect-based save to prevent race conditions.
     */
    const saveCommits = useCallback(async (currentCommits: TextCommit[]) => {
        // Don't save if no project is selected
        if (!currentProjectPath && !currentProjectName) return false;

        // Priority 1: Electron file system
        if (currentProjectPath && window.electron?.saveProjectCommits) {
            try {
                await window.electron.saveProjectCommits(currentProjectPath, currentCommits);
                return true;
            } catch (e) {
                console.error('Failed to save commits to Electron:', e);
                return false;
            }
        }

        // Priority 2: Browser file system
        if (browserSaveCommits && currentProjectName) {
            try {
                await browserSaveCommits(currentCommits);
                return true;
            } catch (e) {
                console.warn('Failed to save commits to browser FS:', e);
                return false;
            }
        }

        return false;
    }, [currentProjectPath, currentProjectName, browserSaveCommits]);

    const handleCommit = useCallback(async () => {
        const textToCommit = getCommitText();
        if (!textToCommit.trim()) return;

        const currentCommits = commitsRef.current;
        // Prevent duplicate commits (identical to last commit)
        const lastCommit = currentCommits[currentCommits.length - 1];
        if (lastCommit && lastCommit.content === textToCommit) {
            return; // Don't commit identical content
        }

        const newCommit: TextCommit = {
            id: crypto.randomUUID(),
            commitNumber: currentCommits.length + 1,
            content: textToCommit,
            timestamp: Date.now(),
        };

        const updatedCommits = [...currentCommits, newCommit];
        setCommits(updatedCommits);

        // Manual save
        await saveCommits(updatedCommits);

        // Call the callback to let App handle any post-commit actions
        onAfterCommit?.(textToCommit);
    }, [getCommitText, onAfterCommit, saveCommits]);

    const handleDeleteCommit = useCallback(async (commitId: string) => {
        const updatedCommits = commitsRef.current.filter(c => c.id !== commitId);
        setCommits(updatedCommits);
        await saveCommits(updatedCommits);
    }, [saveCommits]);

    const handleClearAllCommits = useCallback(async () => {
        setCommits([]);
        await saveCommits([]);
    }, [saveCommits]);

    return {
        commits,
        setCommits,
        showCommitHistory,
        setShowCommitHistory,
        handleCommit,
        handleDeleteCommit,
        handleClearAllCommits,
        saveCommits,
    };
}
