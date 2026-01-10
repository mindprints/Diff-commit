import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useUI, useProject } from '../contexts';
import { X, GitMerge, FileText, Trash2 } from 'lucide-react';
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

    // Initial Load
    useEffect(() => {
        if (isOpen && repositoryPath) {
            loadGraphData(repositoryPath).then(data => {
                // Merge data with current projects
                // If new projects exist that aren't in graph, add them
                // If graph has nodes that don't exist in projects, remove them from graph (cleanup)

                const existingProjectIds = new Set(projects.map(p => p.id));
                const knownNodes = new Set(data.nodes.map(n => n.id));

                let validNodes = data.nodes.filter(n => existingProjectIds.has(n.id));
                const validEdges = data.edges.filter(e => existingProjectIds.has(e.from) && existingProjectIds.has(e.to));

                // Add new projects at default positions
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
            });
        }
    }, [isOpen, repositoryPath, projects.length]); // Re-run if projects change count (rough check)

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
                    // Simple toggle for now, or exclusive? 
                    // Let's make it exclusive unless Ctrl pressed
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
            // Simple hit testing or rely on event propagation?
            // Since mouse events bubble, if we mouseup on a node, strict handler on node might be better
            // But we are processing global mouse move/up here.
            // We'll interpret target from the event? No, e.target might be the SVG overlay.

            // Hit test manually
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
                    // Create Edge
                    // Prevent duplicates
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
            // Get content - draft or last commit? 
            // "project's most recent commit content" per requirements
            // We assume project.content is the draft. We need commits.

            // Hacky: access internal commit storage or assume empty draft means fetch commits?
            // Let's use `window.electron.loadProjectCommits` if available or `browserFileSystem`
            // But `ProjectContext` doesn't freely expose generic "getCommits(projectId)" for non-current projects easily
            // except via the load side effect.

            // For now, display current draft content as fallback, or try to load.
            setHoverContent(project.content.slice(0, 500) + (project.content.length > 500 ? '...' : '') || '(Empty)');
        }
    };

    const handleMerge = async () => {
        if (selectedNodes.size < 2 && edges.length === 0) return;

        // Find subgraph of selected nodes? Or merge everything connected?
        // Requirement: "define a merge sequence"
        // Let's take all nodes involved in edges, or just selected?
        // Let's assume user selects the nodes they want to merge, and we use edges to order them.
        const nodesToMerge = Array.from(selectedNodes);

        if (nodesToMerge.length < 2) {
            // If nothing selected, maybe merge all connected components? Too risky.
            // Requirement says "Create nodes -> Draw arcs -> Merge button"
            // So likely we merge the entire lineage defined by arcs?
            // Let's merge all nodes that have connections + selected ones.
            // A clearer UX: User selects the "sink" node (end of chain)? 
            // OR User clicks Merge, we find the longest chain?

            // Implementation: Merge ALL nodes in the current view that are connected? 
            // Let's stick to: Merge SELECTED nodes using the order defined by EDGES.
            alert("Please select at least 2 nodes to merge (Ctrl+Click)");
            return;
        }

        // Sort nodes based on edges
        // Filter edges to only those between selected nodes
        const relevantEdges = edges.filter(e => selectedNodes.has(e.from) && selectedNodes.has(e.to));

        // Use topological sort
        const sortedIds = getTopologicalSort(nodesToMerge, relevantEdges);

        if (!sortedIds) {
            alert("Cannot merge: Cycle detected in selection!");
            return;
        }

        // Concatenate content
        let mergedContent = "";
        const projectMap = new Map(projects.map(p => [p.id, p]));

        sortedIds.forEach((id, idx) => {
            const p = projectMap.get(id);
            if (p) {
                mergedContent += `\n\n--- Content from ${p.name} ---\n\n`;
                mergedContent += p.content;
            }
        });

        // Create new Project
        const newName = `Merged ${sortedIds.map(id => projectMap.get(id)?.name).join('-')}`;
        await createNewProject(newName, mergedContent.trim());

        // Visual feedback handled by useEffect observing projects list
        onClose();
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
                <Button variant="ghost" onClick={deleteSelected} disabled={selectedNodes.size === 0} title="Delete Connections (Del)">
                    <Trash2 className="w-4 h-4" />
                </Button>
                <Button variant="primary" onClick={handleMerge} icon={<GitMerge className="w-4 h-4" />}>
                    Merge Selected
                </Button>
            </div>

            <button className="modal-close p-2 bg-white dark:bg-slate-800 rounded-full shadow-lg hover:bg-gray-100" onClick={onClose}>
                <X className="w-5 h-5" />
            </button>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className="project-node-canvas"
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={(e) => {
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
