import { useState, useEffect, useCallback } from 'react';
import { TextVersion } from '../types';

interface UseVersionHistoryOptions {
    getCommitText: () => string;
    onAfterCommit?: (committedText: string) => void;
}

export function useVersionHistory({ getCommitText, onAfterCommit }: UseVersionHistoryOptions) {
    const [versions, setVersions] = useState<TextVersion[]>([]);
    const [showVersionHistory, setShowVersionHistory] = useState(false);

    // Load from Electron store or localStorage
    useEffect(() => {
        const loadVersions = async () => {
            if (window.electron && window.electron.getVersions) {
                const storedVersions = await window.electron.getVersions();
                if (storedVersions && Array.isArray(storedVersions)) {
                    setVersions(storedVersions);
                }
            } else {
                // Fallback to localStorage for web/localhost testing
                const stored = localStorage.getItem('diff-commit-versions');
                if (stored) {
                    try {
                        setVersions(JSON.parse(stored));
                    } catch (e) {
                        console.warn('Failed to parse stored versions:', e);
                    }
                }
            }
        };
        loadVersions();
    }, []);

    // Save to Electron store or localStorage
    useEffect(() => {
        const saveVersions = async () => {
            if (window.electron && window.electron.saveVersions) {
                await window.electron.saveVersions(versions);
            } else {
                // Fallback to localStorage for web/localhost testing
                localStorage.setItem('diff-commit-versions', JSON.stringify(versions));
            }
        };
        if (versions.length > 0) {
            saveVersions();
        }
    }, [versions]);

    const handleCommit = useCallback(() => {
        const textToCommit = getCommitText();
        if (!textToCommit.trim()) return;

        // Prevent duplicate commits (identical to last version)
        const lastVersion = versions[versions.length - 1];
        if (lastVersion && lastVersion.content === textToCommit) {
            return; // Don't commit identical content
        }

        const newVersion: TextVersion = {
            id: crypto.randomUUID(),
            versionNumber: versions.length + 1,
            content: textToCommit,
            timestamp: Date.now(),
        };

        setVersions(prev => [...prev, newVersion]);

        // Call the callback to let App handle any post-commit actions (like transferring text)
        onAfterCommit?.(textToCommit);
    }, [getCommitText, versions, onAfterCommit]);

    const handleDeleteVersion = useCallback((versionId: string) => {
        setVersions(prev => prev.filter(v => v.id !== versionId));
    }, []);

    const handleClearAllVersions = useCallback(async () => {
        setVersions([]);
        if (window.electron && window.electron.clearVersions) {
            await window.electron.clearVersions();
        } else {
            localStorage.removeItem('diff-commit-versions');
        }
    }, []);

    return {
        versions,
        setVersions,
        showVersionHistory,
        setShowVersionHistory,
        handleCommit,
        handleDeleteVersion,
        handleClearAllVersions,
    };
}
