import React from 'react';
import { X, Download, RefreshCw, Loader2, Image as ImageIcon } from 'lucide-react';
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
    /** Called when user clicks Regenerate */
    onRegenerate: () => void;
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
    // Truncate long prompts for display
    const displayPrompt = prompt.length > 100 ? prompt.substring(0, 97) + '...' : prompt;

    return (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ backgroundColor: 'var(--bg-panel)' }}>
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
                ) : imageData ? (
                    <div className="flex flex-col items-center gap-4 max-w-full">
                        <div
                            className="rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-slate-700"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                        >
                            <img
                                src={imageData}
                                alt={prompt}
                                className="max-w-full max-h-[60vh] object-contain"
                            />
                        </div>
                        <p className="text-gray-500 dark:text-slate-400 text-xs max-w-md text-center italic">
                            "{displayPrompt}"
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-slate-400">
                        <ImageIcon className="w-16 h-16 opacity-30" />
                        <p className="text-sm">No image generated yet</p>
                    </div>
                )}
            </div>

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
                    onClick={onRegenerate}
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
