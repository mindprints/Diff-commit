
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Diff from 'diff';
import { DiffSegment, ViewMode, FontFamily, PolishMode } from './types';
import { Button } from './components/Button';
import { DiffSegment as DiffSegmentComponent } from './components/DiffSegment';
import { HelpModal } from './components/HelpModal';
import { generateDiffSummary, polishMergedText } from './services/ai';
import { runFactCheck, getFactCheckModels } from './services/factChecker';
import { MODELS, Model, getCostTier } from './constants/models';
import { RatingPrompt } from './components/RatingPrompt';
import { LogsModal } from './components/LogsModal';
import { AILogEntry } from './types';
import {
  ArrowRightLeft,
  RotateCcw,
  Copy,
  FileText,
  Sparkles,
  Wand2,
  ChevronRight,
  HelpCircle,
  Undo,
  Redo,
  Edit3,
  Type as TypeIcon,
  GripVertical,
  Volume2,
  Square,
  Check,
  Moon,
  Sun,
  X,
  BarChart3,
  Trash2,
  Shield
} from 'lucide-react';
import clsx from 'clsx';

type FontSize = 'sm' | 'base' | 'lg' | 'xl';

function App() {
  const [mode, setMode] = useState<ViewMode>(ViewMode.INPUT);
  const [originalText, setOriginalText] = useState<string>("Welcome to Diff & Commit AI!\n\nPaste your ORIGINAL text here. This is typically your first draft, the previous version, or the source you want to compare against.\n\nOnce you have text in both panels, click \"Compare Versions\" to see the differences highlighted interactively.");
  const [modifiedText, setModifiedText] = useState<string>("Welcome to Diff & Commit AI!\n\nPaste your REVISED text here. This is typically your edited version, AI-generated alternative, or the target you want to merge into.\n\nClick any highlighted difference to toggle it on or off. Use AI Polish to refine your final result!");

  // History Management
  const [segments, setSegments] = useState<DiffSegment[]>([]);
  const [history, setHistory] = useState<DiffSegment[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [previewText, setPreviewText] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [factCheckProgress, setFactCheckProgress] = useState<string>('');
  const [isPolishMenuOpen, setIsPolishMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Model & Cost Management
  const [selectedModel, setSelectedModel] = useState<Model>(MODELS[0]);
  const [sessionCost, setSessionCost] = useState<number>(0);

  const updateCost = (usage?: { inputTokens: number; outputTokens: number }) => {
    if (!usage) return;
    const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
      (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);
    setSessionCost(prev => prev + cost);
  };

  // Text to Speech
  const [isSpeaking, setIsSpeaking] = useState(false);
  const previewTextareaRef = useRef<HTMLTextAreaElement>(null);

  // AI Request Cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Error Handling
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rating & Logging
  const [activeLogId, setActiveLogId] = useState<string | null>(null);

  const logAIUsage = async (taskType: 'summary' | 'polish', usage: { inputTokens: number; outputTokens: number }) => {
    if (!selectedModel || !usage) return;

    const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
      (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);

    const logEntry: AILogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      taskType,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost
    };

    // Persist to electron-store if available
    if (window.electron && window.electron.logUsage) {
      await window.electron.logUsage(logEntry);
    }

    // Always show rating prompt after AI call
    setActiveLogId(logEntry.id);
  };

  const handleRate = async (id: string, rating: number, feedback?: string) => {
    if (window.electron && window.electron.updateLogRating) {
      await window.electron.updateLogRating(id, rating, feedback);
    }
  };

  // Appearance & Layout
  const [fontFamily, setFontFamily] = useState<FontFamily>('sans');
  const [fontSize, setFontSize] = useState<FontSize>('base');
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(50); // Percentage
  const [isDarkMode, setIsDarkMode] = useState(false);
  const isResizing = useRef(false);

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // When segments change, update preview text
  useEffect(() => {
    const computedText = segments
      .filter(s => s.isIncluded)
      .map(s => s.value)
      .join('');

    setPreviewText(computedText);
  }, [segments]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Resizing Logic
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = (e.clientX / window.innerWidth) * 100;
    if (newWidth > 20 && newWidth < 80) {
      setLeftPanelWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleResize, stopResizing]);

  const addToHistory = (newSegments: DiffSegment[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSegments);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSegments(newSegments);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSegments(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSegments(history[historyIndex + 1]);
    }
  };

  const performDiff = (source: string, target: string) => {
    const diffResult = Diff.diffWords(source, target);

    let uniqueIdCounter = 0;
    let groupCounter = 0;

    // First pass: create basic segments
    const initialSegments: DiffSegment[] = diffResult.map(part => {
      const id = `seg-${uniqueIdCounter++}`;
      let type: 'added' | 'removed' | 'unchanged' = 'unchanged';
      let isIncluded = true;

      if (part.added) {
        type = 'added';
        isIncluded = true; // Default: Accept additions
      }
      if (part.removed) {
        type = 'removed';
        isIncluded = false; // Default: Accept deletions (exclude from output)
      }

      return {
        id,
        value: part.value,
        type,
        isIncluded
      };
    });

    // Second pass: Group adjacent removed/added segments to treat them as replacements
    for (let i = 0; i < initialSegments.length - 1; i++) {
      const current = initialSegments[i];
      const next = initialSegments[i + 1];

      // Check for Removed -> Added pattern (Substitution)
      if ((current.type === 'removed' && next.type === 'added') ||
        (current.type === 'added' && next.type === 'removed')) {
        const groupId = `group-${groupCounter++}`;
        current.groupId = groupId;
        next.groupId = groupId;
        i++; // Skip next since it's paired
      }
    }

    setHistory([initialSegments]);
    setHistoryIndex(0);
    setSegments(initialSegments);
  };

  const handleCompare = () => {
    if (!originalText || !modifiedText) return;
    performDiff(originalText, modifiedText);
    setMode(ViewMode.DIFF);
    setSummary('');
  };

  const toggleSegment = (id: string) => {
    const currentSegment = segments.find(s => s.id === id);
    if (!currentSegment) return;

    const newIncludedState = !currentSegment.isIncluded;
    const groupId = currentSegment.groupId;

    const newSegments = segments.map(seg => {
      // Toggle the clicked segment
      if (seg.id === id) {
        return { ...seg, isIncluded: newIncludedState };
      }

      // If it belongs to the same group (e.g. it's the partner in a replacement),
      // flip it to the opposite of the clicked segment's new state.
      // Example: If I turn "Added" ON, turn "Removed" OFF.
      if (groupId && seg.groupId === groupId && seg.id !== id) {
        return { ...seg, isIncluded: !newIncludedState };
      }

      return seg;
    });

    addToHistory(newSegments);
  };

  const handleAcceptAll = () => {
    const newSegments = segments.map(seg => {
      if (seg.type === 'added') return { ...seg, isIncluded: true };
      if (seg.type === 'removed') return { ...seg, isIncluded: false };
      return seg;
    });
    addToHistory(newSegments);
  };

  const handleRejectAll = () => {
    const newSegments = segments.map(seg => {
      if (seg.type === 'added') return { ...seg, isIncluded: false };
      if (seg.type === 'removed') return { ...seg, isIncluded: true };
      return seg;
    });
    addToHistory(newSegments);
  };

  const cancelAIOperation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSummarizing(false);
    setIsPolishing(false);
    setIsFactChecking(false);
    setFactCheckProgress('');
  };

  const handleGenerateSummary = async () => {
    // Cancel any existing request
    cancelAIOperation();

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsSummarizing(true);
    setErrorMessage(null);
    const { text, usage, isError, isCancelled } = await generateDiffSummary(
      originalText,
      modifiedText,
      selectedModel,
      abortControllerRef.current.signal
    );

    // Don't update state if cancelled
    if (isCancelled) return;

    if (isError) {
      setErrorMessage(text);
    } else {
      setSummary(text);
      updateCost(usage);
      if (usage) logAIUsage('summary', usage);
    }
    setIsSummarizing(false);
    abortControllerRef.current = null;
  };

  const handlePolish = async (mode: PolishMode) => {
    // Cancel any existing request
    cancelAIOperation();

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsPolishMenuOpen(false);
    setIsPolishing(true);
    setErrorMessage(null);
    const { text: polished, usage, isError, isCancelled } = await polishMergedText(
      previewText,
      mode,
      selectedModel,
      abortControllerRef.current.signal
    );

    // Don't update state if cancelled
    if (isCancelled) return;

    if (isError) {
      setErrorMessage(polished);
      setIsPolishing(false);
      return;
    }

    updateCost(usage);
    if (usage) logAIUsage('polish', usage);

    // Update state to reflect the new comparison: Current Committed vs Polished
    setOriginalText(previewText);
    setModifiedText(polished);

    // Run the diff immediately
    performDiff(previewText, polished);

    setIsPolishing(false);
    abortControllerRef.current = null;

    let summaryText = "Comparison updated: Showing changes between your previous draft and the AI polished version.";
    if (mode === 'spelling') summaryText = "Comparison updated: Showing spelling corrections.";
    if (mode === 'grammar') summaryText = "Comparison updated: Showing grammar and spelling corrections.";
    if (mode === 'prompt') summaryText = "Comparison updated: Showing expanded detailed prompt instructions.";

    setSummary(summaryText);
  };

  const handleFactCheck = async () => {
    // Cancel any existing request
    cancelAIOperation();

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsPolishMenuOpen(false);
    setIsFactChecking(true);
    setFactCheckProgress('Starting fact check...');
    setErrorMessage(null);

    const { session, usage, isError, isCancelled, errorMessage } = await runFactCheck(
      previewText,
      (stage, _percent) => setFactCheckProgress(stage),
      abortControllerRef.current.signal
    );

    // Don't update state if cancelled
    if (isCancelled) return;

    if (isError) {
      setErrorMessage(errorMessage || 'Fact check failed.');
      setIsFactChecking(false);
      setFactCheckProgress('');
      return;
    }

    // Display the report in the summary field
    setSummary(session.report);

    // Calculate and update cost
    if (usage) {
      const models = getFactCheckModels();
      // Rough split: extraction uses ~20% of tokens, verification ~80%
      const extractionCost = (usage.inputTokens * 0.2 / 1_000_000 * models.extraction.inputPrice) +
        (usage.outputTokens * 0.2 / 1_000_000 * models.extraction.outputPrice);
      const verificationCost = (usage.inputTokens * 0.8 / 1_000_000 * models.verification.inputPrice) +
        (usage.outputTokens * 0.8 / 1_000_000 * models.verification.outputPrice);
      setSessionCost(prev => prev + extractionCost + verificationCost);

      // Log usage for both stages
      const sessionId = crypto.randomUUID();

      // Log extraction
      const extractionLog: AILogEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: models.extraction.id,
        modelName: models.extraction.name,
        taskType: 'fact-check-extraction',
        inputTokens: Math.round(usage.inputTokens * 0.2),
        outputTokens: Math.round(usage.outputTokens * 0.2),
        cost: extractionCost,
        sessionId
      };

      // Log verification  
      const verificationLog: AILogEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: models.verification.id,
        modelName: models.verification.name,
        taskType: 'fact-check-verification',
        inputTokens: Math.round(usage.inputTokens * 0.8),
        outputTokens: Math.round(usage.outputTokens * 0.8),
        cost: verificationCost,
        sessionId
      };

      // Persist to Electron store if available
      if (window.electron && window.electron.logUsage) {
        await window.electron.logUsage(extractionLog);
        await window.electron.logUsage(verificationLog);
      }

      // Trigger rating prompt
      setActiveLogId(verificationLog.id);
    }

    setIsFactChecking(false);
    setFactCheckProgress('');
    abortControllerRef.current = null;
  };

  const handleReadAloud = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textarea = previewTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    let textToSpeak = previewText;
    // If there's a selection, speak only that
    if (start !== end) {
      textToSpeak = previewText.substring(start, end);
    }

    if (!textToSpeak.trim()) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    // Optional: Select a voice if needed, but default is usually fine
    // const voices = window.speechSynthesis.getVoices();
    // utterance.voice = voices[0]; 

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const copyFinal = () => {
    navigator.clipboard.writeText(previewText);
  };

  const fontClasses = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono'
  };

  const sizeClasses = {
    sm: 'text-sm leading-loose',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-relaxed',
    xl: 'text-xl leading-relaxed'
  };

  // Keyboard shortcut for Undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  return (
    <div className={clsx("flex flex-col h-full bg-white dark:bg-slate-900 transition-colors duration-200")}>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <LogsModal isOpen={showLogs} onClose={() => setShowLogs(false)} />

      {/* Header */}
      <header className="flex-none h-16 border-b border-gray-200 dark:border-slate-800 px-6 flex items-center justify-between bg-white dark:bg-slate-900 z-10 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <ArrowRightLeft className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">Diff & Commit AI</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 mr-2">
            {/* Model Selector & Cost */}
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800/50 p-1 rounded-lg border border-gray-200 dark:border-slate-800">
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium ml-2 mr-1 min-w-[3rem] text-right">
                ${sessionCost.toFixed(4)}
              </span>
              <select
                className="text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-2 py-1 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[14rem] truncate"
                value={selectedModel.id}
                onChange={(e) => {
                  const model = MODELS.find(m => m.id === e.target.value);
                  if (model) setSelectedModel(model);
                }}
                title={`Select AI Model - Current: ${selectedModel.name} (${getCostTier(selectedModel)})`}
              >
                {MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {getCostTier(m)} {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 mr-2">
            {/* Font Family */}
            <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setFontFamily('sans')}
                className={clsx("p-1.5 rounded text-xs font-semibold transition-all w-10", fontFamily === 'sans' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Sans Serif"
              >
                Sans
              </button>
              <button
                onClick={() => setFontFamily('serif')}
                className={clsx("p-1.5 rounded text-xs font-serif font-semibold transition-all w-10", fontFamily === 'serif' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Serif"
              >
                Serif
              </button>
              <button
                onClick={() => setFontFamily('mono')}
                className={clsx("p-1.5 rounded text-xs font-mono font-semibold transition-all w-10", fontFamily === 'mono' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Monospace"
              >
                Mono
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setFontSize('sm')}
                className={clsx("w-8 p-1.5 rounded text-xs font-semibold transition-all", fontSize === 'sm' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Small Text"
              >
                S
              </button>
              <button
                onClick={() => setFontSize('base')}
                className={clsx("w-8 p-1.5 rounded text-sm font-semibold transition-all", fontSize === 'base' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Medium Text"
              >
                M
              </button>
              <button
                onClick={() => setFontSize('lg')}
                className={clsx("w-8 p-1.5 rounded text-base font-semibold transition-all", fontSize === 'lg' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Large Text"
              >
                L
              </button>
              <button
                onClick={() => setFontSize('xl')}
                className={clsx("w-8 p-1.5 rounded text-lg font-semibold transition-all", fontSize === 'xl' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300")}
                title="Extra Large Text"
              >
                XL
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setShowLogs(true)}
            className="text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2"
            title="View AI Usage Logs"
          >
            <BarChart3 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2"
            title="Help & Instructions"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {mode === ViewMode.DIFF && (
            <>
              <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1"></div>
              <div className="flex items-center gap-1">
                <button
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="p-2 text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-600 dark:disabled:hover:text-slate-400 transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="w-5 h-5" />
                </button>
                <button
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-2 text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-600 dark:disabled:hover:text-slate-400 transition-colors"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo className="w-5 h-5" />
                </button>
              </div>

              <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1"></div>

              <Button variant="ghost" onClick={() => setMode(ViewMode.INPUT)} size="sm" icon={<RotateCcw className="w-4 h-4" />}>
                Reset
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateSummary}
                  isLoading={isSummarizing}
                  disabled={isSummarizing || isPolishing}
                  icon={<Sparkles className="w-4 h-4 text-amber-500" />}
                >
                  AI Summary
                </Button>
                {isSummarizing && (
                  <button
                    onClick={cancelAIOperation}
                    className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Cancel AI Operation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* INPUT MODE */}
      {mode === ViewMode.INPUT && (
        <div className="w-full h-full flex flex-col md:flex-row p-6 gap-6 overflow-y-auto">
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Original Version</label>
              {originalText && (
                <button
                  onClick={() => setOriginalText('')}
                  className="text-xs text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                  title="Clear Original"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <textarea
              className={clsx(
                "flex-1 p-4 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none leading-relaxed shadow-sm",
                fontClasses[fontFamily],
                sizeClasses[fontSize]
              )}
              placeholder="Paste original text here..."
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
            />
          </div>

          <div className="flex-none flex flex-col items-center justify-center py-4 md:py-0 gap-3">
            <button
              onClick={() => setModifiedText(originalText)}
              className="p-2 bg-gray-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full md:rotate-0 rotate-90 transition-all shadow-sm active:scale-95 active:shadow-inner group"
              title="Copy Original to Revised"
            >
              <ChevronRight className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
            {(originalText || modifiedText) && (
              <button
                onClick={() => {
                  setOriginalText('');
                  setModifiedText('');
                }}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                title="Clear Both Panels"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Revised Version</label>
              {modifiedText && (
                <button
                  onClick={() => setModifiedText('')}
                  className="text-xs text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                  title="Clear Revised"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <textarea
              className={clsx(
                "flex-1 p-4 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none leading-relaxed shadow-sm",
                fontClasses[fontFamily],
                sizeClasses[fontSize]
              )}
              placeholder="Paste revised text here..."
              value={modifiedText}
              onChange={(e) => setModifiedText(e.target.value)}
            />
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <Button size="lg" onClick={handleCompare} className="shadow-xl rounded-full px-8">
              Compare Versions
            </Button>
          </div>
        </div>
      )}

      {/* DIFF MODE */}
      {mode === ViewMode.DIFF && (
        <div className="w-full h-full flex flex-row">
          {/* Editor Panel (Resizable) */}
          <div
            className="flex flex-col border-r border-gray-200 dark:border-slate-800 h-full overflow-hidden bg-gray-50/50 dark:bg-slate-900/50"
            style={{ width: `${leftPanelWidth}%` }}
          >
            <div className="flex-none p-4 border-b border-gray-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex justify-between items-center transition-colors duration-200">
              <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Interactive Diff
              </h2>
              <div className="flex gap-2 text-xs">
                <button onClick={handleAcceptAll} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800/50 transition">Accept All</button>
                <button onClick={handleRejectAll} className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition">Reject All</button>
              </div>
            </div>

            <div
              className={clsx(
                "flex-1 overflow-y-auto p-8 text-gray-800 dark:text-slate-200 bg-white dark:bg-slate-900 m-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-200",
                fontClasses[fontFamily],
                sizeClasses[fontSize]
              )}
            >
              {segments.map((seg) => (
                <DiffSegmentComponent key={seg.id} segment={seg} onClick={toggleSegment} />
              ))}
            </div>

            <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 flex justify-center gap-4 transition-colors duration-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-green-100 dark:bg-green-900/50 border border-green-500 dark:border-green-500/50 rounded-sm"></span>
                <span>Added</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-100 dark:bg-red-900/50 border border-red-500 dark:border-red-500/50 rounded-sm"></span>
                <span>Removed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-400 dark:border-blue-500/50 border-dashed rounded-sm"></span>
                <span>Restored</span>
              </div>
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            className="w-1 bg-gray-200 dark:bg-slate-800 hover:bg-indigo-400 dark:hover:bg-indigo-500 cursor-col-resize transition-colors active:bg-indigo-600 dark:active:bg-indigo-500 flex items-center justify-center z-20"
            onMouseDown={startResizing}
          >
            <div className="h-8 w-1 hover:w-2 transition-all rounded-full bg-gray-300 dark:bg-slate-600"></div>
          </div>

          {/* Preview/Output Panel (Resizable) */}
          <div
            className="flex flex-col h-full bg-white dark:bg-slate-900 relative z-0 transition-colors duration-200"
            style={{ width: `${100 - leftPanelWidth}%` }}
          >
            <div className="flex-none p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 relative transition-colors duration-200">
              <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Committed Preview
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReadAloud}
                  className={clsx("text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20", isSpeaking && "bg-indigo-100 dark:bg-indigo-900/40")}
                  title={isSpeaking ? "Stop Speaking" : "Read Aloud (Select text to read section)"}
                  icon={isSpeaking ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-4 h-4" />}
                >
                  {isSpeaking ? "Stop" : "Read"}
                </Button>
                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1"></div>

                <div className="relative flex items-center gap-1">
                  {isPolishMenuOpen && (
                    <div className="fixed inset-0 z-10" onClick={() => setIsPolishMenuOpen(false)}></div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPolishMenuOpen(!isPolishMenuOpen)}
                    isLoading={isPolishing || isFactChecking}
                    disabled={isPolishing || isSummarizing || isFactChecking}
                    icon={<Wand2 className="w-3 h-3" />}
                    className={clsx(isPolishMenuOpen && "bg-gray-50 dark:bg-slate-800 ring-2 ring-indigo-100 dark:ring-slate-700")}
                  >
                    {isFactChecking ? 'Checking...' : 'AI Edit...'}
                  </Button>
                  {(isPolishing || isFactChecking) && (
                    <button
                      onClick={cancelAIOperation}
                      className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Cancel AI Operation"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {isFactChecking && factCheckProgress && (
                    <span className="text-xs text-gray-500 dark:text-slate-400 max-w-32 truncate">
                      {factCheckProgress}
                    </span>
                  )}

                  {isPolishMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-100 dark:border-slate-700 py-1 z-20 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50 border-b border-gray-50 dark:border-slate-700">Correction Level</div>
                      <button onClick={() => handlePolish('spelling')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                        Spelling Only
                      </button>
                      <button onClick={() => handlePolish('grammar')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        Grammar Fix
                      </button>
                      <button onClick={() => handlePolish('polish')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 font-medium transition-colors flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                        Full Polish
                      </button>
                      <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                      <button onClick={() => handlePolish('prompt')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        Prompt Expansion
                      </button>
                      <button onClick={() => handlePolish('execute')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        Execute Prompt
                      </button>
                      <div className="border-t border-gray-100 dark:border-slate-700 my-1"></div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50">Verification</div>
                      <button onClick={handleFactCheck} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-500" />
                        Fact Check
                        <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">$$$$</span>
                      </button>
                    </div>
                  )}
                </div>

                <Button variant="primary" size="sm" onClick={copyFinal} icon={<Copy className="w-3 h-3" />}>
                  Copy
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col bg-gray-50/30 dark:bg-slate-950/30">
              <textarea
                ref={previewTextareaRef}
                className={clsx(
                  "flex-1 w-full h-full p-8 resize-none bg-transparent border-none focus:ring-0 text-gray-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 transition-colors outline-none",
                  fontClasses[fontFamily],
                  sizeClasses[fontSize]
                )}
                value={previewText}
                onChange={(e) => {
                  if (isSpeaking) {
                    window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }
                  setPreviewText(e.target.value);
                }}
                spellCheck={false}
                placeholder="Result will appear here. You can also edit this text directly."
              />
            </div>

            {/* Summary Drawer / Overlay */}
            {summary && (
              <div className="absolute bottom-0 left-0 right-0 bg-indigo-50 dark:bg-indigo-950 border-t border-indigo-100 dark:border-indigo-900 p-6 shadow-lg transform transition-transform duration-300 max-h-[50%] overflow-y-auto z-10">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-indigo-900 dark:text-indigo-100 font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> AI Summary
                  </h3>
                  <button onClick={() => setSummary('')} className="text-indigo-400 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-100">&times;</button>
                </div>
                <div className="prose prose-sm prose-indigo dark:prose-invert text-indigo-800 dark:text-indigo-200">
                  <p className="whitespace-pre-wrap">{summary}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rating Prompt Toast */}
      {activeLogId && (
        <div className="fixed bottom-6 right-6 z-50">
          <RatingPrompt
            logId={activeLogId}
            onRate={(id, rating, feedback) => {
              handleRate(id, rating, feedback);
              setActiveLogId(null);
            }}
            onDismiss={() => setActiveLogId(null)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
