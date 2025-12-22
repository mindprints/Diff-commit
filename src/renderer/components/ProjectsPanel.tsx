import React, { useState } from 'react';
import { X, FolderOpen, Plus, Trash2, Edit2, Check, FileText } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { Project } from '../types';

interface ProjectsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    currentProject: Project | null;
    onLoadProject: (id: string) => Promise<Project | null>;
    onCreateProject: (name: string, content?: string) => Promise<Project>;
    onDeleteProject: (id: string) => Promise<void>;
    onRenameProject: (id: string, newName: string) => Promise<Project | null>;
    onOpenRepository: () => Promise<void>;
    onCreateRepository?: () => Promise<void>;
    repositoryPath: string | null;
}

export function ProjectsPanel({
    isOpen,
    onClose,
    projects,
    currentProject,
    onLoadProject,
    onCreateProject,
    onDeleteProject,
    onRenameProject,
    onOpenRepository,
    onCreateRepository,
    repositoryPath,
}: ProjectsPanelProps) {
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);

    if (!isOpen) return null;

    const handleCreate = async () => {
        if (!newProjectName.trim()) return;
        // Create new project with EMPTY content - don't inherit residue from previous session
        await onCreateProject(newProjectName.trim(), '');
        setNewProjectName('');
        setIsCreating(false);
    };

    const handleLoad = async (id: string) => {
        await onLoadProject(id);
        onClose();
    };

    const handleStartRename = (project: Project) => {
        setEditingId(project.id);
        setEditingName(project.name);
    };

    const handleRename = async () => {
        if (editingId && editingName.trim()) {
            await onRenameProject(editingId, editingName.trim());
        }
        setEditingId(null);
        setEditingName('');
    };

    const handleDelete = async (id: string) => {
        await onDeleteProject(id);
        setDeleteConfirmId(null);
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg max-h-[80vh] m-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex-none px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-950">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Projects</h2>
                        </div>
                        {/* Repository section */}
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-slate-400">Repo:</span>
                            {repositoryPath ? (
                                <span className="text-xs text-indigo-600 dark:text-indigo-400 truncate max-w-[180px]" title={repositoryPath}>
                                    {repositoryPath.split(/[\\/]/).pop() || repositoryPath}
                                </span>
                            ) : (
                                <span className="text-xs text-gray-400 dark:text-slate-500 italic">No Repo</span>
                            )}
                            {!repositoryPath && (
                                <div className="flex gap-1">
                                    {onCreateRepository && (
                                        <button
                                            onClick={async () => await onCreateRepository()}
                                            className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                        >
                                            Create
                                        </button>
                                    )}
                                    <button
                                        onClick={async () => await onOpenRepository()}
                                        className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        Open
                                    </button>
                                </div>
                            )}
                        </div>
                        {/* Project section */}
                        {repositoryPath && (
                            <div className="flex items-center gap-2 mt-1 relative">
                                <span className="text-xs text-gray-500 dark:text-slate-400">Project:</span>
                                <button
                                    onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                    {currentProject?.name || <span className="italic text-gray-400 dark:text-slate-500">Unsaved Project</span>}
                                    <span className="text-gray-400">▼</span>
                                </button>
                                {showProjectDropdown && (
                                    <div className="absolute left-16 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-50">
                                        {projects.length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500 italic">No projects yet</div>
                                        ) : (
                                            projects.map((project) => (
                                                <button
                                                    key={project.id}
                                                    className={clsx(
                                                        "w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors",
                                                        currentProject?.id === project.id && "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                                                    )}
                                                    onClick={async () => {
                                                        await onLoadProject(project.id);
                                                        setShowProjectDropdown(false);
                                                    }}
                                                >
                                                    {project.name}
                                                </button>
                                            ))
                                        )}
                                        <div className="border-t border-gray-100 dark:border-slate-700 mt-1 pt-1">
                                            <button
                                                className="w-full text-left px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center gap-1"
                                                onClick={() => {
                                                    setShowProjectDropdown(false);
                                                    setIsCreating(true);
                                                }}
                                            >
                                                <Plus className="w-3 h-3" />
                                                New Project
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsCreating(true)}
                            icon={<Plus className="w-4 h-4" />}
                            disabled={!repositoryPath}
                            title={!repositoryPath ? 'Open or create a repository first' : 'Create new project'}
                        >
                            New
                        </Button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* New Project Form */}
                {isCreating && (
                    <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="Project name..."
                                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-slate-100"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') setIsCreating(false);
                                }}
                            />
                            <Button variant="primary" size="sm" onClick={handleCreate}>
                                Create
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
                                Cancel
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                            New projects start with a clean slate.
                        </p>
                    </div>
                )}

                {/* Projects List */}
                <div className="flex-1 overflow-y-auto">
                    {projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-gray-400 dark:text-slate-500">
                            <FileText className="w-12 h-12 mb-4 opacity-50" />
                            {repositoryPath ? (
                                <>
                                    <p className="text-lg font-medium">No projects yet</p>
                                    <p className="text-sm text-center px-4">Click <span className="text-indigo-500 font-medium">+New</span> above to create your first project in this repo.</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-lg font-medium">No repository selected</p>
                                    <p className="text-sm text-center px-4">First <span className="text-indigo-500 font-medium">Create</span> or <span className="text-indigo-500 font-medium">Open</span> a repository above, then create projects inside it.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-slate-800">
                            {sortedProjects.map((project) => (
                                <div
                                    key={project.id}
                                    className={clsx(
                                        "px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group",
                                        currentProject?.id === project.id && "bg-indigo-50 dark:bg-indigo-950/20 border-l-4 border-indigo-500"
                                    )}
                                    onClick={() => {
                                        // Don't trigger load when editing or confirming delete
                                        if (editingId !== project.id && deleteConfirmId !== project.id) {
                                            handleLoad(project.id);
                                        }
                                    }}
                                >
                                    {editingId === project.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                className="flex-1 px-2 py-1 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-slate-100"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename();
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                            />
                                            <button
                                                onClick={handleRename}
                                                className="p-1 text-green-500 hover:text-green-700"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : deleteConfirmId === project.id ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-red-600 dark:text-red-400">
                                                Delete "{project.name}"?
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(project.id)}
                                                    className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                                >
                                                    Delete
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteConfirmId(null)}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                                                    <h3 className="font-medium text-gray-900 dark:text-slate-100 truncate">
                                                        {project.name}
                                                    </h3>
                                                    {currentProject?.id === project.id && (
                                                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                                                    Updated {formatDate(project.updatedAt)}
                                                </p>
                                            </div>
                                            <div
                                                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => handleStartRename(project)}
                                                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                                    title="Rename"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(project.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-none px-6 py-3 bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 text-center">
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                        {projects.length} project{projects.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>
        </div>
    );
}
