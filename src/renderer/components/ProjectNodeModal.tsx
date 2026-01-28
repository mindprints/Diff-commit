import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useProject } from '../contexts';
import { X, GitMerge, FileText, Trash2, ArrowLeft, RotateCcw, Plus, Edit2, MoreVertical, FolderGit2, GitCommit } from 'lucide-react';
import { Button } from './Button';
import { loadGraphData, saveGraphData, getTopologicalSort } from '../services/graphService';
import { CreateNodeDialog } from './CreateNodeDialog';
import './ProjectNodeModal.css';
import { Project } from '../types';

interface ProjectNodeModalProps {
    isOpen: boolean;
    onClose: () => void;
}


// Entity types for visual differentiation
type EntityType = 'repository' | 'project' | 'commit';

interface NodeState {
    id: string;
    x: number;
    y: number;
    entityType?: EntityType; // Defaults to 'project' for backward compatibility
}

interface Edge {
    from: string;
    to: string;
}

// Entity visual styling configuration
const ENTITY_STYLES: Record<EntityType, {
    color: string;
    bgClass: string;
    borderClass: string;
    iconColor: string;
    label: string;
}> = {
    repository: {
        color: 'indigo',
        bgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
        borderClass: 'border-indigo-300 dark:border-indigo-600',
        iconColor: 'text-indigo-500',
        label: 'Repo'
    },
    project: {
        color: 'emerald',
        bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
        borderClass: 'border-emerald-300 dark:border-emerald-600',
        iconColor: 'text-emerald-500',
        label: 'Project'
    },
    commit: {
        color: 'amber',
        bgClass: 'bg-amber-50 dark:bg-amber-900/20',
        borderClass: 'border-amber-300 dark:border-amber-600',
        iconColor: 'text-amber-500',
        label: 'Version'
    }
};

// Constants for Node Layout
const NODE_WIDTH = 200;
const NODE_HEIGHT = 100; // Approximate
const GAP_X = 20;
const GAP_Y = 50;
const NODE_SPACING_X = NODE_WIDTH + GAP_X;
const NODE_SPACING_Y = NODE_HEIGHT + GAP_Y;

// Helper: Escape regex special characters
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper: Highlight text component
const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight || !highlight.trim()) {
        return <>{text}</>;
    }
    const escapedHighlight = escapeRegExp(highlight);
    const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 dark:bg-yellow-900 text-black dark:text-white rounded-sm px-0.5">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
};

// Helper: Entity icon component based on type
const EntityIcon = ({ type, className }: { type: EntityType; className?: string }) => {
    const style = ENTITY_STYLES[type];
    const iconClass = `w-4 h-4 ${style.iconColor} ${className || ''}`;

    switch (type) {
        case 'repository':
            return <FolderGit2 className={iconClass} />;
        case 'commit':
            return <GitCommit className={iconClass} />;
        case 'project':
        default:
            return <FileText className={iconClass} />;
    }
};

export function ProjectNodeModal({ isOpen, onClose }: ProjectNodeModalProps) {
    const { currentProject, projects, createNewProject, repositoryPath, handleLoadProject, deleteProject, renameProject, refreshProjects } = useProject();

    // Canvas State
    const [nodes, setNodes] = useState<NodeState[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);

    // Interaction State
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    const [draggingCanvas, setDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Wire Creation State (Shift + Drag)
    const [creatingEdge, setCreatingEdge] = useState<{ from: string, curX: number, curY: number } | null>(null);

    // Tooltup State
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoverContent, setHoverContent] = useState<string>('');

    // Merge Selection
    const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());

    // Search State
    const [searchTerm, setSearchTerm] = useState('');

    // CRUD State
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

    const filteredNodes = useMemo(() => {
        if (!searchTerm) return nodes;
        const term = searchTerm.toLowerCase();
        return nodes.filter(n => {
            const p = projects.find(proj => proj.id === n.id);
            if (!p) return false;

            const nameMatch = p.name.toLowerCase().includes(term);
            const contentMatch = p.content && p.content.toLowerCase().includes(term);

            return nameMatch || contentMatch;
        });
    }, [nodes, projects, searchTerm]);

    const canvasRef = useRef<HTMLDivElement>(null);

    // Initial Load & Reset Layout Helper
    const initializeLayout = useCallback(async (forced: boolean = false) => {
        if (!repositoryPath) return;

        const data = await loadGraphData(repositoryPath);
        // If forced reset, ignore loaded nodes positions but keep edges? 
        // Or reset completely? Let's keep edges but reset positions.

        const existingProjectIds = new Set(projects.map(p => p.id));

        let validNodes: NodeState[] = [];
        let validEdges: Edge[] = [];

        if (!forced) {
            validNodes = data.nodes.filter(n => existingProjectIds.has(n.id));
            validEdges = data.edges.filter(e => existingProjectIds.has(e.from) && existingProjectIds.has(e.to));
        } else {
            // Keep edges if possible
            validEdges = data.edges.filter(e => existingProjectIds.has(e.from) && existingProjectIds.has(e.to));
        }

        const knownNodes = new Set(validNodes.map(n => n.id));

        // Helper to check collision
        const isColliding = (x: number, y: number) => {
            return validNodes.some(n =>
                Math.abs(n.x - x) < NODE_SPACING_X && Math.abs(n.y - y) < NODE_SPACING_Y
            );
        };

        // Add new projects (or all if forced) at non-overlapping positions
        projects.forEach(p => {
            if (!knownNodes.has(p.id)) {
                let x = 50;
                let y = 50;
                let attempts = 0;
                const maxAttempts = 100;

                // Find a free spot
                while (isColliding(x, y) && attempts < maxAttempts) {
                    x += NODE_SPACING_X; // Move right
                    if (x > 800) { // New row
                        x = 50;
                        y += NODE_SPACING_Y;
                    }
                    attempts++;
                }

                validNodes.push({ id: p.id, x, y });
            }
        });

        setNodes(validNodes);
        setEdges(validEdges);
        // Reset view
        if (forced) {
            setOffset({ x: 0, y: 0 });
            setScale(1);
        }
    }, [repositoryPath, projects]);

    useEffect(() => {
        if (isOpen) {
            initializeLayout(false);
        }
    }, [isOpen, initializeLayout]);

    // Save on changes
    useEffect(() => {
        if (isOpen && repositoryPath && nodes.length > 0) {
            const timeout = setTimeout(() => {
                saveGraphData(repositoryPath, { nodes, edges });
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [nodes, edges, repositoryPath, isOpen]);

    // Native Wheel Listener for passive: false
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setDraggingCanvas(false);
                const delta = -e.deltaY * 0.001;
                setScale(prev => Math.min(Math.max(0.1, prev + delta), 4));
            } else {
                setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, []);

    // --- Interaction Handlers ---

    const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string | null) => {
        if (e.button !== 0) return; // Only left click

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (nodeId) {
            if (e.shiftKey) {
                // Start creating edge
                e.stopPropagation();
                setCreatingEdge({ from: nodeId, curX: x, curY: y });
            } else {
                // Start dragging node
                e.stopPropagation();
                setDraggingNode(nodeId);
                setDragStart({ x: x - (nodes.find(n => n.id === nodeId)?.x || 0), y: y - (nodes.find(n => n.id === nodeId)?.y || 0) });

                // Select logic
                setSelectedNodes(prev => {
                    const next = new Set(prev);
                    if (e.ctrlKey) {
                        if (next.has(nodeId)) next.delete(nodeId);
                        else next.add(nodeId);
                    } else {
                        // Toggle if already selected (and only this one is selected), otherwise select exclusively
                        if (next.has(nodeId) && next.size === 1) {
                            next.clear();
                        } else {
                            next.clear();
                            next.add(nodeId);
                        }
                    }
                    return next;
                });
            }
        } else {
            // Drag canvas
            setDraggingCanvas(true);
            setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
            // Clear selection if clicking background
            if (!e.ctrlKey) setSelectedNodes(new Set());
        }
    }, [nodes, offset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (draggingNode) {
            setNodes(prev => prev.map(n =>
                n.id === draggingNode
                    ? { ...n, x: x - dragStart.x, y: y - dragStart.y }
                    : n
            ));
        } else if (draggingCanvas) {
            setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        } else if (creatingEdge) {
            setCreatingEdge(prev => prev ? { ...prev, curX: x, curY: y } : null);
        }
    }, [draggingNode, draggingCanvas, creatingEdge, dragStart]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        if (creatingEdge) {
            // Check if dropped on a node
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Find node under mouse
                const targetNode = nodes.find(n =>
                    x >= n.x && x <= n.x + 200 && // Width 200
                    y >= n.y && y <= n.y + 100    // Height rough approx, check CSS
                );

                if (targetNode && targetNode.id !== creatingEdge.from) {
                    // Create Edge (avoid duplicates)
                    if (!edges.some(edge => edge.from === creatingEdge.from && edge.to === targetNode.id)) {
                        setEdges(prev => [...prev, { from: creatingEdge.from, to: targetNode.id }]);
                    }
                }
            }
        }

        setDraggingNode(null);
        setDraggingCanvas(false);
        setCreatingEdge(null);
    }, [creatingEdge, nodes, edges]);

    const handleNodeHover = async (id: string) => {
        setHoveredNode(id);
        const project = projects.find(p => p.id === id);
        if (project) {
            // Try to use content from project object first (draft content)
            let content = project.content;

            // If empty, it might be because we only have metadata. 
            // We should try to load it via IPC if possible, but that's async and might be slow for hover.
            // Requirement was "most recent commit content".
            // If we are in Electron, we might be able to peek.
            // But for now, let's just make sure we are not showing "undefined".

            if (!content) {
                content = "(No content or empty draft)";
                // Ideally trigger a fetch here if we had a lightweight fetcher
            }

            setHoverContent(content.slice(0, 500) + (content.length > 500 ? '...' : ''));
        }
    };

    const handleMerge = async () => {
        if (selectedNodes.size < 2 && edges.length === 0) return;

        const nodesToMerge: string[] = Array.from(selectedNodes);

        if (nodesToMerge.length < 2) {
            alert("Please select at least 2 nodes to merge (Ctrl+Click)");
            return;
        }

        const relevantEdges = edges.filter(e => selectedNodes.has(e.from) && selectedNodes.has(e.to));
        const sortedIds = getTopologicalSort(nodesToMerge, relevantEdges);

        if (!sortedIds) {
            alert("Cannot merge: Cycle detected in selection!");
            return;
        }

        let mergedContent = "";
        const projectMap = new Map<string, Project>(projects.map(p => [p.id, p]));

        // Calculate average position (center of mass) for the new node
        let avgX = 0;
        let avgY = 0;
        let count = 0;

        sortedIds.forEach((id) => {
            const p = projectMap.get(id);
            if (p) {
                mergedContent += `\n\n--- Content from ${p.name} ---\n\n`;
                mergedContent += p.content;
            }
            const n = nodes.find(node => node.id === id);
            if (n) {
                avgX += n.x;
                avgY += n.y;
                count++;
            }
        });

        // Place new node slightly offset from the center of mass
        // Place new node slightly offset from the center of mass, checking for collisions
        let newX = count > 0 ? (avgX / count) + 50 : 50;
        let newY = count > 0 ? (avgY / count) + 50 : 50;

        // Simple collision avoidance
        let collision = true;
        let attempts = 0;
        while (collision && attempts < 10) {
            collision = nodes.some(n => Math.abs(n.x - newX) < NODE_SPACING_X && Math.abs(n.y - newY) < NODE_SPACING_Y);
            if (collision) {
                newX += GAP_X + 10;
                newY += GAP_Y + 10;
                attempts++;
            }
        }

        // Create new Project
        const newName = `Merged ${sortedIds.map(id => projectMap.get(id)?.name).join('-')}`;
        let newProject;
        try {
            // Pass open: false to avoid auto-setting currentProject before we're ready
            newProject = await createNewProject(newName, mergedContent.trim(), false);
        } catch (error) {
            console.error('Failed to create merged project:', error);
            alert('Failed to create merged project. Please try again.');
            return;
        }

        if (!newProject?.id) {
            alert('Failed to create merged project. Please try again.');
            return;
        }

        // Explicitly load the project to update Editor state (content)
        await handleLoadProject(newProject.id);

        // Update Graph State
        // Check if node already exists (race condition with initializeLayout)
        setNodes(prev => {
            if (prev.some(n => n.id === newProject.id)) return prev;
            return [...prev, { id: newProject.id, x: newX, y: newY }];
        });

        // Add edges
        const newEdges: Edge[] = [];
        sortedIds.forEach(id => {
            // Check if edge already exists
            if (!edges.some(e => e.from === id && e.to === newProject.id)) {
                newEdges.push({ from: id, to: newProject.id });
            }
        });

        setEdges(prev => [...prev, ...newEdges]);

        // Clear selection
        setSelectedNodes(new Set());
    };

    // CRUD: Delete nodes (projects)
    const handleDeleteNodes = useCallback(async () => {
        if (deleteConfirmId) {
            // Single node deletion from confirmation
            const nodeId = deleteConfirmId;
            try {
                await deleteProject(nodeId);
                setNodes(prev => prev.filter(n => n.id !== nodeId));
                setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
                setSelectedNodes(prev => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            } catch (error) {
                console.error('Failed to delete project:', error);
            }
            setDeleteConfirmId(null);
        } else if (selectedNodes.size > 0) {
            // Show confirmation for selected nodes
            if (selectedNodes.size === 1) {
                setDeleteConfirmId(Array.from(selectedNodes)[0]);
            } else {
                // Multiple selection - confirm all
                const confirmed = window.confirm(`Delete ${selectedNodes.size} projects? This cannot be undone.`);
                if (confirmed) {
                    for (const nodeId of selectedNodes) {
                        try {
                            await deleteProject(nodeId);
                        } catch (error) {
                            console.error('Failed to delete project:', nodeId, error);
                        }
                    }
                    setNodes(prev => prev.filter(n => !selectedNodes.has(n.id)));
                    setEdges(prev => prev.filter(e => !selectedNodes.has(e.from) && !selectedNodes.has(e.to)));
                    setSelectedNodes(new Set());
                }
            }
        }
    }, [deleteConfirmId, selectedNodes, deleteProject]);

    // CRUD: Start inline rename
    const handleStartRename = useCallback((nodeId: string) => {
        const project = projects.find(p => p.id === nodeId);
        if (project) {
            setRenamingNodeId(nodeId);
            setRenameValue(project.name);
        }
        setContextMenu(null);
    }, [projects]);

    // CRUD: Confirm rename
    const handleConfirmRename = useCallback(async () => {
        if (!renamingNodeId || !renameValue.trim()) {
            setRenamingNodeId(null);
            return;
        }

        try {
            const updated = await renameProject(renamingNodeId, renameValue.trim());
            if (updated) {
                // Update node ID if the project ID changed (folder rename)
                setNodes(prev => prev.map(n =>
                    n.id === renamingNodeId ? { ...n, id: updated.id } : n
                ));
                setEdges(prev => prev.map(e => ({
                    from: e.from === renamingNodeId ? updated.id : e.from,
                    to: e.to === renamingNodeId ? updated.id : e.to
                })));
                setSelectedNodes(prev => {
                    if (prev.has(renamingNodeId)) {
                        const next = new Set(prev);
                        next.delete(renamingNodeId);
                        next.add(updated.id);
                        return next;
                    }
                    return prev;
                });
            }
        } catch (error) {
            console.error('Failed to rename project:', error);
        }
        setRenamingNodeId(null);
    }, [renamingNodeId, renameValue, renameProject]);

    // CRUD: Context menu
    const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    }, []);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [contextMenu]);

    // Legacy delete - remove edges only (for edge cleanup)
    const deleteEdgesOnly = useCallback(() => {
        if (selectedNodes.size > 0) {
            setEdges(prev => prev.filter(e => !selectedNodes.has(e.from) && !selectedNodes.has(e.to)));
            setSelectedNodes(new Set());
        }
    }, [selectedNodes]);



    if (!isOpen) return null;

    return (
        <div className="project-node-modal">
            {/* Toolbar */}
            <div className="modal-controls">
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowCreateDialog(true)}
                    icon={<Plus className="w-4 h-4" />}
                    disabled={!repositoryPath}
                    title={!repositoryPath ? 'Open a repository first' : 'Create new project'}
                >
                    New
                </Button>
                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1" />
                <div className="relative mr-2">
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 pl-3 pr-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1" />
                <Button variant="ghost" onClick={() => initializeLayout(true)} title="Reset Node Positions">
                    <RotateCcw className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1" />
                <Button variant="ghost" onClick={deleteEdgesOnly} disabled={selectedNodes.size === 0} title="Remove Edges (connections only)">
                    <X className="w-4 h-4" />
                </Button>
                <Button variant="ghost" onClick={handleDeleteNodes} disabled={selectedNodes.size === 0} title="Delete Selected Projects">
                    <Trash2 className="w-4 h-4" />
                </Button>
                <Button variant="primary" onClick={handleMerge} icon={<GitMerge className="w-4 h-4" />}>
                    Merge Selected
                </Button>
            </div>

            {/* Return Button */}
            <div className="modal-close flex items-center gap-2">
                <button
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 font-medium text-sm text-gray-700 dark:text-slate-200"
                    onClick={onClose}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Return to {currentProject?.name ? currentProject.name : 'Editor'}
                </button>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className="project-node-canvas"
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        transformOrigin: '0 0',
                        width: '100%',
                        height: '100%'
                    }}
                >
                    {/* Edges Layer */}
                    <svg className="graph-svg-layer" style={{ overflow: 'visible' }}>
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="280" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                            </marker>
                        </defs>
                        {edges.map((edge, idx) => {
                            const source = nodes.find(n => n.id === edge.from);
                            const target = nodes.find(n => n.id === edge.to);
                            if (!source || !target) return null;

                            return (
                                <line
                                    key={idx}
                                    x1={source.x + 100} y1={source.y + 50}
                                    x2={target.x + 100} y2={target.y + 50}
                                    className="graph-edge"
                                />
                            );
                        })}
                        {creatingEdge && (
                            <line
                                x1={(nodes.find(n => n.id === creatingEdge.from)?.x || 0) + 100}
                                y1={(nodes.find(n => n.id === creatingEdge.from)?.y || 0) + 50}
                                x2={creatingEdge.curX}
                                y2={creatingEdge.curY}
                                className="graph-edge potential"
                            />
                        )}
                    </svg>

                    {/* Nodes Layer */}
                    {filteredNodes.map(node => {
                        const project = projects.find(p => p.id === node.id);
                        if (!project) return null;

                        const entityType = node.entityType || 'project';
                        const entityStyle = ENTITY_STYLES[entityType];

                        return (
                            <div
                                key={node.id}
                                className={`project-node group ${entityStyle.borderClass} ${selectedNodes.has(node.id) ? 'selected' : ''} ${deleteConfirmId === node.id ? 'deleting' : ''}`}
                                style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                                onMouseDown={(e) => handleMouseDown(e, node.id)}
                                onMouseEnter={() => handleNodeHover(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                                onContextMenu={(e) => handleContextMenu(e, node.id)}
                                onDoubleClick={() => {
                                    if (renamingNodeId !== node.id) {
                                        handleLoadProject(project.id);
                                        onClose();
                                    }
                                }}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <EntityIcon type={entityType} className="flex-shrink-0" />
                                    {renamingNodeId === node.id ? (
                                        <input
                                            type="text"
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleConfirmRename();
                                                if (e.key === 'Escape') setRenamingNodeId(null);
                                            }}
                                            onBlur={handleConfirmRename}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-1 px-1 py-0.5 text-sm bg-white dark:bg-slate-700 border border-indigo-500 rounded outline-none text-gray-900 dark:text-slate-100"
                                            autoFocus
                                        />
                                    ) : (
                                        <div
                                            className="project-node-title"
                                            title={project.name}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                handleStartRename(node.id);
                                            }}
                                        >
                                            <HighlightText text={project.name} highlight={searchTerm} />
                                        </div>
                                    )}
                                    <button
                                        className="ml-auto p-0.5 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleContextMenu(e, node.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="project-node-meta">
                                        {new Date(project.updatedAt).toLocaleDateString()}
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${entityStyle.bgClass} ${entityStyle.iconColor} font-medium`}>
                                        {entityStyle.label}
                                    </span>
                                </div>

                                {/* Delete Confirmation Overlay */}
                                {deleteConfirmId === node.id && (
                                    <div
                                        className="absolute inset-0 bg-red-500/90 dark:bg-red-900/90 rounded-lg flex flex-col items-center justify-center p-2 z-10"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <p className="text-white text-xs font-medium mb-2 text-center">Delete "{project.name}"?</p>
                                        <div className="flex gap-2">
                                            <button
                                                className="px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded transition-colors"
                                                onClick={() => setDeleteConfirmId(null)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                className="px-2 py-1 bg-white text-red-600 text-xs font-medium rounded hover:bg-red-100 transition-colors"
                                                onClick={handleDeleteNodes}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {(hoveredNode === node.id || selectedNodes.has(node.id)) && !deleteConfirmId && (
                                    <div className={`node-tooltip ${selectedNodes.has(node.id) ? 'persistent' : ''}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 text-xs flex justify-between items-center">
                                            <span>{selectedNodes.has(node.id) ? 'Full Content' : 'Latest Content (Preview)'}</span>
                                            {selectedNodes.has(node.id) && <span className="text-[10px] text-gray-400 font-normal">Selected</span>}
                                        </div>
                                        {selectedNodes.has(node.id) ? (
                                            <HighlightText text={project.content || '(Empty)'} highlight={searchTerm} />
                                        ) : (
                                            <HighlightText text={hoverContent} highlight={searchTerm} />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 z-50 min-w-[140px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2"
                        onClick={() => {
                            const project = projects.find(p => p.id === contextMenu.nodeId);
                            if (project) {
                                handleLoadProject(project.id);
                                onClose();
                            }
                            setContextMenu(null);
                        }}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Open
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2"
                        onClick={() => handleStartRename(contextMenu.nodeId)}
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        Rename
                    </button>
                    <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                    <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                        onClick={() => {
                            setDeleteConfirmId(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </button>
                </div>
            )}

            {/* Create Node Dialog */}
            {repositoryPath && (
                <CreateNodeDialog
                    isOpen={showCreateDialog}
                    onClose={() => setShowCreateDialog(false)}
                    parentPath={repositoryPath}
                    parentType="repository"
                    onNodeCreated={async (node) => {
                        // Refresh the projects list first to get the new project
                        await refreshProjects();

                        // New node created - find a free position
                        let x = 50;
                        let y = 50;
                        const isColliding = (checkX: number, checkY: number) =>
                            nodes.some(n => Math.abs(n.x - checkX) < NODE_SPACING_X && Math.abs(n.y - checkY) < NODE_SPACING_Y);

                        while (isColliding(x, y)) {
                            x += NODE_SPACING_X;
                            if (x > 800) {
                                x = 50;
                                y += NODE_SPACING_Y;
                            }
                        }

                        // Add the new node to canvas (the projects list is now updated)
                        setNodes(prev => [...prev, { id: node.name, x, y }]);
                        setShowCreateDialog(false);

                        // Load the new project
                        if (node.type === 'project') {
                            await handleLoadProject(node.name);
                        }
                    }}
                />
            )}
        </div>
    );
}
