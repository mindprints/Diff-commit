import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, Loader2, Image as ImageIcon, AlertTriangle, Send } from 'lucide-react';
import clsx from 'clsx';

interface ImageViewerProps {
    /** Base64 image data (data URL) */
    imageData: string | null;
    /** The prompt used to generate the image */
    prompt: string;
    /** Whether image generation is in progress */
    isLoading: boolean;
    /** Called when user clicks Save */
    onSave: () => void;
    /** Called when user clicks Regenerate, optionally with additional instructions */
    onRegenerate: (additionalInstructions?: string) => void;
    /** Called when user clicks Close */
    onClose: () => void;
    /** Whether saving is in progress */
    isSaving?: boolean;
}

/**
 * ImageViewer - Overlay component for displaying generated images
 * Renders over the DiffPanel when an image is generated or being generated
 */
export function ImageViewer({
    imageData,
    prompt,
    isLoading,
    onSave,
    onRegenerate,
    onClose,
    isSaving = false,
}: ImageViewerProps) {
    // Track image load errors
    const [imageError, setImageError] = useState(false);
    // Regeneration instructions input
    const [regenerateInstructions, setRegenerateInstructions] = useState('');

    // Reset error state when imageData changes
    useEffect(() => {
        setImageError(false);
    }, [imageData]);

    // Truncate long prompts for display
    const displayPrompt = prompt.length > 100 ? prompt.substring(0, 97) + '...' : prompt;

    // Handle Escape key to close
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Handle regenerate with instructions
    const handleRegenerate = () => {
        onRegenerate(regenerateInstructions.trim() || undefined);
        setRegenerateInstructions('');
    };

    // Handle Enter key in input
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
            e.preventDefault();
            handleRegenerate();
        }
    };

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col"
            style={{ backgroundColor: 'var(--bg-panel)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-viewer-header"
        >
            {/* Header */}
            <div
                id="image-viewer-header"
                className="flex-none h-14 p-4 flex justify-between items-center transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border-color)' }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <ImageIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <h2 className="font-semibold text-gray-700 dark:text-slate-300 truncate">
                        Generated Image
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Image Container */}
            <div
                className="flex-1 flex flex-col items-center justify-center overflow-auto p-4"
                style={{ backgroundColor: 'var(--bg-muted)' }}
            >
                {isLoading ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                        <p className="text-gray-600 dark:text-slate-400 text-sm">
                            Generating image...
                        </p>
                        <p className="text-gray-500 dark:text-slate-500 text-xs max-w-md text-center">
                            "{displayPrompt}"
                        </p>
                    </div>
                ) : imageData && !imageError ? (
                    <div className="flex flex-col items-center gap-4 max-w-full">
                        <div
                            className="rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-slate-700"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                            <img
                                src={imageData}
                                alt={prompt}
                                className="max-w-full max-h-[50vh] object-contain"
                                onError={() => setImageError(true)}
                            />
                        </div>
                        <p className="text-gray-500 dark:text-slate-400 text-xs max-w-md text-center italic">
                            "{displayPrompt}"
                        </p>
                    </div>
                ) : imageError ? (
                    <div className="flex flex-col items-center gap-4 text-red-500 dark:text-red-400">
                        <AlertTriangle className="w-16 h-16 opacity-70" />
                        <p className="text-sm font-medium">Failed to load image</p>
                        <p className="text-gray-500 dark:text-slate-500 text-xs max-w-md text-center">
                            The generated image could not be displayed. Try regenerating.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-slate-400">
                        <ImageIcon className="w-16 h-16 opacity-30" />
                        <p className="text-sm">No image generated yet</p>
                    </div>
                )}
            </div>

            {/* Regeneration Instructions Input */}
            {imageData && !isLoading && (
                <div
                    className="flex-none px-4 py-3"
                    style={{ backgroundColor: 'var(--bg-muted)', borderTop: '1px solid var(--border-color)' }}
                >
                    <div className="flex gap-2 max-w-2xl mx-auto">
                        <input
                            type="text"
                            value={regenerateInstructions}
                            onChange={(e) => setRegenerateInstructions(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Modify image: e.g., 'remove the background', 'make it warmer'..."
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                            onClick={handleRegenerate}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                            title={regenerateInstructions.trim() ? 'Regenerate with modifications' : 'Regenerate same image'}
                        >
                            <Send className="w-4 h-4" />
                            {regenerateInstructions.trim() ? 'Modify' : 'Regenerate'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-2">
                        Enter modifications to change the image, or leave empty to regenerate with the same prompt
                    </p>
                </div>
            )}

            {/* Footer with Actions */}
            <div
                className="flex-none p-3 flex justify-center gap-3 transition-colors duration-200"
                style={{ backgroundColor: 'var(--bg-muted)', borderTop: '1px solid var(--border-color)' }}
            >
                <button
                    onClick={onSave}
                    disabled={!imageData || isLoading || isSaving}
                    className={clsx(
                        "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors",
                        imageData && !isLoading && !isSaving
                            ? "bg-purple-600 text-white hover:bg-purple-700"
                            : "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                    )}
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    Save Image
                </button>
                <button
                    onClick={() => onRegenerate()}
                    disabled={isLoading}
                    className={clsx(
                        "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors",
                        !isLoading
                            ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                            : "bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                    )}
                >
                    <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
                    Regenerate
                </button>
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                    <X className="w-4 h-4" />
                    Close
                </button>
            </div>
        </div>
    );
}
