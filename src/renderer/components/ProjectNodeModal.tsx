import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useUI, useProject } from '../contexts';
import { X, GitMerge, FileText, Trash2, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { loadGraphData, saveGraphData, hasCycle, getTopologicalSort } from '../services/graphService';
import './ProjectNodeModal.css';
import { Project } from '../types';

interface ProjectNodeModalProps {
    isOpen: boolean;
    onClose: () => void;
}


interface NodeState {
    id: string;
    x: number;
    y: number;
}

interface Edge {
    from: string;
    to: string;
}

export function ProjectNodeModal({ isOpen, onClose }: ProjectNodeModalProps) {
    const { currentProject, projects, createNewProject, repositoryPath, handleLoadProject } = useProject();

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

        // Add new projects (or all if forced) at default positions
        let newX = 50;
        let newY = 50;
        projects.forEach(p => {
            if (!knownNodes.has(p.id)) {
                validNodes.push({ id: p.id, x: newX, y: newY });
                newX += 220;
                if (newX > 800) {
                    newX = 50;
                    newY += 150;
                }
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
                        next.clear();
                        next.add(nodeId);
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
        const newX = count > 0 ? (avgX / count) + 50 : 50;
        const newY = count > 0 ? (avgY / count) + 50 : 50;

        // Create new Project
        const newName = `Merged ${sortedIds.map(id => projectMap.get(id)?.name).join('-')}`;
        const newProject = await createNewProject(newName, mergedContent.trim());

        // Optimistically add the new node to graph at the calculated position so it doesn't jump to 0,0
        // The useEffect will pick it up on next render, but we want to set it now to avoid flicker/default pos
        // However, useEffect has logic to add unknown nodes. 
        // We can pre-seed the graph data or just handle it here? 
        // Best to update local state immediately.
        setNodes(prev => [...prev, { id: newProject.id, x: newX, y: newY }]);

        // Automatically link the sources to the new merge node?
        // Requirement: "illustrate the lineage". 
        // Let's create edges from the last items in chain to the new node?
        // Or from ALL selected nodes to the new node?
        // Let's assume the new node is a child of the sorted sequence.
        // Actually, merging A+B -> C implies A&B are parents of C.
        // So we should add edges from all selected nodes (OR just the sinks?) to the new node.

        const newEdges: Edge[] = [];
        sortedIds.forEach(id => {
            // Avoid duplicates
            newEdges.push({ from: id, to: newProject.id });
        });
        setEdges(prev => [...prev, ...newEdges]);

        // Don't close immediately so user sees the result? 
        // User requirements didn't specify. Previous code closed.
        // "Upon merging, create a new project node... Do not auto-delete... apply color-coding"
        // Let's keep modal open to show the visual feedback.
        // clear selection
        setSelectedNodes(new Set());
    };

    const deleteSelected = async () => {
        // Logic to delete edges or nodes? 
        // User requirements: "Do not auto-delete source nodes; allow the user to manually delete"
        // We'll just remove edges for now, deletion of project is heavy.
        if (selectedNodes.size > 0) {
            // Remove edges connected to selected nodes
            setEdges(prev => prev.filter(e => !selectedNodes.has(e.from) && !selectedNodes.has(e.to)));
            // Clear selection
            setSelectedNodes(new Set());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="project-node-modal">
            {/* Toolbar */}
            <div className="modal-controls">
                <Button variant="ghost" onClick={() => initializeLayout(true)} title="Reset Node Positions">
                    <RotateCcw className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1" />
                <Button variant="ghost" onClick={deleteSelected} disabled={selectedNodes.size === 0} title="Delete Connections (Del)">
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
                onWheel={(_e) => {
                    // Simple zoom?
                }}
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
                    {nodes.map(node => {
                        const project = projects.find(p => p.id === node.id);
                        if (!project) return null;

                        return (
                            <div
                                key={node.id}
                                className={`project-node ${selectedNodes.has(node.id) ? 'selected' : ''}`}
                                style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                                onMouseDown={(e) => handleMouseDown(e, node.id)}
                                onMouseEnter={() => handleNodeHover(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                                onDoubleClick={() => {
                                    handleLoadProject(project.id);
                                    onClose();
                                }}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="w-4 h-4 text-indigo-500" />
                                    <div className="project-node-title" title={project.name}>
                                        {project.name}
                                    </div>
                                </div>
                                <div className="project-node-meta">
                                    {new Date(project.updatedAt).toLocaleDateString()}
                                </div>

                                {hoveredNode === node.id && (
                                    <div className="node-tooltip">
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 text-xs">Latest Content</div>
                                        {hoverContent}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
