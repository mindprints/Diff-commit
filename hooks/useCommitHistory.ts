import { useState, useEffect, useCallback } from 'react';
import { TextCommit } from '../types';

interface UseCommitHistoryOptions {
    getCommitText: () => string;
    onAfterCommit?: (committedText: string) => void;
}

export function useCommitHistory({ getCommitText, onAfterCommit }: UseCommitHistoryOptions) {
    const [commits, setCommits] = useState<TextCommit[]>([]);
    const [showCommitHistory, setShowCommitHistory] = useState(false);

    // Load from Electron store or localStorage
    useEffect(() => {
        const loadCommits = async () => {
            if (window.electron && window.electron.getVersions) {
                const storedCommits = await window.electron.getVersions();
                if (storedCommits && Array.isArray(storedCommits)) {
                    setCommits(storedCommits);
                }
            } else {
                // Fallback to localStorage for web/localhost testing
                const stored = localStorage.getItem('diff-commit-commits');
                if (stored) {
                    try {
                        setCommits(JSON.parse(stored));
                    } catch (e) {
                        console.warn('Failed to parse stored commits:', e);
                    }
                }
            }
        };
        loadCommits();
    }, []);

    // Save to Electron store or localStorage
    useEffect(() => {
        const saveCommits = async () => {
            if (window.electron && window.electron.saveVersions) {
                await window.electron.saveVersions(commits);
            } else {
                // Fallback to localStorage for web/localhost testing
                localStorage.setItem('diff-commit-commits', JSON.stringify(commits));
            }
        };
        if (commits.length > 0) {
            saveCommits();
        }
    }, [commits]);

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
