import React, { useEffect, useMemo, useState } from 'react';
import { X, FolderGit2, RefreshCw, Search, Plus, Pin, PinOff, Trash2, Edit2, Check, XCircle } from 'lucide-react';
import { RepositoryInfo } from '../types';
import * as projectStorage from '../services/projectStorage';

interface RepoPickerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (repository: RepositoryInfo) => void;
    repositories?: RepositoryInfo[];
    onCreateRepository?: () => void;
}

const RECENT_KEY = 'diff-commit-recent-repos';
const PINNED_KEY = 'diff-commit-pinned-repos';
const MAX_RECENTS = 6;

function formatTimestamp(value?: number): string {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString();
}

export function RepoPickerDialog({
    isOpen,
    onClose,
    onSelect,
    repositories,
    onCreateRepository
}: RepoPickerDialogProps) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<RepositoryInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
    const [recentPaths, setRecentPaths] = useState<string[]>([]);
    const [editingPath, setEditingPath] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionLoadingPath, setActionLoadingPath] = useState<string | null>(null);

    const canRename = !!window.electron?.renameRepository;
    const canDelete = !!window.electron?.deleteRepository;

    const loadLocalLists = () => {
        try {
            const recentRaw = localStorage.getItem(RECENT_KEY);
            const pinnedRaw = localStorage.getItem(PINNED_KEY);
            const parsedRecent = recentRaw ? JSON.parse(recentRaw) : [];
            const parsedPinned = pinnedRaw ? JSON.parse(pinnedRaw) : [];
            setRecentPaths(Array.isArray(parsedRecent) ? parsedRecent : []);
            setPinnedPaths(Array.isArray(parsedPinned) ? parsedPinned : []);
        } catch (e) {
            console.warn('Failed to read repo lists:', e);
            setRecentPaths([]);
            setPinnedPaths([]);
        }
    };

    const updateLocalList = (key: string, value: string[]) => {
        localStorage.setItem(key, JSON.stringify(value));
    };

    const updateRecent = (repoPath: string) => {
        const next = [repoPath, ...recentPaths.filter(p => p !== repoPath)].slice(0, MAX_RECENTS);
        setRecentPaths(next);
        updateLocalList(RECENT_KEY, next);
    };

    const togglePin = (repoPath: string) => {
        const next = pinnedPaths.includes(repoPath)
            ? pinnedPaths.filter(p => p !== repoPath)
            : [repoPath, ...pinnedPaths];
        setPinnedPaths(next);
        updateLocalList(PINNED_KEY, next);
    };

    const replacePathInLists = (oldPath: string, newPath: string) => {
        const nextPinned = pinnedPaths.map(p => (p === oldPath ? newPath : p));
        const nextRecent = recentPaths.map(p => (p === oldPath ? newPath : p));
        setPinnedPaths(nextPinned);
        setRecentPaths(nextRecent);
        updateLocalList(PINNED_KEY, nextPinned);
        updateLocalList(RECENT_KEY, nextRecent);
    };

    const loadRepositories = async () => {
        setLoading(true);
        setError(null);
        try {
            const results = await projectStorage.listRepositories();
            setItems(results);
        } catch (e) {
            console.error('Failed to load repositories:', e);
            setError('Failed to load repositories. Please try again.');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setActionError(null);
        setEditingPath(null);
        if (repositories) {
            setItems(repositories);
        } else {
            loadRepositories();
        }
        loadLocalLists();
    }, [isOpen, repositories]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return items;
        return items.filter(repo =>
            repo.name.toLowerCase().includes(term) ||
            repo.path.toLowerCase().includes(term)
        );
    }, [items, query]);

    const repoMap = useMemo(() => {
        const map = new Map<string, RepositoryInfo>();
        items.forEach(repo => map.set(repo.path, repo));
        return map;
    }, [items]);

    const pinnedRepos = useMemo(() => {
        return pinnedPaths
            .map(path => repoMap.get(path))
            .filter((repo): repo is RepositoryInfo => !!repo)
            .filter(repo => filtered.includes(repo));
    }, [pinnedPaths, repoMap, filtered]);

    const recentRepos = useMemo(() => {
        return recentPaths
            .map(path => repoMap.get(path))
            .filter((repo): repo is RepositoryInfo => !!repo)
            .filter(repo => filtered.includes(repo) && !pinnedPaths.includes(repo.path));
    }, [recentPaths, repoMap, filtered, pinnedPaths]);

    const otherRepos = useMemo(() => {
        return filtered.filter(repo => !pinnedPaths.includes(repo.path) && !recentPaths.includes(repo.path));
    }, [filtered, pinnedPaths, recentPaths]);

    const handleSelect = (repo: RepositoryInfo) => {
        updateRecent(repo.path);
        onSelect(repo);
    };

    const startRename = (repo: RepositoryInfo) => {
        setEditingPath(repo.path);
        setEditingName(repo.name);
        setActionError(null);
    };

    const cancelRename = () => {
        setEditingPath(null);
        setEditingName('');
    };

    const submitRename = async (repo: RepositoryInfo) => {
        const trimmed = editingName.trim();
        if (!trimmed) return;
        setActionLoadingPath(repo.path);
        setActionError(null);
        try {
            const updated = await projectStorage.renameRepository(repo.path, trimmed);
            if (!updated) {
                setActionError('Failed to rename repository');
            } else {
                setItems(prev => prev.map(item => item.path === repo.path ? updated : item));
                replacePathInLists(repo.path, updated.path);
                setEditingPath(null);
                setEditingName('');
            }
        } catch (e) {
            console.error('Failed to rename repository:', e);
            setActionError('Failed to rename repository');
        }
        setActionLoadingPath(null);
    };

    const handleDelete = async (repo: RepositoryInfo) => {
        const confirmed = window.confirm(`Delete repository "${repo.name}"? This cannot be undone.`);
        if (!confirmed) return;
        setActionLoadingPath(repo.path);
        setActionError(null);
        try {
            const ok = await projectStorage.deleteRepository(repo.path);
            if (!ok) {
                setActionError('Failed to delete repository');
            } else {
                setItems(prev => prev.filter(item => item.path !== repo.path));
                const nextPinned = pinnedPaths.filter(path => path !== repo.path);
                const nextRecent = recentPaths.filter(path => path !== repo.path);
                setPinnedPaths(nextPinned);
                setRecentPaths(nextRecent);
                updateLocalList(PINNED_KEY, nextPinned);
                updateLocalList(RECENT_KEY, nextRecent);
            }
        } catch (e) {
            console.error('Failed to delete repository:', e);
            setActionError('Failed to delete repository');
        }
        setActionLoadingPath(null);
    };

    const handleCreateRepository = async () => {
        if (!onCreateRepository) return;
        setActionError(null);
        setLoading(true);
        try {
            await onCreateRepository();
        } catch (e) {
            console.error('Failed to create repository:', e);
            setActionError('Failed to create repository');
        } finally {
            await loadRepositories();
            setLoading(false);
        }
    };

    const renderRepoRow = (repo: RepositoryInfo) => {
        const isEditing = editingPath === repo.path;
        const isPinned = pinnedPaths.includes(repo.path);
        const isLoading = actionLoadingPath === repo.path;

        return (
            <div
                key={repo.path}
                className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors"
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    autoFocus
                                />
                                <button
                                    onClick={() => submitRename(repo)}
                                    className="p-2 text-green-600 hover:text-green-700"
                                    title="Save"
                                    disabled={isLoading}
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={cancelRename}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                    title="Cancel"
                                    disabled={isLoading}
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => handleSelect(repo)}
                                className="text-left w-full"
                            >
                                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                    {repo.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 break-all">
                                    {repo.path}
                                </div>
                            </button>
                        )}
                    </div>
                    {!isEditing && (
                        <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-500 dark:text-slate-400 text-right">
                                <div>{repo.projectCount} project{repo.projectCount === 1 ? '' : 's'}</div>
                                <div className="mt-1">Updated {formatTimestamp(repo.updatedAt)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePin(repo.path);
                                    }}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                    title={isPinned ? 'Unpin' : 'Pin'}
                                >
                                    {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect(repo);
                                    }}
                                    className="p-2 text-indigo-500 hover:text-indigo-600"
                                    title="Open"
                                >
                                    <FolderGit2 className="w-4 h-4" />
                                </button>
                                {canRename && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startRename(repo);
                                        }}
                                        className="p-2 text-gray-400 hover:text-gray-600"
                                        title="Rename"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                )}
                                {canDelete && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(repo);
                                        }}
                                        className="p-2 text-red-500 hover:text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl m-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FolderGit2 className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Select Repository</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadRepositories}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        {onCreateRepository && (
                            <button
                                onClick={handleCreateRepository}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                                title="Create Repository"
                            >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search repositories..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className="px-6 py-5 max-h-[60vh] overflow-auto">
                    {(error || actionError) && (
                        <div className="mb-4 text-sm text-red-600 dark:text-red-400">{actionError || error}</div>
                    )}

                    {loading && items.length === 0 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">Loading repositories...</div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">No repositories found.</div>
                    )}

                    <div className="space-y-4">
                        {pinnedRepos.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pinned</div>
                                <div className="space-y-3">
                                    {pinnedRepos.map(renderRepoRow)}
                                </div>
                            </div>
                        )}

                        {recentRepos.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Recent</div>
                                <div className="space-y-3">
                                    {recentRepos.map(renderRepoRow)}
                                </div>
                            </div>
                        )}

                        {otherRepos.length > 0 && (
                            <div>
                                {(pinnedRepos.length > 0 || recentRepos.length > 0) && (
                                    <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">All Repositories</div>
                                )}
                                <div className="space-y-3">
                                    {otherRepos.map(renderRepoRow)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
