
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Diff from 'diff';
import { DiffSegment, ViewMode, FontFamily, PolishMode, TextCommit, AIPrompt } from './types';
import { Button } from './components/Button';
import { DiffSegment as DiffSegmentComponent } from './components/DiffSegment';
import { HelpModal } from './components/HelpModal';
import { polishMergedText, polishMultipleRanges, polishWithPrompt, polishMultipleRangesWithPrompt } from './services/ai';
import { runFactCheck, getFactCheckModels } from './services/factChecker';
import { initSpellChecker, checkSpelling } from './services/spellChecker';
import { MODELS, Model, getCostTier } from './constants/models';
import { RatingPrompt } from './components/RatingPrompt';
import { LogsModal } from './components/LogsModal';
import { CommitHistoryModal } from './components/CommitHistoryModal';
import { ContextMenu } from './components/ContextMenu';
import { PromptsModal } from './components/PromptsModal';
import { ProjectsPanel } from './components/ProjectsPanel';
import { useCommitHistory } from './hooks/useCommitHistory';
import { useDiffState } from './hooks/useDiffState';
import { useScrollSync } from './hooks/useScrollSync';
import { useElectronMenu } from './hooks/useElectronMenu';
import { usePrompts } from './hooks/usePrompts';
import { useProjects } from './hooks/useProjects';
import MultiSelectTextArea, { MultiSelectTextAreaRef } from './components/MultiSelectTextArea';
import { MenuBar } from './components/MenuBar';
import { AILogEntry } from './types';
import {
  ArrowRightLeft,
  Copy,
  FileText,
  Sparkles,
  Wand2,
  ChevronRight,
  HelpCircle,
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
  Shield,
  RefreshCw,
  History,
  GitBranch,
  Link2,
  Settings,
  ArrowLeft,
  FolderOpen
} from 'lucide-react';
import clsx from 'clsx';

type FontSize = 'sm' | 'base' | 'lg' | 'xl';

// Characters that define word boundaries (whitespace and punctuation)
const BOUNDARY_CHARS = /[\s.,;:!?'"()\[\]{}<>\/\\|@#$%^&*+=~`\-_\n\r\t]/;

/**
 * Expand a selection range to the nearest word boundaries.
 * Auto-corrects for users who don't precisely select from word start to word end.
 */
function expandToWordBoundaries(start: number, end: number, text: string): { start: number; end: number } {
  if (text.length === 0 || start >= text.length) {
    return { start, end };
  }

  let expandedStart = start;
  let expandedEnd = end;

  // Expand start backwards until we hit a boundary or beginning of text
  while (expandedStart > 0 && !BOUNDARY_CHARS.test(text[expandedStart - 1])) {
    expandedStart--;
  }

  // Expand end forwards until we hit a boundary or end of text
  while (expandedEnd < text.length && !BOUNDARY_CHARS.test(text[expandedEnd])) {
    expandedEnd++;
  }

  return { start: expandedStart, end: expandedEnd };
}

function App() {
  const [mode, setMode] = useState<ViewMode>(ViewMode.DIFF);
  const [originalText, setOriginalText] = useState<string>('');
  const [modifiedText, setModifiedText] = useState<string>('');

  // Initialize spell checker
  useEffect(() => {
    initSpellChecker().catch(console.error);
  }, []);

  // Diff State Management (extracted to custom hook)
  const {
    segments,
    setSegments,
    addToHistory,
    resetDiffState,
    initializeHistory,
  } = useDiffState();

  const [previewText, setPreviewText] = useState<string>('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [factCheckProgress, setFactCheckProgress] = useState<string>('');
  const [isPolishMenuOpen, setIsPolishMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
  const previewTextareaRef = useRef<MultiSelectTextAreaRef>(null);

  // AI Prompts CRUD
  const {
    prompts: aiPrompts,
    builtInPrompts,
    customPrompts,
    getPrompt,
    createPrompt,
    updatePrompt,
    deletePrompt,
    resetBuiltIn,
    isLoading: promptsLoading,
  } = usePrompts();
  const [showPromptsModal, setShowPromptsModal] = useState(false);

  // Projects System
  const {
    projects,
    currentProject,
    loadProject,
    saveCurrentProject,
    createNewProject,
    deleteProject: deleteProjectById,
    renameProject: renameProjectById,
    openRepository,
    repositoryPath,
    getRepoHandle
  } = useProjects();
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);

  // Repository handler - uses native picker (Electron) or showDirectoryPicker (browser)
  const handleOpenRepository = useCallback(async () => {
    await openRepository();
    setShowProjectsPanel(true);
  }, [openRepository]);

  const handleNewProject = useCallback(() => {
    setShowProjectsPanel(true);
    // ProjectsPanel will handle the create flow
  }, []);

  const handleSwitchProject = useCallback(() => {
    setShowProjectsPanel(true);
  }, []);

  // AI Request Cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Error Handling
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rating & Logging
  const [activeLogId, setActiveLogId] = useState<string | null>(null);

  // Commit History (extracted to custom hook)
  const getCommitText = useCallback(() => {
    return mode === ViewMode.DIFF ? previewText : originalText;
  }, [mode, previewText, originalText]);

  const onAfterCommit = useCallback((committedText: string) => {
    // After commit: both panes should have matching content, stay in DIFF mode
    setOriginalText(committedText);
    setPreviewText(committedText);
    setModifiedText('');
    resetDiffState();
    // Stay in DIFF mode - do NOT switch to INPUT mode
  }, [resetDiffState]);

  // Memoize browser FS callbacks to prevent stale closures
  const browserLoadCommits = useMemo(() => {
    if (!currentProject?.name) return undefined;
    return async () => {
      const handle = getRepoHandle();
      if (handle && currentProject.name) {
        const { loadProjectCommits } = await import('./services/browserFileSystem');
        return loadProjectCommits(handle, currentProject.name);
      }
      return [];
    };
  }, [currentProject?.name, getRepoHandle]);

  const browserSaveCommits = useMemo(() => {
    if (!currentProject?.name) return undefined;
    return async (commits: any[]) => {
      const handle = getRepoHandle();
      if (handle && currentProject.name) {
        const { saveProjectCommits } = await import('./services/browserFileSystem');
        return saveProjectCommits(handle, currentProject.name, commits);
      }
      return false;
    };
  }, [currentProject?.name, getRepoHandle]);

  const {
    commits,
    setCommits,
    showCommitHistory,
    setShowCommitHistory,
    handleCommit,
    handleDeleteCommit,
    handleClearAllCommits,
  } = useCommitHistory({
    getCommitText,
    onAfterCommit,
    currentProjectPath: currentProject?.path,
    currentProjectName: currentProject?.name,
    browserLoadCommits,
    browserSaveCommits,
  });

  // Context Menu for text selection
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selection: string } | null>(null);

  const logAIUsage = async (taskType: string, usage: { inputTokens: number; outputTokens: number }, durationMs?: number) => {
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
      cost,
      durationMs
    };

    // Persist to electron-store if available, otherwise use localStorage
    if (window.electron && window.electron.logUsage) {
      await window.electron.logUsage(logEntry);
    } else {
      // Fallback to localStorage for web/localhost testing
      try {
        const stored = localStorage.getItem('diff-commit-logs');
        const logs: AILogEntry[] = stored ? JSON.parse(stored) : [];
        logs.push(logEntry);
        // Keep max 1000 logs
        if (logs.length > 1000) logs.shift();
        localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
      } catch (e) {
        console.warn('Failed to save log to localStorage:', e);
      }
    }

    // Always show rating prompt after AI call
    setActiveLogId(logEntry.id);
  };

  const handleRate = async (id: string, rating: number, feedback?: string) => {
    if (window.electron && window.electron.updateLogRating) {
      await window.electron.updateLogRating(id, rating, feedback);
    }
  };

  // Commit handlers that need access to other state (kept in App)
  const handleRestoreCommit = (commit: TextCommit) => {
    // Restore to both panels with identical content, stay in DIFF mode
    setOriginalText(commit.content);
    setPreviewText(commit.content);
    setModifiedText('');
    resetDiffState();
    // Stay in DIFF mode - do NOT switch to INPUT mode
  };

  const handleCompareCommit = (commit: TextCommit) => {
    setOriginalText(commit.content);
    setModifiedText(originalText);
    performDiff(commit.content, originalText);
    setMode(ViewMode.DIFF);
  };

  // Appearance & Layout
  const [fontFamily, setFontFamily] = useState<FontFamily>('sans');
  const [fontSize, setFontSize] = useState<FontSize>('base');
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(50); // Percentage
  const [isDarkMode, setIsDarkMode] = useState(true);
  const isResizing = useRef(false);

  // Scroll Sync (extracted to custom hook)
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const {
    isScrollSyncEnabled,
    setIsScrollSyncEnabled,
    handleScrollSync,
  } = useScrollSync({ leftPaneRef, rightPaneRef: previewTextareaRef });

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // When segments change, update preview text (but only if we have segments)
  // If segments is empty, don't overwrite previewText - it may have been set directly
  useEffect(() => {
    if (segments.length === 0) return; // Don't clear previewText when segments are empty

    const computedText = segments
      .filter(s => s.isIncluded)
      .map(s => s.value)
      .join('');

    setPreviewText(computedText);
  }, [segments]);

  // Auto-compare when both panes have content
  // Using a ref to track if we've already triggered to prevent re-triggering on every keystroke
  const hasAutoCompared = useRef(false);

  useEffect(() => {
    const hasLeft = originalText.trim().length > 0;
    const hasRight = modifiedText.trim().length > 0;

    // Reset the flag when either pane becomes empty
    if (!hasLeft || !hasRight) {
      hasAutoCompared.current = false;
      return;
    }

    // Auto-compare when both panes have content and we're still in INPUT mode
    if (hasLeft && hasRight && mode === ViewMode.INPUT && !hasAutoCompared.current) {
      hasAutoCompared.current = true;
      performDiff(originalText, modifiedText);
      setMode(ViewMode.DIFF);
    }
  }, [originalText, modifiedText, mode]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Electron Menu Event Listeners (extracted to custom hook)
  useElectronMenu({
    mode,
    previewText,
    originalText,
    commits,
    onFileOpened: (content) => {
      // Set content in both panels, stay in DIFF mode
      setOriginalText(content);
      setPreviewText(content);
      setModifiedText('');
      resetDiffState();
      // Stay in DIFF mode - do NOT switch to INPUT mode
    },
    getSaveText: () => mode === ViewMode.DIFF ? previewText : originalText,
    onClearAll: () => {
      setOriginalText('');
      setModifiedText('');
      setPreviewText('');
      resetDiffState();
      // Stay in DIFF mode - just clear the text
    },
    onCommitsImported: (importedCommits) => {
      setCommits(prev => [...prev, ...importedCommits]);
    },
    onToggleDark: () => setIsDarkMode(prev => !prev),
    onFontSize: (size) => setFontSize(size as FontSize),
    onFontFamily: (family) => setFontFamily(family as FontFamily),
    onShowHelp: () => setShowHelp(true),
    onShowLogs: () => setShowLogs(true),
    onShowCommitHistory: () => setShowCommitHistory(true),
    // Tool handlers
    onPolish: (mode) => handleAIEdit(mode), // Accessing handleAIEdit which handles all polish modes now
    onFactCheck: () => handleFactCheck(),
    onManagePrompts: () => setShowPromptsModal(true),
    onManageProjects: () => setShowProjectsPanel(true),
    onNewProject: () => setShowProjectsPanel(true),
    onSwitchProject: () => setShowProjectsPanel(true),
    onOpenRepository: () => { openRepository(); setShowProjectsPanel(true); },
  });

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

    initializeHistory(initialSegments);
  };

  const handleCompare = () => {
    if (!originalText || !modifiedText) return;
    performDiff(originalText, modifiedText);
    setMode(ViewMode.DIFF);
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
    setIsPolishing(false);
    setIsFactChecking(false);
    setFactCheckProgress('');
  };



  // Helper to get the source text for AI operations
  // Handles both diff mode (uses previewText) and input mode (uses available tab text)
  const getSourceTextForAI = (): { sourceText: string; fromRightTab: boolean } => {
    // In DIFF mode with previewText, use it
    if (previewText.trim()) {
      return { sourceText: previewText, fromRightTab: true };
    }

    // Check originalText (left panel) and modifiedText (right panel in input)
    const hasLeft = originalText.trim().length > 0;
    const hasRight = modifiedText.trim().length > 0;

    if (hasRight && !hasLeft) {
      // Only right tab has text - will need to move it to left
      return { sourceText: modifiedText, fromRightTab: true };
    } else if (hasLeft) {
      // Left tab has text (or both have text - prefer left as source)
      return { sourceText: originalText, fromRightTab: false };
    } else if (hasRight) {
      return { sourceText: modifiedText, fromRightTab: true };
    }

    return { sourceText: '', fromRightTab: false };
  };

  const handlePolish = async (polishMode: PolishMode) => {
    // Cancel any existing request
    cancelAIOperation();

    // Get source text (handles both diff and input modes)
    const { sourceText, fromRightTab } = getSourceTextForAI();

    if (!sourceText.trim()) {
      setErrorMessage('Please enter some text first.');
      return;
    }

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsPolishMenuOpen(false);
    setIsPolishing(true);
    setErrorMessage(null);

    const startTime = Date.now();
    const { text: polished, usage, isError, isCancelled } = await polishMergedText(
      sourceText,
      polishMode,
      selectedModel,
      abortControllerRef.current.signal
    );
    const durationMs = Date.now() - startTime;

    // Don't update state if cancelled
    if (isCancelled) return;

    if (isError) {
      setErrorMessage(polished);
      setIsPolishing(false);
      return;
    }

    updateCost(usage);
    // Map polishMode to human-readable task name
    const taskName = polishMode === 'spelling' ? 'Spelling'
      : polishMode === 'grammar' ? 'Grammar'
        : polishMode === 'prompt' ? 'Prompt Expansion'
          : 'Full Polish';
    if (usage) logAIUsage(taskName, usage, durationMs);

    // If text was in right tab only, move it to left first
    if (fromRightTab) {
      setOriginalText(sourceText);
    } else {
      setOriginalText(sourceText);
    }
    setModifiedText(polished);

    // Run the diff immediately and switch to DIFF mode
    performDiff(sourceText, polished);
    setMode(ViewMode.DIFF);

    setIsPolishing(false);
    abortControllerRef.current = null;
  };

  const handleFactCheck = async () => {
    // Cancel any existing request
    cancelAIOperation();

    // Get source text (handles both diff and input modes)
    const { sourceText } = getSourceTextForAI();

    if (!sourceText.trim()) {
      setErrorMessage('Please enter some text first.');
      return;
    }

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsPolishMenuOpen(false);
    setIsFactChecking(true);
    setFactCheckProgress('Starting fact check...');
    setErrorMessage(null);

    const { session, usage, isError, isCancelled, errorMessage } = await runFactCheck(
      sourceText,
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

    // Display the report in the error message field for now (since summary was removed)
    setErrorMessage(null); // Clear any previous errors

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

  // Handle AI polish on selected text (uses native textarea selection)
  const handlePolishSelection = async (polishMode: PolishMode) => {
    // Get native textarea selection
    const textarea = previewTextareaRef.current?.getTextarea();
    let start = 0;
    let end = previewText.length;
    let selectedText = previewText;

    if (textarea) {
      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      if (selStart !== selEnd) {
        // Auto-expand to word boundaries for careless selections
        const expanded = expandToWordBoundaries(selStart, selEnd, previewText);
        start = expanded.start;
        end = expanded.end;
        selectedText = previewText.substring(start, end);
      }
    }

    if (!selectedText.trim()) {
      setErrorMessage('Please select some text first.');
      return;
    }

    // Cancel any existing request
    cancelAIOperation();

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsPolishing(true);
    setErrorMessage(null);

    const startTime = Date.now();
    const { results, usage, isError, isCancelled, errorMessage: aiError } = await polishMultipleRanges(
      [{ id: 'selection', text: selectedText }],
      polishMode,
      selectedModel,
      abortControllerRef.current.signal
    );
    const durationMs = Date.now() - startTime;

    // Don't update state if cancelled
    if (isCancelled) return;

    if (isError) {
      setErrorMessage(aiError || 'AI polish failed.');
      setIsPolishing(false);
      return;
    }

    updateCost(usage);
    // Map polishMode to human-readable task name
    const taskName = polishMode === 'spelling' ? 'Spelling (Selection)'
      : polishMode === 'grammar' ? 'Grammar (Selection)'
        : polishMode === 'prompt' ? 'Prompt Expansion (Selection)'
          : 'Full Polish (Selection)';
    if (usage) logAIUsage(taskName, usage, durationMs);

    // Apply result back to the text at the selection position
    if (results.length > 0) {
      const result = results[0].result;
      const newText = previewText.slice(0, start) + result + previewText.slice(end);

      // Store the original (pre-edit) text for diffing
      setOriginalText(previewText);
      setPreviewText(newText);
      setModifiedText(newText);

      // Run diff and switch to diff mode to show the changes
      performDiff(previewText, newText);
      setMode(ViewMode.DIFF);
    }

    setIsPolishing(false);
    abortControllerRef.current = null;
  };

  const handleLocalSpellCheck = async () => {
    setIsPolishMenuOpen(false);

    // Get source text
    const { sourceText, fromRightTab } = getSourceTextForAI();

    if (!sourceText.trim()) {
      setErrorMessage('Please enter some text first.');
      return;
    }

    try {
      await initSpellChecker();
      const result = checkSpelling(sourceText);

      if (result.isError) {
        setErrorMessage(result.errorMessage || 'Spell check failed');
        return;
      }

      if (fromRightTab) {
        setOriginalText(sourceText);
      } else {
        setOriginalText(sourceText);
      }
      setModifiedText(result.text);

      performDiff(sourceText, result.text);
      setMode(ViewMode.DIFF);

    } catch (e) {
      console.error(e);
      setErrorMessage('Failed to run spell check');
    }
  };

  // Smart AI Edit handler - routes to selection-based or full-text editing
  // Now accepts prompt ID (string) and looks up full prompt object
  const handleAIEdit = async (promptId: string) => {
    // Special case: use local spell checker for spelling
    if (promptId === 'spelling_local') {
      return handleLocalSpellCheck();
    }

    // Look up the full prompt object
    const prompt = getPrompt(promptId);

    // Close menu
    setIsPolishMenuOpen(false);

    // Check for native textarea selection
    const textarea = previewTextareaRef.current?.getTextarea();
    let selStart = 0;
    let selEnd = 0;
    let selectedText = '';

    if (textarea) {
      const rawStart = textarea.selectionStart;
      const rawEnd = textarea.selectionEnd;
      if (rawStart !== rawEnd) {
        // Auto-expand to word boundaries for careless selections
        const expanded = expandToWordBoundaries(rawStart, rawEnd, previewText);
        selStart = expanded.start;
        selEnd = expanded.end;
        selectedText = previewText.substring(selStart, selEnd);
      }
    }

    // If there's a selection, handle it with the prompt
    if (selectedText.trim()) {
      cancelAIOperation();
      abortControllerRef.current = new AbortController();
      setIsPolishing(true);
      setErrorMessage(null);

      // Use the prompt-based function with single selection
      const startTime = Date.now();
      const { results, usage, isError, isCancelled, errorMessage: aiError } = await polishMultipleRangesWithPrompt(
        [{ id: 'selection', text: selectedText }],
        prompt,
        selectedModel,
        abortControllerRef.current.signal
      );
      const durationMs = Date.now() - startTime;

      if (isCancelled) return;

      if (isError) {
        setErrorMessage(aiError || 'AI polish failed.');
        setIsPolishing(false);
        return;
      }

      updateCost(usage);
      if (usage) logAIUsage(`${prompt.name} (Selection)`, usage, durationMs);

      // Apply result back to the text at the selection position
      if (results.length > 0) {
        const result = results[0].result;
        const newText = previewText.slice(0, selStart) + result + previewText.slice(selEnd);

        // Store the original (pre-edit) text for diffing
        setOriginalText(previewText);
        setPreviewText(newText);
        setModifiedText(newText);

        // Run diff and switch to diff mode
        performDiff(previewText, newText);
        setMode(ViewMode.DIFF);
      }

      setIsPolishing(false);
      abortControllerRef.current = null;

      return;
    }

    // No selections - run full-text polish with the prompt object
    cancelAIOperation();

    const { sourceText, fromRightTab } = getSourceTextForAI();

    if (!sourceText.trim()) {
      setErrorMessage('Please enter some text first.');
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsPolishing(true);
    setErrorMessage(null);

    // Use polishWithPrompt with the full prompt object
    const startTime = Date.now();
    const { text: polished, usage, isError, isCancelled } = await polishWithPrompt(
      sourceText,
      prompt,
      selectedModel,
      abortControllerRef.current.signal
    );
    const durationMs = Date.now() - startTime;

    if (isCancelled) return;

    if (isError) {
      setErrorMessage(polished);
      setIsPolishing(false);
      return;
    }

    updateCost(usage);
    if (usage) logAIUsage(prompt.name, usage, durationMs);

    if (fromRightTab) {
      setOriginalText(sourceText);
    } else {
      setOriginalText(sourceText);
    }
    setModifiedText(polished);

    performDiff(sourceText, polished);
    setMode(ViewMode.DIFF);

    setIsPolishing(false);
    abortControllerRef.current = null;
  };

  // Open context menu on right-click
  const handleOpenContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = start !== end ? previewText.substring(start, end) : '';

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selection
    });
  };

  const handleReadAloud = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    let textToSpeak = previewText;

    // Check for native textarea selection
    const textarea = previewTextareaRef.current?.getTextarea();
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) {
        textToSpeak = previewText.substring(start, end);
      }
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

  // Copy right panel content to left panel (same as accept)
  const copyRightToLeft = () => {
    if (previewText.trim()) {
      setOriginalText(previewText);
      setModifiedText('');
      resetDiffState();
    }
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



  // Track Shift key for Commit button behavior
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Accept without saving - copies right to left, clears diffs
  const handleAccept = useCallback(() => {
    if (!previewText.trim()) return;

    // Copy right panel content to left panel
    setOriginalText(previewText);
    setModifiedText('');
    resetDiffState();
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
  }, [previewText, resetDiffState]);

  // Combined handler for Commit button - Accept or Save based on Shift
  const handleCommitClick = useCallback(() => {
    if (isShiftHeld) {
      // Shift+Click: Actually save to commit history
      handleCommit();
      setHasUnsavedChanges(false); // Mark as saved
    } else {
      // Regular click: Just accept (copy right to left, no save)
      handleAccept();
    }
  }, [isShiftHeld, handleCommit, handleAccept]);

  // Web-only handlers for MenuBar
  const handleWebSave = useCallback(() => {
    const textToSave = mode === ViewMode.DIFF ? previewText : originalText;
    if (!textToSave.trim()) return;
    const blob = new Blob([textToSave], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [mode, previewText, originalText]);

  const handleWebExportCommits = useCallback(() => {
    if (commits.length === 0) return;
    const blob = new Blob([JSON.stringify(commits, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commits-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [commits]);

  const handleWebImportCommits = useCallback((content: string) => {
    try {
      const imported = JSON.parse(content);
      if (Array.isArray(imported)) {
        setCommits(prev => [...prev, ...imported]);
      }
    } catch (e) {
      console.error('Invalid JSON', e);
      setErrorMessage('Invalid JSON file');
    }
  }, [setCommits]);

  return (
    <div className={clsx("flex flex-col h-full bg-white dark:bg-slate-900 transition-colors duration-200")}>
      <MenuBar
        mode={mode}
        onFileOpen={(content) => {
          setOriginalText(content);
          setPreviewText(content);
          setModifiedText('');
          resetDiffState();
        }}
        onSaveFile={handleWebSave}
        onExportCommits={handleWebExportCommits}
        onImportCommits={handleWebImportCommits}
        onClearAll={() => {
          setOriginalText('');
          setModifiedText('');
          setPreviewText('');
          resetDiffState();
        }}
        onToggleDark={() => setIsDarkMode(prev => !prev)}
        onFontSize={(size) => setFontSize(size)}
        onFontFamily={(family) => setFontFamily(family)}
        onShowHelp={() => setShowHelp(true)}
        onShowLogs={() => setShowLogs(true)}
        onShowCommitHistory={() => setShowCommitHistory(true)}
        onPolish={(mode) => handleAIEdit(mode)}
        onFactCheck={() => handleFactCheck()}
        onManagePrompts={() => setShowPromptsModal(true)}
        onManageProjects={() => setShowProjectsPanel(true)}
        onOpenRepository={handleOpenRepository}
        onNewProject={handleNewProject}
        onSwitchProject={handleSwitchProject}
      />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <LogsModal isOpen={showLogs} onClose={() => setShowLogs(false)} />

      {/* Header */}
      <header className="flex-none h-16 border-b border-gray-200 dark:border-slate-800 px-6 flex items-center justify-between bg-white dark:bg-slate-900 z-10 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-2">
          <img src="./header_icon_styled.png" alt="Diff & Commit AI" className="h-8" />
          {repositoryPath && (
            <>
              <span className="text-gray-300 dark:text-slate-600">/</span>
              <span className="text-lg font-medium text-gray-700 dark:text-slate-300 truncate max-w-[150px]" title={repositoryPath}>
                {repositoryPath.split(/[\\/]/).pop()}
              </span>
            </>
          )}
          {currentProject && (
            <>
              <span className="text-gray-300 dark:text-slate-600">/</span>
              <span className="text-lg font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]" title={currentProject.name}>
                {currentProject.name}
              </span>
            </>
          )}
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

          {/* Settings Dropdown - Font, Size, Dark Mode */}
          <div className="relative">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={clsx(
                "text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2",
                isSettingsOpen && "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded"
              )}
              title="Appearance Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            {isSettingsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSettingsOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700 py-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Dark Mode Toggle */}
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-slate-300">Dark Mode</span>
                    <button
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={clsx(
                        "w-10 h-6 rounded-full transition-colors relative",
                        isDarkMode ? "bg-indigo-600" : "bg-gray-300 dark:bg-slate-600"
                      )}
                    >
                      <span className={clsx(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow",
                        isDarkMode ? "translate-x-5" : "translate-x-1"
                      )} />
                    </button>
                  </div>

                  <div className="border-t border-gray-100 dark:border-slate-700 my-2" />

                  {/* Font Family */}
                  <div className="px-4 py-2">
                    <div className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Font Family</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setFontFamily('sans')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all", fontFamily === 'sans' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        Sans
                      </button>
                      <button
                        onClick={() => setFontFamily('serif')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-xs font-serif font-semibold transition-all", fontFamily === 'serif' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        Serif
                      </button>
                      <button
                        onClick={() => setFontFamily('mono')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-xs font-mono font-semibold transition-all", fontFamily === 'mono' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        Mono
                      </button>
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="px-4 py-2">
                    <div className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Font Size</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setFontSize('sm')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all", fontSize === 'sm' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        S
                      </button>
                      <button
                        onClick={() => setFontSize('base')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-sm font-semibold transition-all", fontSize === 'base' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        M
                      </button>
                      <button
                        onClick={() => setFontSize('lg')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-base font-semibold transition-all", fontSize === 'lg' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        L
                      </button>
                      <button
                        onClick={() => setFontSize('xl')}
                        className={clsx("flex-1 px-2 py-1.5 rounded text-lg font-semibold transition-all", fontSize === 'xl' ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700")}
                      >
                        XL
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* <button
            onClick={() => setShowProjectsPanel(true)}
            className={clsx(
              "text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 relative",
              currentProject && "text-indigo-600 dark:text-indigo-400"
            )}
            title={currentProject ? `Project: ${currentProject.name}` : "Projects"}
          >
            <FolderOpen className="w-5 h-5" />
            {projects.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {projects.length}
              </span>
            )}
          </button> */}

          <button
            onClick={() => setShowLogs(true)}
            className="text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2"
            title="View AI Usage Logs"
          >
            <BarChart3 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowCommitHistory(true)}
            className="text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 relative"
            title="Commit History"
          >
            <History className="w-5 h-5" />
            {commits.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {commits.length}
              </span>
            )}
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


              <button
                onClick={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                className={clsx(
                  "p-2 rounded transition-colors",
                  isScrollSyncEnabled
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                    : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400"
                )}
                title={isScrollSyncEnabled ? "Scroll Sync: ON" : "Scroll Sync: OFF"}
              >
                <Link2 className="w-5 h-5" />
              </button>

              <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1"></div>

              <Button
                variant="ghost"
                onClick={() => {
                  setOriginalText('');
                  setModifiedText('');
                  setPreviewText('');
                  resetDiffState();
                  // Stay in DIFF mode, just clear the text
                }}
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
              >
                Clear All
              </Button>

              <Button variant="primary" size="sm" onClick={copyFinal} icon={<Copy className="w-4 h-4" />}>
                Copy
              </Button>


            </>
          )}
        </div>
      </header>

      {/* DIFF MODE - Now the only mode */}
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
              ref={leftPaneRef}
              onScroll={() => handleScrollSync('left')}
              className={clsx(
                "flex-1 overflow-y-auto p-8 text-gray-800 dark:text-slate-200 bg-white dark:bg-slate-900 m-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-200 whitespace-pre-wrap",
                fontClasses[fontFamily],
                sizeClasses[fontSize]
              )}
            >
              {segments.length > 0 ? (
                segments.map((seg) => (
                  <DiffSegmentComponent key={seg.id} segment={seg} onClick={toggleSegment} />
                ))
              ) : (
                // No segments - show originalText as plain text (after accept/commit)
                <span className="text-gray-600 dark:text-slate-400">{originalText || 'Enter or paste text in the right panel, then use AI Edit or Compare to see differences here.'}</span>
              )}
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
            className="flex flex-col h-full bg-white dark:bg-slate-900 relative z-0 transition-colors duration-200 overflow-hidden"
            style={{ width: `${100 - leftPanelWidth}%` }}
          >
            <div className="flex-none p-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 relative transition-colors duration-200">
              <h2 className="font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Committed Preview
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={copyRightToLeft}
                  disabled={!previewText.trim()}
                  className="px-2 py-1 text-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800/50 transition disabled:opacity-30 flex items-center gap-1"
                  title="Copy right panel content to left panel"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
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
                    disabled={isPolishing || isFactChecking}
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
                    <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-100 dark:border-slate-700 py-1 z-20 animate-in fade-in zoom-in-95 duration-100 overflow-hidden max-h-[70vh] overflow-y-auto">
                      {/* Built-in Prompts */}
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50 border-b border-gray-50 dark:border-slate-700">
                        Correction Level
                      </div>
                      {builtInPrompts.map(prompt => (
                        <button
                          key={prompt.id}
                          onClick={() => handleAIEdit(prompt.id)}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2"
                        >
                          <span className={clsx("w-1.5 h-1.5 rounded-full", prompt.color || 'bg-gray-400')} />
                          {prompt.name}
                        </button>
                      ))}

                      {/* Custom Prompts */}
                      {customPrompts.length > 0 && (
                        <>
                          <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                          <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50">
                            Custom Prompts
                          </div>
                          {customPrompts.map(prompt => (
                            <button
                              key={prompt.id}
                              onClick={() => handleAIEdit(prompt.id)}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors flex items-center gap-2"
                            >
                              <span className={clsx("w-1.5 h-1.5 rounded-full", prompt.color || 'bg-gray-400')} />
                              {prompt.name}
                            </button>
                          ))}
                        </>
                      )}

                      {/* Verification Section */}
                      <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-900/50">
                        Verification
                      </div>
                      <button onClick={handleFactCheck} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-500" />
                        Fact Check
                        <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">$$$$</span>
                      </button>

                      {/* Manage Prompts */}
                      <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                      <button
                        onClick={() => { setIsPolishMenuOpen(false); setShowPromptsModal(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:text-gray-700 dark:hover:text-slate-300 transition-colors flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        Manage Prompts...
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    // Re-compare: use current previewText as the new modified text
                    setModifiedText(previewText);
                    performDiff(originalText, previewText);
                  }}
                  size="sm"
                  icon={<RefreshCw className="w-3 h-3" />}
                  title="Re-compare after editing the preview"
                >
                  Compare
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCommitClick}
                  disabled={!previewText.trim()}
                  className={clsx(
                    "relative transition-all min-w-[6rem]",
                    isShiftHeld
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      : hasUnsavedChanges
                        ? "bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"
                        : "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  )}
                  icon={<GitBranch className="w-3 h-3" />}
                  title={isShiftHeld
                    ? "Save to commit history"
                    : "Accept changes (Shift+Click to save to history)"
                  }
                >
                  {isShiftHeld ? 'Save Commit' : 'Commit'}
                  {commits.length > 0 && !isShiftHeld && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px] font-bold">
                      {commits.length}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col bg-gray-50/50 dark:bg-slate-900/50 min-h-0 overflow-hidden">
              <div className="flex-1 m-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden relative transition-colors duration-200">
                <MultiSelectTextArea
                  ref={previewTextareaRef}
                  value={previewText}
                  onChange={(newValue) => {
                    if (isSpeaking) {
                      window.speechSynthesis.cancel();
                      setIsSpeaking(false);
                    }
                    setPreviewText(newValue);
                  }}
                  className={clsx(
                    "flex-1 w-full resize-none bg-transparent border-none focus:ring-0 text-gray-800 dark:text-slate-200 transition-colors outline-none overflow-y-auto",
                    fontClasses[fontFamily],
                    sizeClasses[fontSize]
                  )}
                  fontClassName={fontClasses[fontFamily]}
                  sizeClassName={sizeClasses[fontSize]}
                  spellCheck={false}
                  placeholder="Result will appear here. You can also edit this text directly."
                  onContextMenu={handleOpenContextMenu}
                  onScroll={() => handleScrollSync('right')}
                />
              </div>
            </div>

            <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center bg-gray-50 dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 flex justify-center gap-4 transition-colors duration-200">
              <button className="flex items-center gap-1.5 hover:text-indigo-500 transition-colors" title="Word Count (Dummy)">
                <span className="w-2.5 h-2.5 bg-gray-300 dark:bg-slate-600 rounded-sm"></span>
                <span>Words: {previewText.trim() ? previewText.trim().split(/\s+/).length : 0}</span>
              </button>
            </div>


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

      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md animate-in slide-in-from-bottom-2 duration-200">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg shadow-lg p-4 flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 text-red-500 dark:text-red-400 mt-0.5">
              <X className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="flex-shrink-0 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Commit History Modal */}
      <CommitHistoryModal
        isOpen={showCommitHistory}
        onClose={() => setShowCommitHistory(false)}
        commits={commits}
        onRestore={handleRestoreCommit}
        onCompare={handleCompareCommit}
        onDelete={handleDeleteCommit}
        onClearAll={handleClearAllCommits}
        currentOriginalText={originalText}
      />

      {/* Context Menu for text selection */}
      <ContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        isOpen={!!contextMenu}
        onClose={() => setContextMenu(null)}
        actions={[
          {
            label: 'Read Selected',
            icon: <Volume2 className="w-4 h-4" />,
            onClick: handleReadAloud,
            disabled: !contextMenu?.selection
          },
          {
            label: 'Spelling Only',
            icon: <Wand2 className="w-4 h-4 text-blue-500" />,
            onClick: () => handlePolishSelection('spelling'),
            disabled: !contextMenu?.selection,
            divider: true
          },
          {
            label: 'Grammar & Spelling',
            icon: <Wand2 className="w-4 h-4 text-emerald-500" />,
            onClick: () => handlePolishSelection('grammar'),
            disabled: !contextMenu?.selection
          },
          {
            label: 'Full Polish',
            icon: <Wand2 className="w-4 h-4 text-purple-500" />,
            onClick: () => handlePolishSelection('polish'),
            disabled: !contextMenu?.selection,
            subLabel: '$$'
          },
          {
            label: 'Prompt Expansion',
            icon: <Wand2 className="w-4 h-4 text-amber-500" />,
            onClick: () => handlePolishSelection('prompt'),
            disabled: !contextMenu?.selection,
            divider: true
          },
          {
            label: 'Execute Prompt',
            icon: <Wand2 className="w-4 h-4 text-rose-500" />,
            onClick: () => handlePolishSelection('execute'),
            disabled: !contextMenu?.selection
          },
          {
            label: 'Fact Check',
            icon: <Shield className="w-4 h-4 text-cyan-500" />,
            onClick: handleFactCheck,
            disabled: !contextMenu?.selection,
            subLabel: '$$$$',
            divider: true
          }
        ]}
      />

      {/* Prompts Management Modal */}
      <PromptsModal
        isOpen={showPromptsModal}
        onClose={() => setShowPromptsModal(false)}
        prompts={aiPrompts}
        onCreatePrompt={async (data) => { await createPrompt(data); }}
        onUpdatePrompt={async (id, updates) => { await updatePrompt(id, updates); }}
        onDeletePrompt={async (id) => { await deletePrompt(id); }}
        onResetBuiltIn={async (id) => { await resetBuiltIn(id); }}
      />

      {/* Projects Panel */}
      <ProjectsPanel
        isOpen={showProjectsPanel}
        onClose={() => setShowProjectsPanel(false)}
        projects={projects}
        currentProject={currentProject}
        onLoadProject={async (id) => {
          const project = await loadProject(id);
          if (project) {
            let contentToLoad = project.content || '';

            // If draft content is empty, try to load the latest commit
            if (!contentToLoad.trim()) {
              // Try Electron first
              if (window.electron?.loadProjectCommits && project.path) {
                try {
                  const commits = await window.electron.loadProjectCommits(project.path);
                  if (commits && commits.length > 0) {
                    contentToLoad = commits[commits.length - 1].content;
                  }
                } catch (e) {
                  console.warn('Failed to load commits for initial content:', e);
                }
              } else {
                // Try browser file system
                const handle = getRepoHandle();
                if (handle && project.name) {
                  try {
                    const { loadProjectCommits } = await import('./services/browserFileSystem');
                    const commits = await loadProjectCommits(handle, project.name);
                    if (commits && commits.length > 0) {
                      contentToLoad = commits[commits.length - 1].content;
                    }
                  } catch (e) {
                    console.warn('Failed to load commits from browser FS:', e);
                  }
                }
              }
            }

            // Load project content into the editor - always reset all panels
            setOriginalText(contentToLoad);
            setPreviewText(contentToLoad);
            setModifiedText('');
            resetDiffState();
          }
          return project;
        }}
        onCreateProject={async (name, content) => {
          return createNewProject(name, content || previewText || originalText);
        }}
        onDeleteProject={deleteProjectById}
        onRenameProject={renameProjectById}
        onOpenRepository={openRepository}
        repositoryPath={repositoryPath}
        currentContent={previewText || originalText}
      />
    </div>
  );
}

export default App;
