import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIPrompt } from '../types';
import { Model } from '../constants/models';
import { ArrowLeft, Check, Edit3, Pin, PinOff, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Button } from './Button';
import clsx from 'clsx';
import { GraphModalShell } from './graph/GraphModalShell';
import { GraphCanvas } from './graph/GraphCanvas';
import { GraphContextMenu } from './graph/GraphContextMenu';
import { GraphNodeCard } from './graph/GraphNodeCard';
import { GraphNodeTooltip } from './graph/GraphNodeTooltip';
import { GraphSearchControl } from './graph/GraphSearchControl';
import { clientToGraphSpace, rectsOverlap } from './graph/graphMath';

interface PromptGraphModalProps {
    isOpen: boolean;
    onClose: () => void;
    prompts: AIPrompt[];
    onCreatePrompt: (data: Omit<AIPrompt, 'id' | 'isBuiltIn' | 'order'>) => Promise<void>;
    onUpdatePrompt: (id: string, updates: Partial<AIPrompt>) => Promise<void>;
    onDeletePrompt: (id: string) => Promise<void>;
    onResetBuiltIn: (id: string) => Promise<void>;
    defaultPromptId: string;
    onSetDefault: (id: string) => void;
    onEditInEditor?: (prompt: AIPrompt) => void;
    selectedModel?: Model;
    selectedImageModel?: Model | null;
}

interface PromptNodeState {
    id: string;
    x: number;
    y: number;
}

interface RenderNodeState {
    node: PromptNodeState;
    prompt: AIPrompt;
    isPinned: boolean;
    isDragging: boolean;
}

interface PromptFormState {
    name: string;
    systemInstruction: string;
    promptTask: string;
    color: string;
    isImageMode: boolean;
}

const LAYOUT_KEY = 'diff-commit-prompt-graph-layout-v1';
const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const NODE_GAP_X = 36;
const NODE_GAP_Y = 30;
const EMPTY_FORM: PromptFormState = {
    name: '',
    systemInstruction: '',
    promptTask: '',
    color: 'bg-gray-400',
    isImageMode: false,
};

const COLORS = [
    { value: 'bg-green-400', label: 'Green' },
    { value: 'bg-blue-400', label: 'Blue' },
    { value: 'bg-purple-400', label: 'Purple' },
    { value: 'bg-amber-400', label: 'Amber' },
    { value: 'bg-rose-400', label: 'Rose' },
    { value: 'bg-cyan-400', label: 'Cyan' },
    { value: 'bg-indigo-400', label: 'Indigo' },
    { value: 'bg-pink-400', label: 'Pink' },
];

function layoutNodes(promptIds: string[]): PromptNodeState[] {
    if (promptIds.length === 0) return [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(promptIds.length)));
    return promptIds.map((id, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
            id,
            x: 40 + col * (NODE_WIDTH + NODE_GAP_X),
            y: 40 + row * (NODE_HEIGHT + NODE_GAP_Y),
        };
    });
}

function loadLayout(): PromptNodeState[] {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((n: unknown): n is PromptNodeState => {
                const node = n as PromptNodeState;
                return typeof node?.id === 'string' && typeof node.x === 'number' && typeof node.y === 'number';
            })
            .map((n) => ({ id: n.id, x: n.x, y: n.y }));
    } catch {
        return [];
    }
}

function saveLayout(nodes: PromptNodeState[]): void {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(nodes));
    } catch {
        // Ignore localStorage write errors
    }
}

function modelBadge(prompt: AIPrompt, selectedModel?: Model, selectedImageModel?: Model | null): string {
    if (prompt.isImageMode) {
        return selectedImageModel?.name || 'No image model';
    }
    return selectedModel?.name || 'No text model';
}

export function PromptGraphModal({
    isOpen,
    onClose,
    prompts,
    onCreatePrompt,
    onUpdatePrompt,
    onDeletePrompt,
    onResetBuiltIn,
    defaultPromptId,
    onSetDefault,
    onEditInEditor,
    selectedModel,
    selectedImageModel,
}: PromptGraphModalProps) {
    const [nodes, setNodes] = useState<PromptNodeState[]>([]);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    const [draggingCanvas, setDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formState, setFormState] = useState<PromptFormState>(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    // Drop zone hover states
    const [dropZoneHighlight, setDropZoneHighlight] = useState<'pin' | 'trash' | 'edit' | null>(null);

    // Refs for drop zone hit-testing (use actual DOM positions)
    const pinZoneRef = useRef<HTMLDivElement>(null);
    const trashZoneRef = useRef<HTMLDivElement>(null);
    const editZoneRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const promptsById = useMemo(() => {
        const map = new Map<string, AIPrompt>();
        for (const prompt of prompts) {
            map.set(prompt.id, prompt);
        }
        return map;
    }, [prompts]);

    const pinnedPrompts = useMemo(() => prompts.filter(p => p.pinned), [prompts]);
    const pinnedPromptIds = useMemo(() => new Set(pinnedPrompts.map((p) => p.id)), [pinnedPrompts]);

    const filteredNodeIds = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return new Set(prompts.map((p) => p.id));

        return new Set(
            prompts
                .filter((p) => {
                    return (
                        p.name.toLowerCase().includes(q) ||
                        p.promptTask.toLowerCase().includes(q) ||
                        p.systemInstruction.toLowerCase().includes(q)
                    );
                })
                .map((p) => p.id)
        );
    }, [prompts, searchTerm]);


    useEffect(() => {
        if (!isOpen) return;

        const saved = loadLayout();
        const known = new Set(saved.map((n) => n.id));
        const valid = saved.filter((n) => promptsById.has(n.id));
        const missing = prompts.filter((p) => !known.has(p.id)).map((p) => p.id);
        const merged = [...valid, ...layoutNodes(missing)];
        setNodes(merged);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setSelectedId(null);
        setHoveredId(null);
        setIsCreating(false);
        setFormState(EMPTY_FORM);
    }, [isOpen, prompts, promptsById]);

    useEffect(() => {
        if (!isOpen) return;
        const timeout = setTimeout(() => saveLayout(nodes), 300);
        return () => clearTimeout(timeout);
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

    // Hit-test against actual DOM rects of drop-zone refs
    const getDropZone = useCallback((clientX: number, clientY: number): 'pin' | 'trash' | 'edit' | null => {
        const hitTest = (ref: React.RefObject<HTMLDivElement | null>) => {
            if (!ref.current) return false;
            const r = ref.current.getBoundingClientRect();
            return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        };
        if (hitTest(pinZoneRef)) return 'pin';
        if (hitTest(trashZoneRef)) return 'trash';
        if (hitTest(editZoneRef)) return 'edit';
        return null;
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string | null) => {
        if (e.button !== 0) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldPoint = clientToGraphSpace(e.clientX, e.clientY, rect, offset, scale);

        if (nodeId) {
            e.stopPropagation();
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setSelectedId(nodeId);
            setContextMenu(null);
            setDraggingNode(nodeId);
            setDraggingCanvas(false);
            setDragStart({
                x: worldPoint.x - node.x,
                y: worldPoint.y - node.y,
            });
            return;
        }

        setSelectedId(null);
        setContextMenu(null);
        setDraggingNode(null);
        setDraggingCanvas(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }, [nodes, offset, scale]);

    const resolvePinnedCollision = useCallback((candidate: PromptNodeState, movingId: string): PromptNodeState => {
        const movingPrompt = promptsById.get(movingId);
        if (!movingPrompt || movingPrompt.pinned) {
            return candidate;
        }

        const frozenRects = nodes
            .filter((n) => n.id !== movingId && pinnedPromptIds.has(n.id))
            .map((n) => ({
                x: n.x,
                y: n.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
            }));

        const next = { ...candidate };
        const gap = 18;
        for (let i = 0; i < frozenRects.length + 4; i++) {
            const overlap = frozenRects.find((frozen) =>
                rectsOverlap(
                    { x: next.x, y: next.y, width: NODE_WIDTH, height: NODE_HEIGHT },
                    frozen
                )
            );
            if (!overlap) break;

            const pushRight = overlap.x + overlap.width + gap;
            const pushDown = overlap.y + overlap.height + gap;
            const rightDelta = Math.abs(pushRight - next.x);
            const downDelta = Math.abs(pushDown - next.y);
            if (rightDelta <= downDelta) {
                next.x = pushRight;
            } else {
                next.y = pushDown;
            }
        }

        return next;
    }, [nodes, pinnedPromptIds, promptsById]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (draggingNode) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const worldPoint = clientToGraphSpace(e.clientX, e.clientY, rect, offset, scale);
            const candidate = {
                id: draggingNode,
                x: worldPoint.x - dragStart.x,
                y: worldPoint.y - dragStart.y,
            };
            const resolved = resolvePinnedCollision(candidate, draggingNode);
            setNodes((prev) =>
                prev.map((n) =>
                    n.id === draggingNode
                        ? { ...n, x: resolved.x, y: resolved.y }
                        : n
                )
            );
            // Check drop zones
            setDropZoneHighlight(getDropZone(e.clientX, e.clientY));
        } else if (draggingCanvas) {
            setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    }, [dragStart, draggingCanvas, draggingNode, getDropZone, offset, scale, resolvePinnedCollision]);

    const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
        if (draggingNode) {
            const zone = getDropZone(e.clientX, e.clientY);
            const prompt = promptsById.get(draggingNode);

            if (zone === 'pin' && prompt) {
                await onUpdatePrompt(prompt.id, { pinned: !prompt.pinned });
            } else if (zone === 'trash' && prompt) {
                if (prompt.isBuiltIn) {
                    if (confirm(`Reset "${prompt.name}" to default values?`)) {
                        await onResetBuiltIn(prompt.id);
                    }
                } else {
                    if (confirm(`Delete prompt "${prompt.name}"?`)) {
                        await onDeletePrompt(prompt.id);
                    }
                }
            } else if (zone === 'edit' && prompt) {
                handleEditInFrontpageEditor(prompt);
            }
        }
        setDraggingNode(null);
        setDraggingCanvas(false);
        setDropZoneHighlight(null);
    }, [draggingNode, getDropZone, promptsById, onUpdatePrompt, onDeletePrompt, onResetBuiltIn]);

    // Send prompt to frontpage editor for editing (shared by drag-to-edit-zone + edit icon click)
    const handleEditInFrontpageEditor = useCallback((prompt: AIPrompt) => {
        if (onEditInEditor) {
            onEditInEditor(prompt);
            onClose();
        }
    }, [onEditInEditor, onClose]);

    const handleSave = useCallback(async () => {
        if (!isCreating) return;
        const payload = {
            name: formState.name.trim(),
            systemInstruction: formState.systemInstruction.trim(),
            promptTask: formState.promptTask.trim(),
            color: formState.color,
            isImageMode: formState.isImageMode,
        };
        if (!payload.name || !payload.systemInstruction || !payload.promptTask) return;

        setIsSaving(true);
        try {
            await onCreatePrompt(payload);
            setIsCreating(false);
            setFormState(EMPTY_FORM);
        } finally {
            setIsSaving(false);
        }
    }, [formState, isCreating, onCreatePrompt]);

    const handleDelete = useCallback(async (prompt: AIPrompt) => {
        if (prompt.isBuiltIn) return;
        if (!confirm(`Delete prompt "${prompt.name}"?`)) return;
        await onDeletePrompt(prompt.id);
        if (selectedId === prompt.id) setSelectedId(null);
    }, [onDeletePrompt, selectedId]);

    const renderedNodes = useMemo<RenderNodeState[]>(() => {
        const visible = nodes
            .filter((n) => filteredNodeIds.has(n.id))
            .map((node) => {
                const prompt = promptsById.get(node.id);
                if (!prompt) return null;
                return {
                    node,
                    prompt,
                    isPinned: Boolean(prompt.pinned),
                    isDragging: draggingNode === node.id,
                };
            })
            .filter((entry): entry is RenderNodeState => Boolean(entry));

        visible.sort((a, b) => {
            if (a.isDragging !== b.isDragging) return a.isDragging ? 1 : -1;
            if (a.isPinned !== b.isPinned) return a.isPinned ? 1 : -1;
            return 0;
        });

        return visible;
    }, [nodes, filteredNodeIds, promptsById, draggingNode]);

    const handleReset = useCallback(async (prompt: AIPrompt) => {
        if (!prompt.isBuiltIn) return;
        if (!confirm(`Reset "${prompt.name}" to default values?`)) return;
        await onResetBuiltIn(prompt.id);
    }, [onResetBuiltIn]);

    const handleTogglePin = useCallback(async (prompt: AIPrompt) => {
        await onUpdatePrompt(prompt.id, { pinned: !prompt.pinned });
    }, [onUpdatePrompt]);

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
                        placeholder="Search prompts..."
                        inputClassName="text-gray-800 dark:text-slate-100"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setScale(1);
                            setOffset({ x: 0, y: 0 });
                        }}
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                    >
                        Reset View
                    </Button>
                </>
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
                {/* Prompt node cards */}
                {renderedNodes.map(({ node, prompt, isPinned, isDragging }) => {
                    const isDefault = prompt.id === defaultPromptId;
                    const badge = modelBadge(prompt, selectedModel, selectedImageModel);
                    const zIndex = isDragging ? 90 : isPinned ? 60 : selectedId === node.id ? 50 : 30;

                    return (
                        <GraphNodeCard
                            key={node.id}
                            x={node.x}
                            y={node.y}
                            className={clsx(
                                // Distinct prompt pill background colors (different from project pills)
                                'prompt-node-pill',
                                prompt.isBuiltIn
                                    ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30'
                                    : 'border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/30',
                                selectedId === node.id && 'selected ring-2 ring-indigo-400 dark:ring-indigo-500',
                                isPinned && 'ring-1 ring-amber-300 dark:ring-amber-600',
                                isDragging && 'opacity-70 scale-105'
                            )}
                            zIndex={zIndex}
                            onMouseDown={(e) => handleMouseDown(e, node.id)}
                            onMouseEnter={() => { if (!draggingNode) setHoveredId(node.id); }}
                            onMouseLeave={() => setHoveredId(null)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setSelectedId(node.id);
                                setContextMenu({ x: e.clientX, y: e.clientY, id: node.id });
                            }}
                            onDoubleClick={() => onSetDefault(prompt.id)}
                            onMenuClick={(e) => {
                                e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY, id: node.id });
                            }}
                            header={
                                <>
                                    <span className={clsx('w-2.5 h-2.5 rounded-full', prompt.color || 'bg-gray-400')} />
                                    <div className="project-node-title" title={prompt.name}>{prompt.name}</div>
                                </>
                            }
                            body={
                                <div className="project-node-meta space-y-1">
                                    <div>{prompt.isBuiltIn ? 'Built-in' : 'Custom'}</div>
                                    <div>{prompt.isImageMode ? 'Image mode' : 'Text mode'}</div>
                                    <div title={badge} className="truncate">{badge}</div>
                                </div>
                            }
                            overlay={
                                <div className="absolute top-2 right-2 flex items-center gap-1">
                                    {isPinned && (
                                        <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    )}
                                    {isDefault && (
                                        <Star className="w-4 h-4 text-amber-500 fill-current" />
                                    )}
                                    {/* Quick action: trash icon — deletes custom prompts */}
                                    {!prompt.isBuiltIn && (
                                        <button
                                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(prompt);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            title="Delete prompt"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                                        </button>
                                    )}
                                    {/* Quick action: edit icon — opens in frontpage editor */}
                                    <button
                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditInFrontpageEditor(prompt);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        title="Edit in editor"
                                    >
                                        <Edit3 className="w-3.5 h-3.5 text-indigo-400 hover:text-indigo-600" />
                                    </button>
                                </div>
                            }
                            tooltip={
                                // Hide tooltip while dragging to keep dragging clean
                                !draggingNode && (hoveredId === node.id || selectedId === node.id) ? (
                                    <GraphNodeTooltip
                                        title={selectedId === node.id ? 'Full Prompt' : 'Prompt Preview'}
                                        subtitle={selectedId === node.id ? 'Selected' : 'Hover Preview'}
                                        persistent={selectedId === node.id}
                                    >
                                        <div className="text-[11px] font-semibold mb-1">System</div>
                                        <div className="mb-2 whitespace-pre-wrap">{prompt.systemInstruction}</div>
                                        <div className="text-[11px] font-semibold mb-1">Task</div>
                                        <div className="whitespace-pre-wrap">{prompt.promptTask}</div>
                                    </GraphNodeTooltip>
                                ) : undefined}
                        />
                    );
                })}
            </GraphCanvas>

            {/* Drop zones — fixed position overlays, OUTSIDE the canvas transform */}
            <div className="absolute right-6 top-28 bottom-6 z-[60] flex flex-col gap-3 pointer-events-none">
                {/* Pin Zone */}
                <div
                    ref={pinZoneRef}
                    className={clsx(
                        'w-52 rounded-xl border-2 border-dashed p-4 transition-all duration-200 backdrop-blur-sm pointer-events-auto',
                        dropZoneHighlight === 'pin'
                            ? 'border-amber-400 bg-amber-50/90 dark:bg-amber-900/40 scale-105 shadow-lg shadow-amber-200/50'
                            : 'border-gray-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70'
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Pin className={clsx("w-4 h-4", dropZoneHighlight === 'pin' ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500')} />
                        <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">Pin Zone</span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-snug">
                        Drag prompts here to pin/unpin them in the header dropdown
                    </p>
                    {pinnedPrompts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {pinnedPrompts.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => handleTogglePin(p)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors"
                                    title={`Unpin ${p.name}`}
                                >
                                    <span className={clsx('w-1.5 h-1.5 rounded-full', p.color || 'bg-gray-400')} />
                                    {p.name}
                                    <PinOff className="w-2.5 h-2.5 opacity-60" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Trash Zone */}
                <div
                    ref={trashZoneRef}
                    className={clsx(
                        'w-52 rounded-xl border-2 border-dashed p-4 transition-all duration-200 backdrop-blur-sm pointer-events-auto',
                        dropZoneHighlight === 'trash'
                            ? 'border-red-400 bg-red-50/90 dark:bg-red-900/40 scale-105 shadow-lg shadow-red-200/50'
                            : 'border-gray-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70'
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Trash2 className={clsx("w-4 h-4", dropZoneHighlight === 'trash' ? 'text-red-500' : 'text-gray-400 dark:text-slate-500')} />
                        <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">Delete</span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-snug">
                        Drag custom prompts here to delete them
                    </p>
                </div>

                {/* Edit Zone */}
                <div
                    ref={editZoneRef}
                    className={clsx(
                        'w-52 rounded-xl border-2 border-dashed p-4 transition-all duration-200 backdrop-blur-sm pointer-events-auto',
                        dropZoneHighlight === 'edit'
                            ? 'border-indigo-400 bg-indigo-50/90 dark:bg-indigo-900/40 scale-105 shadow-lg shadow-indigo-200/50'
                            : 'border-gray-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70'
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <Edit3 className={clsx("w-4 h-4", dropZoneHighlight === 'edit' ? 'text-indigo-500' : 'text-gray-400 dark:text-slate-500')} />
                        <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">Edit</span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-snug">
                        Drag a prompt here to edit it in the main editor
                    </p>
                </div>
            </div>

            {isCreating && (
                <div className="fixed left-6 bottom-6 z-50 w-[min(560px,calc(100vw-3rem))] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Create Prompt</h3>
                        <button
                            onClick={() => { setIsCreating(false); setFormState(EMPTY_FORM); }}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            Close
                        </button>
                    </div>

                    <input
                        value={formState.name}
                        onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Prompt name"
                        className="w-full px-3 py-2 text-sm rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                    />

                    <div className="flex flex-wrap gap-2">
                        {COLORS.map((c) => (
                            <button
                                key={c.value}
                                onClick={() => setFormState((prev) => ({ ...prev, color: c.value }))}
                                className={clsx(
                                    'w-5 h-5 rounded-full',
                                    c.value,
                                    formState.color === c.value && 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900'
                                )}
                                title={c.label}
                            />
                        ))}
                        <label className="ml-3 text-xs text-gray-600 dark:text-slate-300 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formState.isImageMode}
                                onChange={(e) => setFormState((prev) => ({ ...prev, isImageMode: e.target.checked }))}
                            />
                            Image mode prompt
                        </label>
                    </div>

                    <textarea
                        value={formState.systemInstruction}
                        onChange={(e) => setFormState((prev) => ({ ...prev, systemInstruction: e.target.value }))}
                        placeholder="System instruction"
                        className="w-full h-24 px-3 py-2 text-sm rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 resize-none"
                    />

                    <textarea
                        value={formState.promptTask}
                        onChange={(e) => setFormState((prev) => ({ ...prev, promptTask: e.target.value }))}
                        placeholder="Task description"
                        className="w-full h-24 px-3 py-2 text-sm rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 resize-none"
                    />

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsCreating(false); setFormState(EMPTY_FORM); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            isLoading={isSaving}
                            onClick={handleSave}
                            disabled={!formState.name.trim() || !formState.systemInstruction.trim() || !formState.promptTask.trim()}
                            icon={<Check className="w-3 h-3" />}
                        >
                            Create
                        </Button>
                    </div>
                </div>
            )}

            {contextMenu && (
                (() => {
                    const prompt = promptsById.get(contextMenu.id);
                    if (!prompt) return null;
                    return (
                        <GraphContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            minWidthClassName="min-w-[170px]"
                            zIndexClassName="z-[120]"
                            items={[
                                {
                                    key: 'default',
                                    label: 'Set Default',
                                    icon: <Star className="w-3.5 h-3.5" />,
                                    tone: 'warning',
                                    onClick: () => {
                                        onSetDefault(prompt.id);
                                        setContextMenu(null);
                                    },
                                },
                                {
                                    key: 'pin',
                                    label: prompt.pinned ? 'Unpin from Dropdown' : 'Pin to Dropdown',
                                    icon: prompt.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />,
                                    onClick: async () => {
                                        await handleTogglePin(prompt);
                                        setContextMenu(null);
                                    },
                                },
                                {
                                    key: 'edit',
                                    label: 'Edit in Editor',
                                    icon: <Edit3 className="w-3.5 h-3.5" />,
                                    onClick: () => {
                                        handleEditInFrontpageEditor(prompt);
                                        setContextMenu(null);
                                    },
                                },
                                prompt.isBuiltIn
                                    ? {
                                        key: 'reset',
                                        label: 'Reset',
                                        icon: <RotateCcw className="w-3.5 h-3.5" />,
                                        onClick: async () => {
                                            await handleReset(prompt);
                                            setContextMenu(null);
                                        },
                                    }
                                    : {
                                        key: 'delete',
                                        label: 'Delete',
                                        icon: <Trash2 className="w-3.5 h-3.5" />,
                                        tone: 'danger' as const,
                                        onClick: async () => {
                                            await handleDelete(prompt);
                                            setContextMenu(null);
                                        },
                                    },
                            ]}
                        />
                    );
                })()
            )}
        </GraphModalShell>
    );
}
