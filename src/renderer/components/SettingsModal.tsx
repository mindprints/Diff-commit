import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Key, Save, Check, AlertCircle, Eye, EyeOff, ExternalLink, FolderOpen, Type as TypeIcon, Link2, Palette, Moon, Sun, BarChart3, History, HelpCircle, Radio } from 'lucide-react';
import { getFactCheckSearchMode, OpenRouterSearchMode, setFactCheckSearchMode } from '../services/openRouterSearch';
import {
    getFactCheckExtractionModelId,
    getFactCheckVerificationModelId,
    setFactCheckExtractionModelId,
    setFactCheckVerificationModelId
} from '../services/factChecker';
import { useAI, useEditor, useModels, useProject, useUI } from '../contexts';
import { supportsSearchCapability } from '../services/openRouterService';
import { isImageCapable } from '../services/imageGenerationService';
import { FontSize } from '../constants/ui';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isFirstRun?: boolean;
}

interface ApiKeyField {
    provider: string;
    label: string;
    placeholder: string;
    helpUrl: string;
    required: boolean;
}

const API_KEY_FIELDS: ApiKeyField[] = [
    {
        provider: 'openrouter',
        label: 'OpenRouter API Key',
        placeholder: 'sk-or-v1-...',
        helpUrl: 'https://openrouter.ai/keys',
        required: true
    },
    {
        provider: 'artificialAnalysis',
        label: 'Artificial Analysis API Key (Optional)',
        placeholder: 'Your API key...',
        helpUrl: 'https://artificialanalysis.ai/account',
        required: false
    }
];

type SettingsSectionId = 'api' | 'appearance' | 'tools' | 'factcheck' | 'workspace';

const SETTINGS_SECTION_TABS: Array<{ id: SettingsSectionId; label: string }> = [
    { id: 'api', label: 'API Keys' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'tools', label: 'Tools' },
    { id: 'factcheck', label: 'Fact-check' },
    { id: 'workspace', label: 'Workspace' },
];
const MODEL_PING_AUDIT_EVENT = 'run-model-selection-ping-audit';
const AUTO_MODEL_PING_AUDIT_KEY = 'diff-commit-auto-model-ping-audit-enabled';

export function SettingsModal({ isOpen, onClose, isFirstRun = false }: SettingsModalProps) {
    const {
        backgroundHue, setBackgroundHue, isDarkMode, setIsDarkMode,
        setShowLogs, setShowCommitHistory, setShowHelp
    } = useUI();
    const {
        fontFamily, setFontFamily, fontSize, setFontSize,
        isScrollSyncEnabled, setIsScrollSyncEnabled
    } = useEditor();
    const {
        selectedImageModel, setDefaultImageModel
    } = useAI();
    const { commits } = useProject();
    const { models } = useModels();
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [configured, setConfigured] = useState<Record<string, boolean>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspacePath, setWorkspacePath] = useState('');
    const [workspaceInput, setWorkspaceInput] = useState('');
    const [workspaceSaving, setWorkspaceSaving] = useState(false);
    const [workspaceSaved, setWorkspaceSaved] = useState(false);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);
    const [factCheckSearchMode, setFactCheckSearchModeState] = useState<OpenRouterSearchMode>('off');
    const [factCheckExtractionModelId, setFactCheckExtractionModelIdState] = useState('');
    const [factCheckVerificationModelId, setFactCheckVerificationModelIdState] = useState('');
    const [showSearchCapableOnly, setShowSearchCapableOnly] = useState(false);
    const [autoModelPingAuditEnabled, setAutoModelPingAuditEnabled] = useState(true);
    const [activeSection, setActiveSection] = useState<SettingsSectionId>('api');

    // Refs for cleanup
    const isMounted = useRef(true);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const workspaceSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const sectionRefs = useRef<Record<SettingsSectionId, HTMLDivElement | null>>({
        api: null,
        appearance: null,
        tools: null,
        factcheck: null,
        workspace: null,
    });

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (workspaceSaveTimeoutRef.current) {
                clearTimeout(workspaceSaveTimeoutRef.current);
            }
        };
    }, []);

    // Load existing keys on mount
    useEffect(() => {
        if (isOpen) {
            loadKeys();
            loadWorkspace();
            setFactCheckSearchModeState(getFactCheckSearchMode());
            setFactCheckExtractionModelIdState(getFactCheckExtractionModelId());
            setFactCheckVerificationModelIdState(getFactCheckVerificationModelId());
            try {
                setAutoModelPingAuditEnabled(localStorage.getItem(AUTO_MODEL_PING_AUDIT_KEY) !== 'false');
            } catch (err) {
                console.warn('Failed to read auto model ping audit preference:', err);
                setAutoModelPingAuditEnabled(true);
            }
            setActiveSection('api');
        }
    }, [isOpen]);

    const verificationModelSupportsSearchMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const model of models) {
            map.set(
                model.id,
                supportsSearchCapability(
                    model.id,
                    model.name,
                    model.capabilities,
                    model.supportedParams
                )
            );
        }
        return map;
    }, [models]);

    const verificationModelOptions = useMemo(() => {
        const selectedModel = models.find((model) => model.id === factCheckVerificationModelId);
        if (!showSearchCapableOnly) return models;
        const filtered = models.filter((model) => verificationModelSupportsSearchMap.get(model.id));
        if (selectedModel && !filtered.some((model) => model.id === selectedModel.id)) {
            return [selectedModel, ...filtered];
        }
        return filtered;
    }, [models, factCheckVerificationModelId, showSearchCapableOnly, verificationModelSupportsSearchMap]);

    const selectedVerificationModelSupportsSearch = useMemo(
        () => verificationModelSupportsSearchMap.get(factCheckVerificationModelId) ?? false,
        [verificationModelSupportsSearchMap, factCheckVerificationModelId]
    );

    useEffect(() => {
        if (!isOpen || models.length === 0) return;

        const hasExtraction = models.some((m) => m.id === factCheckExtractionModelId);
        if (!hasExtraction) {
            const fallback = models[0].id;
            setFactCheckExtractionModelIdState(fallback);
            setFactCheckExtractionModelId(fallback);
        }

        const hasVerification = models.some((m) => m.id === factCheckVerificationModelId);
        if (!hasVerification) {
            const searchAwareFallback = factCheckSearchMode !== 'off'
                ? (models.find((m) => verificationModelSupportsSearchMap.get(m.id))?.id || models[0].id)
                : models[0].id;
            setFactCheckVerificationModelIdState(searchAwareFallback);
            setFactCheckVerificationModelId(searchAwareFallback);
        }
    }, [
        isOpen,
        models,
        factCheckExtractionModelId,
        factCheckVerificationModelId,
        factCheckSearchMode,
        verificationModelSupportsSearchMap
    ]);

    const scrollToSection = (sectionId: SettingsSectionId) => {
        setActiveSection(sectionId);
        const target = sectionRefs.current[sectionId];
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleContentScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const containerTop = container.getBoundingClientRect().top;
        let nextActive: SettingsSectionId = activeSection;
        let minDelta = Number.POSITIVE_INFINITY;

        for (const tab of SETTINGS_SECTION_TABS) {
            const section = sectionRefs.current[tab.id];
            if (!section) continue;
            const delta = Math.abs(section.getBoundingClientRect().top - containerTop - 56);
            if (delta < minDelta) {
                minDelta = delta;
                nextActive = tab.id;
            }
        }

        if (nextActive !== activeSection) {
            setActiveSection(nextActive);
        }
    };

    const loadKeys = async () => {
        setLoading(true);
        setError(null);
        try {
            const loadedKeys: Record<string, string> = {};
            const configuredState: Record<string, boolean> = {};
            if (window.electron?.getApiKeyConfigured) {
                for (const field of API_KEY_FIELDS) {
                    configuredState[field.provider] = await window.electron.getApiKeyConfigured(field.provider);
                    loadedKeys[field.provider] = '';
                }
            }
            if (isMounted.current) {
                setKeys(loadedKeys);
                setConfigured(configuredState);
            }
        } catch (e) {
            console.error('Failed to load API keys:', e);
        }
        if (isMounted.current) {
            setLoading(false);
        }
    };

    const loadWorkspace = async () => {
        setWorkspaceError(null);
        setWorkspaceSaved(false);
        try {
            if (window.electron?.getWorkspacePath) {
                const path = await window.electron.getWorkspacePath();
                if (isMounted.current) {
                    setWorkspacePath(path || '');
                    setWorkspaceInput(path || '');
                }
            }
        } catch (e) {
            console.error('Failed to load workspace path:', e);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const nextConfigured = { ...configured };
            // Validate required keys
            const missingRequired = API_KEY_FIELDS
                .filter((f) => f.required && !keys[f.provider]?.trim() && !nextConfigured[f.provider])
                .map(f => f.label);

            if (missingRequired.length > 0) {
                setError(`Please enter: ${missingRequired.join(', ')}`);
                setSaving(false);
                return;
            }

            // Save all keys
            for (const field of API_KEY_FIELDS) {
                const key = keys[field.provider]?.trim();
                if (key && window.electron?.setApiKey) {
                    await window.electron.setApiKey(field.provider, key);
                    nextConfigured[field.provider] = true;
                }
            }

            // Clear the API key cache in ai.ts
            const { clearApiKeyCache } = await import('../services/ai');
            clearApiKeyCache();

            if (isMounted.current) {
                setConfigured(nextConfigured);
                setSaved(true);
                // Clear any existing timeout before setting new one
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }
                saveTimeoutRef.current = setTimeout(() => {
                    if (isMounted.current) {
                        setSaved(false);
                        if (!isFirstRun) {
                            onClose();
                        }
                    }
                }, 1500);
            }
        } catch (e) {
            console.error('Failed to save API keys:', e);
            if (isMounted.current) {
                setError('Failed to save API keys. Please try again.');
            }
        }
        if (isMounted.current) {
            setSaving(false);
        }
    };

    const handleWorkspaceSave = async () => {
        const nextPath = workspaceInput.trim();
        setWorkspaceSaving(true);
        setWorkspaceError(null);
        setWorkspaceSaved(false);

        if (!nextPath) {
            setWorkspaceError('Workspace path is required');
            setWorkspaceSaving(false);
            return;
        }

        if (!window.electron?.setCustomWorkspace) {
            setWorkspaceError('Workspace settings are not available');
            setWorkspaceSaving(false);
            return;
        }

        try {
            const result = await window.electron.setCustomWorkspace(nextPath);
            if (!result?.success) {
                if (isMounted.current) {
                    setWorkspaceError(result?.error || 'Failed to update workspace path');
                    setWorkspaceSaving(false);
                }
                return;
            }

            if (window.electron?.getWorkspacePath) {
                const updatedPath = await window.electron.getWorkspacePath();
                if (isMounted.current) {
                    setWorkspacePath(updatedPath || nextPath);
                    setWorkspaceInput(updatedPath || nextPath);
                }
            } else {
                if (isMounted.current) {
                    setWorkspacePath(nextPath);
                }
            }

            if (isMounted.current) {
                setWorkspaceSaved(true);
                if (workspaceSaveTimeoutRef.current) {
                    clearTimeout(workspaceSaveTimeoutRef.current);
                }
                workspaceSaveTimeoutRef.current = setTimeout(() => {
                    if (isMounted.current) {
                        setWorkspaceSaved(false);
                    }
                }, 1500);
            }
        } catch (e) {
            console.error('Failed to update workspace path:', e);
            if (isMounted.current) {
                setWorkspaceError('Failed to update workspace path. Please try again.');
            }
        }

        if (isMounted.current) {
            setWorkspaceSaving(false);
        }
    };

    const handleKeyChange = (provider: string, value: string) => {
        setKeys(prev => ({ ...prev, [provider]: value }));
        setError(null);
        setSaved(false);
    };

    const handleWorkspaceInputChange = (value: string) => {
        setWorkspaceInput(value);
        setWorkspaceError(null);
        setWorkspaceSaved(false);
    };

    const toggleShowKey = (provider: string) => {
        setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
    };

    const setAutoModelPingAuditPreference = (enabled: boolean) => {
        setAutoModelPingAuditEnabled(enabled);
        try {
            localStorage.setItem(AUTO_MODEL_PING_AUDIT_KEY, enabled ? 'true' : 'false');
        } catch (err) {
            console.warn('Failed to save auto model ping audit preference:', err);
        }
    };

    if (!isOpen) return null;

    const canClose = !isFirstRun || (keys['openrouter']?.trim()) || configured['openrouter'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={canClose ? onClose : undefined}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                            <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {isFirstRun ? 'Welcome! Set Up Your API Keys' : 'Settings'}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isFirstRun
                                    ? 'Enter your API keys to get started'
                                    : 'Manage your API keys securely'}
                            </p>
                        </div>
                    </div>
                    {canClose && (
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleContentScroll}
                    className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0"
                >
                    {!loading && (
                        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
                            <div className="flex flex-wrap gap-2">
                                {SETTINGS_SECTION_TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => scrollToSection(tab.id)}
                                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${activeSection === tab.id
                                            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
                        </div>
                    ) : (
                        <>
                            <div ref={(el) => { sectionRefs.current.api = el; }} className="space-y-5 scroll-mt-20">
                                {API_KEY_FIELDS.map((field) => (
                                    <div key={field.provider} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {field.label}
                                                {field.required && <span className="text-red-500 ml-1">*</span>}
                                            </label>
                                            <a
                                                href={field.helpUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
                                            >
                                                Get API Key <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type={showKeys[field.provider] ? 'text' : 'password'}
                                                value={keys[field.provider] || ''}
                                                onChange={(e) => handleKeyChange(field.provider, e.target.value)}
                                                placeholder={configured[field.provider] ? 'Configured (enter to replace)' : field.placeholder}
                                                className="w-full px-4 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => toggleShowKey(field.provider)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                            >
                                                {showKeys[field.provider] ? (
                                                    <EyeOff className="w-4 h-4" />
                                                ) : (
                                                    <Eye className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <Key className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-green-700 dark:text-green-300">
                                        Your API keys are encrypted and stored securely using your operating system's credential manager.
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div ref={(el) => { sectionRefs.current.appearance = el; }} className="space-y-3 scroll-mt-20">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <TypeIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Appearance & Editor</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Unified UI/editor preferences previously split across header settings.</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Theme Mode</label>
                                    <button
                                        onClick={() => setIsDarkMode(!isDarkMode)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-700 dark:text-slate-200 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span>{isDarkMode ? 'Dark' : 'Light'}</span>
                                        {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Background Hue ({backgroundHue}°)</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="360"
                                        value={backgroundHue}
                                        onChange={(e) => setBackgroundHue(Number(e.target.value))}
                                        className="w-full h-2 cursor-pointer appearance-none rounded-full"
                                        style={{
                                            background: 'linear-gradient(to right, hsl(0, 50%, 50%), hsl(60, 50%, 50%), hsl(120, 50%, 50%), hsl(180, 50%, 50%), hsl(240, 50%, 50%), hsl(300, 50%, 50%), hsl(360, 50%, 50%))'
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Typeface</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['sans', 'serif', 'mono'] as const).map((f) => (
                                            <button
                                                key={f}
                                                onClick={() => setFontFamily(f)}
                                                className={`py-2 text-xs rounded-lg border transition-colors capitalize ${fontFamily === f
                                                    ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Font Size</label>
                                        <select
                                            value={fontSize}
                                            onChange={(e) => setFontSize(e.target.value as FontSize)}
                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="sm">Small</option>
                                            <option value="base">Normal</option>
                                            <option value="lg">Large</option>
                                            <option value="xl">XL</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                            <Link2 className="w-3.5 h-3.5" />
                                            Scroll Sync
                                        </label>
                                        <button
                                            onClick={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                                            className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${isScrollSyncEnabled
                                                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                                                }`}
                                        >
                                            {isScrollSyncEnabled ? 'Enabled' : 'Disabled'}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                        <Palette className="w-3.5 h-3.5" />
                                        Default Image Model
                                    </label>
                                    <select
                                        value={selectedImageModel?.id || ''}
                                        onChange={(e) => {
                                            if (e.target.value === '') {
                                                setDefaultImageModel(null);
                                                return;
                                            }
                                            const model = models.find((m) => m.id === e.target.value);
                                            if (model && isImageCapable(model)) {
                                                setDefaultImageModel(model);
                                            }
                                        }}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Auto-detect</option>
                                        {models.filter((m) => isImageCapable(m)).map((m) => (
                                            <option key={`settings-image-${m.id}`} value={m.id}>
                                                {m.name} ({m.provider})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div ref={(el) => { sectionRefs.current.tools = el; }} className="space-y-3 scroll-mt-20">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tools</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Previously in header settings quick menu.</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => {
                                            setShowLogs(true);
                                            onClose();
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <BarChart3 className="w-4 h-4 text-indigo-500" />
                                        AI Usage Statistics
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowCommitHistory(true);
                                            onClose();
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <History className="w-4 h-4 text-indigo-500" />
                                        Version History
                                        {commits.length > 0 && (
                                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700">
                                                {commits.length}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            window.dispatchEvent(new Event(MODEL_PING_AUDIT_EVENT));
                                            onClose();
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <Radio className="w-4 h-4 text-emerald-500" />
                                        Run Model Ping Audit
                                    </button>
                                    <label className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={autoModelPingAuditEnabled}
                                            onChange={(e) => setAutoModelPingAuditPreference(e.target.checked)}
                                            className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>
                                            <span className="block">Auto-run Model Ping Audit on app launch</span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                Runs once at startup and shows the results popup when complete.
                                            </span>
                                        </span>
                                    </label>
                                    <button
                                        onClick={() => {
                                            setShowHelp(true);
                                            onClose();
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <HelpCircle className="w-4 h-4 text-amber-500" />
                                        Help & Support
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div ref={(el) => { sectionRefs.current.factcheck = el; }} className="space-y-3 scroll-mt-20">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Fact-check Models</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Choose the model that extracts claims and the model that verifies them.</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Extraction Model (Reasoning)</label>
                                    <select
                                        value={factCheckExtractionModelId}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            setFactCheckExtractionModelIdState(id);
                                            setFactCheckExtractionModelId(id);
                                        }}
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    >
                                        {models.map((model) => (
                                            <option key={`factcheck-extract-${model.id}`} value={model.id}>
                                                {model.name} ({model.provider})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Verification Model (Fact-check)</label>
                                    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={showSearchCapableOnly}
                                            onChange={(e) => setShowSearchCapableOnly(e.target.checked)}
                                            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Show likely search-capable models only
                                    </label>
                                    <select
                                        value={factCheckVerificationModelId}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            setFactCheckVerificationModelIdState(id);
                                            setFactCheckVerificationModelId(id);
                                        }}
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    >
                                        {verificationModelOptions.map((model) => (
                                            <option key={`factcheck-verify-${model.id}`} value={model.id}>
                                                {model.name} ({model.provider}){verificationModelSupportsSearchMap.get(model.id) ? ' [Search]' : ' [Search?]'}
                                            </option>
                                        ))}
                                    </select>
                                    <p className={`text-xs ${selectedVerificationModelSupportsSearch ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {selectedVerificationModelSupportsSearch
                                            ? 'Selected verification model likely has native web-search support.'
                                            : 'Native search support is unclear for the selected verification model.'}
                                    </p>
                                    {factCheckSearchMode !== 'off' && !selectedVerificationModelSupportsSearch && (
                                        <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                            <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                Fact-check search mode is enabled. Native search may be unavailable for this model, but :online/plugin search can still be applied.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div ref={(el) => { sectionRefs.current.workspace = el; }} className="space-y-3 scroll-mt-20">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Fact-check Web Search</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Controls how OpenRouter search is applied during claim verification.</p>
                                    </div>
                                </div>
                                <select
                                    value={factCheckSearchMode}
                                    onChange={(e) => {
                                        const mode = e.target.value as OpenRouterSearchMode;
                                        setFactCheckSearchModeState(mode);
                                        setFactCheckSearchMode(mode);
                                    }}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                >
                                    <option value="off">Off (default)</option>
                                    <option value="auto">Auto (native search else :online)</option>
                                    <option value="online_suffix">Force :online suffix</option>
                                    <option value="web_plugin">Force web plugin</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Applies to fact-check verification requests only.
                                </p>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4" />

                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                        <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace Root</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Repositories are fixed to this root. Change only here.</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Current Root</label>
                                    <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 break-all">
                                        {workspacePath || 'Not set'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">New Root Path</label>
                                    <input
                                        type="text"
                                        value={workspaceInput}
                                        onChange={(e) => handleWorkspaceInputChange(e.target.value)}
                                        placeholder="C:\\Path\\To\\Workspace"
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                {workspaceError && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <p className="text-sm text-red-600 dark:text-red-400">{workspaceError}</p>
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={handleWorkspaceSave}
                                        disabled={workspaceSaving || !workspaceInput.trim() || workspaceInput.trim() === workspacePath}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${workspaceSaved
                                            ? 'bg-green-500 text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {workspaceSaving ? (
                                            <>
                                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                                Updating...
                                            </>
                                        ) : workspaceSaved ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                Updated
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Set Root
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Changing the root may require reopening the repository to refresh the project list.
                                </p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {canClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${saved
                            ? 'bg-green-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                Saving...
                            </>
                        ) : saved ? (
                            <>
                                <Check className="w-4 h-4" />
                                Saved!
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save API Keys
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
