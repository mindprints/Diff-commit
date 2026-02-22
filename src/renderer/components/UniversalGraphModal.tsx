import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Brain, ChevronDown, FolderGit2, FileText, GitMerge, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { GraphModalShell } from './graph/GraphModalShell';
import { GraphCanvas } from './graph/GraphCanvas';
import { GraphNodeCard } from './graph/GraphNodeCard';
import { GraphNodeTooltip } from './graph/GraphNodeTooltip';
import { GraphSearchControl } from './graph/GraphSearchControl';
import { clientToGraphSpace } from './graph/graphMath';
import { Project, RepositoryInfo } from '../types';
import * as projectStorage from '../services/projectStorage';

interface UniversalGraphModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    repositoryPath: string | null;
    currentProjectId?: string | null;
    onOpenProject: (projectId: string) => Promise<void>;
    onCreateProject: (name: string, content: string, open?: boolean) => Promise<Project>;
    onSwitchRepository: (repoPath: string) => Promise<void>;
    onMoveProject: (projectId: string, targetRepoPath: string) => Promise<boolean>;
    onDeleteProject: (projectId: string) => Promise<void>;
    onNewProject: () => void;
    onOpenRepoIntel: () => void;
}

interface UniversalNodeState {
    id: string;
    x: number;
    y: number;
    projectId?: string;
}

const LAYOUT_KEY = 'diff-commit-universal-graph-layout-v1';
const DROP_REPOS_KEY = 'diff-commit-universal-drop-repos-v1';
const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const NODE_GAP_X = 24;
const NODE_GAP_Y = 28;
const PROJECT_ROW_Y = 260;

function saveLayout(nodes: UniversalNodeState[]) {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(nodes));
    } catch {
        // ignore
    }
}

function loadLayout(): UniversalNodeState[] {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((n) =>
            n &&
            typeof n.id === 'string' &&
            typeof n.x === 'number' &&
            typeof n.y === 'number' &&
            typeof n.projectId === 'string'
        ) as UniversalNodeState[];
    } catch {
        return [];
    }
}

export function UniversalGraphModal({
    isOpen,
    onClose,
    projects,
    repositoryPath,
    currentProjectId,
    onOpenProject,
    onCreateProject,
    onSwitchRepository,
    onMoveProject,
    onDeleteProject,
    onNewProject,
    onOpenRepoIntel,
}: UniversalGraphModalProps) {
    const [nodes, setNodes] = useState<UniversalNodeState[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropRepos, setDropRepos] = useState<RepositoryInfo[]>([]);
    const [dropRepoPositions, setDropRepoPositions] = useState<Record<string, { x: number; y: number }>>({});
    const [highlightRepoPath, setHighlightRepoPath] = useState<string | null>(null);
    const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
    const [flashRepoPath, setFlashRepoPath] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [mergeSelectedNodeIds, setMergeSelectedNodeIds] = useState<string[]>([]);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [draggingCanvas, setDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [sortMenuOpen, setSortMenuOpen] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const repoDropZoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const draggingDropRepoPathRef = useRef<string | null>(null);
    const dropRepoPointerRef = useRef<{ x: number; y: number } | null>(null);
    const dropRepoMovedRef = useRef(false);

    const currentRepoLabel = useMemo(() => {
        if (!repositoryPath) return 'No repository';
        const parts = repositoryPath.split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || repositoryPath;
    }, [repositoryPath]);

    const projectById = useMemo(() => {
        const map = new Map<string, Project>();
        projects.forEach((p) => map.set(`project:${p.id}`, p));
        return map;
    }, [projects]);

    const filteredNodeIds = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return new Set(nodes.map((n) => n.id));
        return new Set(
            nodes
                .filter((n) => {
                    const project = projectById.get(n.id);
                    if (!project) return false;
                    return (
                        project.name.toLowerCase().includes(q) ||
                        (project.content ?? '').toLowerCase().includes(q)
                    );
                })
                .map((n) => n.id)
        );
    }, [searchTerm, nodes, projectById]);

    const chooseFixedDropRepos = useCallback((list: RepositoryInfo[]) => {
        const byPath = new Map(list.map((repo) => [repo.path, repo]));
        const targetCount = Math.min(3, list.length);
        let selected: RepositoryInfo[] = [];

        try {
            const raw = localStorage.getItem(DROP_REPOS_KEY);
            const storedPaths = raw ? JSON.parse(raw) : [];
            if (Array.isArray(storedPaths)) {
                selected = storedPaths
                    .map((repoPath: string) => byPath.get(repoPath))
                    .filter((repo): repo is RepositoryInfo => Boolean(repo));
            }
        } catch {
            selected = [];
        }

        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        for (const repo of sorted) {
            if (selected.length >= targetCount) break;
            if (selected.some((picked) => picked.path === repo.path)) continue;
            selected.push(repo);
        }

        try {
            localStorage.setItem(DROP_REPOS_KEY, JSON.stringify(selected.map((repo) => repo.path)));
        } catch {
            // ignore localStorage write errors
        }

        return selected;
    }, []);

    const getDropRepoAt = useCallback((clientX: number, clientY: number): RepositoryInfo | null => {
        for (const repo of dropRepos) {
            const el = repoDropZoneRefs.current[repo.path];
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                return repo;
            }
        }
        return null;
    }, [dropRepos]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const loadRepos = async () => {
            try {
                const list = await projectStorage.listRepositories();
                if (cancelled) return;
                const fixed = chooseFixedDropRepos(list);
                setDropRepos(fixed);
                const stillPresent = fixed.some((repo) => repo.path === selectedRepoPath);
                if (!selectedRepoPath || !stillPresent) {
                    const nextSelected = fixed.find((repo) => repo.path === repositoryPath)?.path || fixed[0]?.path || null;
                    setSelectedRepoPath(nextSelected);
                }
            } catch {
                if (!cancelled) {
                    setDropRepos([]);
                    setSelectedRepoPath(null);
                }
            }
        };
        void loadRepos();
        return () => {
            cancelled = true;
        };
    }, [isOpen, chooseFixedDropRepos, repositoryPath, selectedRepoPath]);

    useEffect(() => {
        if (!isOpen) return;
        setDropRepoPositions((prev) => {
            const next: Record<string, { x: number; y: number }> = {};
            dropRepos.forEach((repo, idx) => {
                next[repo.path] = prev[repo.path] || {
                    x: 300 + idx * 240,
                    y: 118,
                };
            });
            return next;
        });
    }, [isOpen, dropRepos]);

    useEffect(() => {
        if (!isOpen) return;

        const onMove = (e: MouseEvent) => {
            const path = draggingDropRepoPathRef.current;
            const prevPointer = dropRepoPointerRef.current;
            if (!path || !prevPointer) return;
            const dx = e.clientX - prevPointer.x;
            const dy = e.clientY - prevPointer.y;
            if (Math.abs(dx) + Math.abs(dy) > 1) {
                dropRepoMovedRef.current = true;
            }
            dropRepoPointerRef.current = { x: e.clientX, y: e.clientY };
            setDropRepoPositions((prev) => {
                const current = prev[path] || { x: 0, y: 0 };
                return {
                    ...prev,
                    [path]: { x: current.x + dx, y: current.y + dy },
                };
            });
        };
        const onUp = () => {
            draggingDropRepoPathRef.current = null;
            dropRepoPointerRef.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const stored = loadLayout();
        const storedById = new Map(stored.map((n) => [n.id, n]));

        const cols = Math.max(1, Math.ceil(Math.sqrt(projects.length || 1)));
        const projectNodes: UniversalNodeState[] = projects.map((project, idx) => {
            const id = `project:${project.id}`;
            const saved = storedById.get(id);
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
                id,
                projectId: project.id,
                x: saved?.x ?? (80 + col * (NODE_WIDTH + NODE_GAP_X)),
                y: saved?.y ?? (PROJECT_ROW_Y + row * (NODE_HEIGHT + NODE_GAP_Y)),
            };
        });

        setNodes(projectNodes);
        setOffset({ x: 0, y: 0 });
        setScale(1);
        setSelectedNodeId(null);
        setMergeSelectedNodeIds([]);
        setHoveredNodeId(null);
        setDraggingNodeId(null);
        setDraggingCanvas(false);
    }, [isOpen, projects, repositoryPath]);

    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => saveLayout(nodes), 300);
        return () => clearTimeout(t);
    }, [isOpen, nodes]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isOpen) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = -e.deltaY * 0.001;
                setScale((prev) => Math.min(Math.max(0.2, prev + delta), 3));
            } else {
                setOffset((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, [isOpen]);

    useEffect(() => {
        if (!sortMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!sortMenuRef.current?.contains(event.target as Node)) {
                setSortMenuOpen(false);
            }
        };
        window.addEventListener('mousedown', handlePointerDown);
        return () => window.removeEventListener('mousedown', handlePointerDown);
    }, [sortMenuOpen]);

    // Handle flashRepoPath expiration (prevent state updates on unmounted component)
    useEffect(() => {
        if (!flashRepoPath) return;
        const timer = setTimeout(() => {
            setFlashRepoPath(null);
        }, 600);
        return () => clearTimeout(timer);
    }, [flashRepoPath]);

    const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string | null) => {
        if (e.button !== 0) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const world = clientToGraphSpace(e.clientX, e.clientY, rect, offset, scale);

        if (nodeId) {
            e.stopPropagation();
            if (e.detail >= 2) {
                const project = projectById.get(nodeId);
                if (project?.id) {
                    void onOpenProject(project.id);
                }
                setDraggingNodeId(null);
                setDraggingCanvas(false);
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                setSelectedNodeId(nodeId);
                setMergeSelectedNodeIds((prev) => (
                    prev.includes(nodeId)
                        ? prev.filter((id) => id !== nodeId)
                        : [...prev, nodeId]
                ));
                setDraggingNodeId(null);
                setDraggingCanvas(false);
                return;
            }
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setSelectedNodeId(nodeId);
            setDraggingNodeId(nodeId);
            setDraggingCanvas(false);
            setDragStart({ x: world.x - node.x, y: world.y - node.y });
            return;
        }

        setSelectedNodeId(null);
        setDraggingNodeId(null);
        setDraggingCanvas(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }, [nodes, offset, scale, onOpenProject, projectById]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (draggingNodeId) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const world = clientToGraphSpace(e.clientX, e.clientY, rect, offset, scale);
            setNodes((prev) =>
                prev.map((n) =>
                    n.id === draggingNodeId ? { ...n, x: world.x - dragStart.x, y: world.y - dragStart.y } : n
                )
            );
            const dropRepo = getDropRepoAt(e.clientX, e.clientY);
            setHighlightRepoPath(dropRepo?.path ?? null);
        } else if (draggingCanvas) {
            setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    }, [draggingNodeId, draggingCanvas, dragStart, offset, scale, getDropRepoAt]);

    const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
        if (draggingNodeId) {
            const dropRepo = getDropRepoAt(e.clientX, e.clientY);
            if (dropRepo && dropRepo.path !== repositoryPath) {
                const draggedNode = nodes.find((n) => n.id === draggingNodeId);
                if (draggedNode?.projectId) {
                    try {
                        const moved = await onMoveProject(draggedNode.projectId, dropRepo.path);
                        if (!moved) {
                            setDraggingNodeId(null);
                            setDraggingCanvas(false);
                            setHighlightRepoPath(null);
                            return;
                        }
                    } catch (error) {
                        console.error('Failed to move project across repositories:', error);
                        setDraggingNodeId(null);
                        setDraggingCanvas(false);
                        setHighlightRepoPath(null);
                        return;
                    }
                }
                setFlashRepoPath(dropRepo.path);
            }
        }
        setDraggingNodeId(null);
        setDraggingCanvas(false);
        setHighlightRepoPath(null);
    }, [draggingNodeId, nodes, getDropRepoAt, onMoveProject, repositoryPath]);

    const relayoutNodes = useCallback((sortBy: 'name' | 'date') => {
        const sortedProjects = [...projects].sort((a, b) => {
            if (sortBy === 'date') {
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            }
            return a.name.localeCompare(b.name);
        });

        const cols = Math.max(1, Math.ceil(Math.sqrt(sortedProjects.length || 1)));
        setNodes(sortedProjects.map((project, idx) => {
            const id = `project:${project.id}`;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
                id,
                projectId: project.id,
                x: 80 + col * (NODE_WIDTH + NODE_GAP_X),
                y: PROJECT_ROW_Y + row * (NODE_HEIGHT + NODE_GAP_Y),
            };
        }));

        setOffset({ x: 0, y: 0 });
        setScale(1);
        setSortMenuOpen(false);
    }, [projects]);

    const handleMergeSelected = useCallback(async () => {
        if (mergeSelectedNodeIds.length < 2) {
            alert('Please select at least 2 projects to merge (Ctrl/Cmd+Click).');
            return;
        }

        const selectedProjects = mergeSelectedNodeIds
            .map((nodeId) => projectById.get(nodeId))
            .filter((project): project is Project => Boolean(project));

        if (selectedProjects.length < 2) {
            alert('Please select at least 2 valid projects to merge.');
            return;
        }

        let mergedContent = '';
        for (const project of selectedProjects) {
            mergedContent += `\n\n--- Content from ${project.name} ---\n\n`;
            mergedContent += project.content || '';
        }

        const mergedName = `Merged ${selectedProjects.map((p) => p.name).join('-')}`;

        try {
            const mergedProject = await onCreateProject(mergedName, mergedContent.trim(), false);
            setMergeSelectedNodeIds([]);
            setSelectedNodeId(null);
            await onOpenProject(mergedProject.id);
        } catch (error) {
            console.error('Failed to create merged project:', error);
            alert(error instanceof Error ? error.message : 'Failed to create merged project.');
        }
    }, [mergeSelectedNodeIds, onCreateProject, onOpenProject, projectById]);

    const renderedNodes = useMemo(() => {
        return nodes
            .filter((n) => filteredNodeIds.has(n.id))
            .sort((a, b) => {
                if (draggingNodeId === a.id) return 1;
                if (draggingNodeId === b.id) return -1;
                return 0;
            });
    }, [nodes, filteredNodeIds, draggingNodeId]);

    if (!isOpen) return null;

    return (
        <GraphModalShell
            controls={
                <>
                    <button
                        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 font-medium text-sm text-gray-700 dark:text-slate-200"
                        onClick={onClose}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Return to Editor
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1" />
                    <GraphSearchControl
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search projects..."
                        inputClassName="text-gray-800 dark:text-slate-100"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onNewProject}
                        icon={<Plus className="w-3.5 h-3.5" />}
                    >
                        New Project
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenRepoIntel}
                        icon={<Brain className="w-3.5 h-3.5" />}
                    >
                        Repo Intel
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMergeSelected}
                        icon={<GitMerge className="w-3.5 h-3.5" />}
                        disabled={mergeSelectedNodeIds.length < 2}
                        title={mergeSelectedNodeIds.length < 2 ? 'Ctrl/Cmd+Click at least 2 projects to merge' : `Merge ${mergeSelectedNodeIds.length} selected projects`}
                    >
                        {mergeSelectedNodeIds.length > 0 ? `Merge (${mergeSelectedNodeIds.length})` : 'Merge'}
                    </Button>
                    <div className="relative" ref={sortMenuRef}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSortMenuOpen((prev) => !prev)}
                            icon={<ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', sortMenuOpen && 'rotate-180')} />}
                        >
                            Sort
                        </Button>
                        {sortMenuOpen && (
                            <div className="absolute right-0 top-10 z-[120] w-40 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1">
                                <button
                                    className="w-full text-left px-3 py-2 text-sm rounded-md text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"
                                    onClick={() => relayoutNodes('name')}
                                >
                                    Sort by Name
                                </button>
                                <button
                                    className="w-full text-left px-3 py-2 text-sm rounded-md text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"
                                    onClick={() => relayoutNodes('date')}
                                >
                                    Sort by Date
                                </button>
                                <div className="my-1 h-px bg-gray-200 dark:bg-slate-700" />
                                <button
                                    className="w-full text-left px-3 py-2 text-sm rounded-md text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center gap-2"
                                    onClick={() => {
                                        setScale(1);
                                        setOffset({ x: 0, y: 0 });
                                        setSortMenuOpen(false);
                                    }}
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Reset View
                                </button>
                            </div>
                        )}
                    </div>
                </>
            }
            topBar={
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 text-xs">
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">Universal Graph Prototype</span>
                    <span className="text-indigo-600 dark:text-indigo-400">Current repo: {currentRepoLabel}</span>
                    <span className="text-indigo-600 dark:text-indigo-400">Click a repo zone to load its projects</span>
                </div>
            }
        >
            <GraphCanvas
                canvasRef={canvasRef}
                offset={offset}
                scale={scale}
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {renderedNodes.map((node) => {
                    const project = projectById.get(node.id);
                    if (!project) return null;
                    const title = project.name || 'Project';
                    const subtitle = new Date(project.updatedAt || Date.now()).toLocaleDateString();
                    const isCurrentProject = project.id === currentProjectId;
                    const isMergeSelected = mergeSelectedNodeIds.includes(node.id);
                    const zIndex = draggingNodeId === node.id
                        ? 90
                        : isMergeSelected
                            ? 80
                            : selectedNodeId === node.id
                                ? 70
                                : hoveredNodeId === node.id
                                    ? 60
                                    : 30;

                    return (
                        <GraphNodeCard
                            key={node.id}
                            x={node.x}
                            y={node.y}
                            zIndex={zIndex}
                            className={clsx(
                                'border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30',
                                isMergeSelected && 'ring-2 ring-violet-400 border-violet-400 dark:ring-violet-500 dark:border-violet-500',
                                isCurrentProject && 'ring-2 ring-emerald-400 dark:ring-emerald-500',
                                draggingNodeId === node.id && 'opacity-70 scale-105'
                            )}
                            onMouseDown={(e) => handleMouseDown(e, node.id)}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            header={
                                <>
                                    <FileText className="w-4 h-4 text-emerald-500" />
                                    <div className="project-node-title" title={title}>{title}</div>
                                </>
                            }
                            body={
                                <div className="project-node-meta">
                                    <div className="truncate" title={subtitle}>{subtitle}</div>
                                    <div className="text-[10px] text-gray-400 dark:text-slate-400">
                                        Double-click to open in editor
                                    </div>
                                </div>
                            }
                            overlay={
                                <div className="absolute top-2 right-2 flex items-center gap-1">
                                    <button
                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!confirm(`Delete project "${title}"?`)) return;
                                            void onDeleteProject(project.id);
                                            if (selectedNodeId === node.id) {
                                                setSelectedNodeId(null);
                                            }
                                            if (hoveredNodeId === node.id) {
                                                setHoveredNodeId(null);
                                            }
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        title="Delete project"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                                    </button>
                                </div>
                            }
                            tooltip={!draggingNodeId && (hoveredNodeId === node.id || selectedNodeId === node.id) ? (
                                <GraphNodeTooltip
                                    title="Project"
                                    subtitle={selectedNodeId === node.id ? 'Selected' : 'Preview'}
                                    persistent={selectedNodeId === node.id}
                                >
                                    <>
                                        <div className="text-[11px] font-semibold mb-1">Content Preview</div>
                                        <div className="whitespace-pre-wrap">
                                            {(project?.content || '(Empty)').slice(0, 600)}
                                        </div>
                                    </>
                                </GraphNodeTooltip>
                            ) : undefined}
                        />
                    );
                })}
            </GraphCanvas>

            {dropRepos.length > 0 && (
                <div className="absolute inset-0 z-[60] pointer-events-none">
                    {dropRepos.map((repo) => {
                        const active = highlightRepoPath === repo.path;
                        const position = dropRepoPositions[repo.path] || { x: 300, y: 118 };
                        return (
                            <div
                                key={repo.path}
                                ref={(el) => { repoDropZoneRefs.current[repo.path] = el; }}
                                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                                className={clsx(
                                    'absolute w-56 rounded-xl border-2 border-dashed p-4 transition-all duration-200 backdrop-blur-sm pointer-events-auto cursor-grab active:cursor-grabbing',
                                    'bg-fuchsia-100/85 dark:bg-fuchsia-900/35',
                                    active
                                        ? 'border-fuchsia-500 scale-105 shadow-lg shadow-fuchsia-300/40 dark:shadow-fuchsia-800/50'
                                        : 'border-fuchsia-300 dark:border-fuchsia-700',
                                    selectedRepoPath === repo.path && 'border-yellow-400 dark:border-yellow-500',
                                    flashRepoPath === repo.path && 'animate-pulse bg-yellow-100 dark:bg-yellow-900/40'
                                )}
                                onMouseDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    draggingDropRepoPathRef.current = repo.path;
                                    dropRepoPointerRef.current = { x: e.clientX, y: e.clientY };
                                    dropRepoMovedRef.current = false;
                                }}
                                onClick={() => {
                                    if (dropRepoMovedRef.current) {
                                        dropRepoMovedRef.current = false;
                                        return;
                                    }
                                    setSelectedRepoPath(repo.path);
                                    setFlashRepoPath(repo.path);
                                    onSwitchRepository(repo.path).catch((err) => {
                                        console.error('Failed to switch repository:', err);
                                    });
                                }}
                                title={repo.path}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <FolderGit2 className={clsx('w-4 h-4', active ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-fuchsia-500 dark:text-fuchsia-400')} />
                                    <span className="text-xs font-semibold text-fuchsia-900 dark:text-fuchsia-100 truncate">{repo.name}</span>
                                </div>
                                <p className="text-[10px] text-fuchsia-700/90 dark:text-fuchsia-200/90 leading-snug">
                                    Click to load. Drop a project to move it here.
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </GraphModalShell>
    );
}
