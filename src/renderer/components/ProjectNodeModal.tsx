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

    // Search State
    const [searchTerm, setSearchTerm] = useState('');

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
                Math.abs(n.x - x) < 220 && Math.abs(n.y - y) < 150
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
                    x += 220; // Move right
                    if (x > 800) { // New row
                        x = 50;
                        y += 150;
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
            collision = nodes.some(n => Math.abs(n.x - newX) < 50 && Math.abs(n.y - newY) < 50);
            if (collision) {
                newX += 30;
                newY += 30;
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

    // Helper to highlight text
    const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
        if (!highlight.trim()) {
            return <>{text}</>;
        }
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
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

    if (!isOpen) return null;

    return (
        <div className="project-node-modal">
            {/* Toolbar */}
            <div className="modal-controls">
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
                onWheel={(e) => {
                    if (e.ctrlKey) {
                        setDraggingCanvas(false);
                        const delta = -e.deltaY * 0.001;
                        setScale(prev => Math.min(Math.max(0.1, prev + delta), 4));
                    } else {
                        setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
                    }
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
                    {filteredNodes.map(node => {
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
                                        <HighlightText text={project.name} highlight={searchTerm} />
                                    </div>
                                </div>
                                <div className="project-node-meta">
                                    {new Date(project.updatedAt).toLocaleDateString()}
                                </div>

                                {(hoveredNode === node.id || selectedNodes.has(node.id)) && (
                                    <div className={`node-tooltip ${selectedNodes.has(node.id) ? 'persistent' : ''}`}
                                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag start when clicking scrollbar/text
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
        </div>
    );
}
