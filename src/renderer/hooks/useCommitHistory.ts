import { useState, useEffect, useCallback } from 'react';
import { TextCommit } from '../types';

interface UseCommitHistoryOptions {
    getCommitText: () => string;
    onAfterCommit?: (committedText: string) => void;
    currentProjectPath?: string;
}

export function useCommitHistory({ getCommitText, onAfterCommit, currentProjectPath }: UseCommitHistoryOptions) {
    const [commits, setCommits] = useState<TextCommit[]>([]);
    const [showCommitHistory, setShowCommitHistory] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from Electron store, FS, or localStorage
    useEffect(() => {
        setIsLoaded(false); // Reset loaded state on path change
        const loadCommits = async () => {
            // Priority 1: Project-specific file storage
            if (currentProjectPath && window.electron?.loadProjectCommits) {
                const projectCommits = await window.electron.loadProjectCommits(currentProjectPath);
                setCommits(projectCommits || []);
                setIsLoaded(true);
                return;
            }

            // Priority 2: Global Electron Store (Legacy / Non-Project)
            if (window.electron && window.electron.getVersions) {
                const storedCommits = await window.electron.getVersions();
                if (storedCommits && Array.isArray(storedCommits)) {
                    setCommits(storedCommits);
                }
            } else {
                // Priority 3: localStorage (Web)
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
    }, [currentProjectPath]);

    // Save to Electron store, FS, or localStorage
    useEffect(() => {
        if (!isLoaded) return; // Don't save if we haven't finished loading for the current context yet

        const saveCommits = async () => {
            // Priority 1: Project-specific file storage
            if (currentProjectPath && window.electron?.saveProjectCommits) {
                await window.electron.saveProjectCommits(currentProjectPath, commits);
                return;
            }

            // Priority 2: Global Electron Store
            if (window.electron && window.electron.saveVersions) {
                await window.electron.saveVersions(commits);
            } else {
                // Priority 3: localStorage
                localStorage.setItem('diff-commit-commits', JSON.stringify(commits));
            }
        };

        // Only save if we have commits (or if we want to clear empty state, but usually we just append)
        // However, if we just switched projects, commits might be empty array. We shouldn't overwrite the new project's file with empty array immediately unless we mean to.
        // But the load effect runs first.
        // Let's add a precaution: only save if commits is not empty OR if we know we loaded successfully. 
        // For simplicity, just saving whenever `commits` changes is standard, assuming load happened first.
        // BUT: if we switch projects, `currentProjectPath` changes. `loadCommits` runs. `setCommits` updates. 
        // Then this effect runs because `commits` changed. It saves new commits to new path. Correct.
        if (commits.length > 0) {
            saveCommits();
        }
    }, [commits, currentProjectPath, isLoaded]);

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
        if (window.electron && window.electron.clearVersions) {
            await window.electron.clearVersions();
        } else {
            localStorage.removeItem('diff-commit-commits');
        }
    }, []);

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
