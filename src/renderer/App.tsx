import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Diff from 'diff';
import { DiffSegment, ViewMode, FontFamily, PolishMode, TextCommit, AIPrompt, AILogEntry, Project } from './types';
import { polishMergedText, polishMultipleRanges, polishWithPrompt, polishMultipleRangesWithPrompt } from './services/ai';
import { runFactCheck, getFactCheckModels } from './services/factChecker';
import { initSpellChecker, checkSpelling } from './services/spellChecker';
import { MODELS, Model, getCostTier } from './constants/models';
import { useCommitHistory } from './hooks/useCommitHistory';
import { useDiffState } from './hooks/useDiffState';
import { useScrollSync } from './hooks/useScrollSync';
import { useElectronMenu } from './hooks/useElectronMenu';
import { usePrompts } from './hooks/usePrompts';
import { useProjects } from './hooks/useProjects';
import { useAsyncAI, PendingOperation } from './hooks/useAsyncAI';
import { MultiSelectTextAreaRef } from './components/MultiSelectTextArea';
import { MenuBar } from './components/MenuBar';
import { AppHeader } from './components/AppHeader';
import { EditorPanel } from './components/EditorPanel';
import { AIPromptPanel } from './components/AIPromptPanel';
import { DiffPanel } from './components/DiffPanel';
import { AppModals } from './components/AppModals';
import { FontSize, fontClasses, sizeClasses } from './constants/ui';
import clsx from 'clsx';

// Redundant FontSize type removed, now in constants/ui.ts

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

  // Ref to avoid stale closure in useAsyncAI callback
  const originalTextRef = useRef(originalText);
  useEffect(() => {
    originalTextRef.current = originalText;
  }, [originalText]);

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
  // Flag to skip segments->previewText sync after Compare click
  const skipNextSegmentsSync = useRef(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [factCheckProgress, setFactCheckProgress] = useState<string>('');
  const [isPolishMenuOpen, setIsPolishMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Auto-compare toggle (for real-time diff updates while editing)
  const [isAutoCompareEnabled, setIsAutoCompareEnabled] = useState(false);

  // Model & Cost Management
  const [selectedModel, setSelectedModel] = useState<Model>(MODELS[0]);
  const [sessionCost, setSessionCost] = useState<number>(0);

  // Background color customization (hue 0-360)
  const [backgroundHue, setBackgroundHue] = useState<number>(220); // Default blue-ish

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
    createRepository,
    repositoryPath,
    getRepoHandle
  } = useProjects();
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);

  // Sync project content to editor when currentProject changes
  useEffect(() => {
    if (currentProject) {
      // Prevent segments effect from overwriting the project content
      skipNextSegmentsSync.current = true;

      // Load project content into editor
      const content = currentProject.content || '';
      setPreviewText(content);
      setOriginalText(content);
      setModifiedText('');
      resetDiffState();
    } else {
      // Clear editor state when project is closed or null
      setPreviewText('');
      setOriginalText('');
      setModifiedText('');
      resetDiffState();
    }
  }, [currentProject?.id]); // Only trigger when project ID changes, not on every content change

  // Repository handler - uses native picker (Electron) or showDirectoryPicker (browser)
  const handleOpenRepository = useCallback(async () => {
    await openRepository();
    setShowProjectsPanel(true);
  }, [openRepository]);

  const handleNewProject = useCallback(() => {
    setShowProjectsPanel(true);
    // ProjectsPanel will handle the create flow
  }, []);

  const handleCreateRepository = useCallback(async () => {
    await createRepository();
    setShowProjectsPanel(true);
  }, [createRepository]);

  // Error Handling
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rating & Logging
  const [activeLogId, setActiveLogId] = useState<string | null>(null);

  // Perform diff logic (moved up for access in useAsyncAI)
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

  // Async Parallel AI Operations
  // Note: Some callbacks defined after hook initialization will be used via closure
  const {
    pendingOperations,
    startOperation,
    cancelAllOperations: cancelAsyncOperations,
    isPositionLocked,
    hasPendingOperations,
  } = useAsyncAI({
    getText: () => previewText,
    setText: setPreviewText,
    getModel: () => selectedModel,
    getPrompt: getPrompt,
    onCostUpdate: (usage) => {
      const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
        (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);
      setSessionCost(prev => prev + cost);
    },
    onLog: (taskName, usage, durationMs) => {
      // Inline logging since logAIUsage is defined later
      const cost = (usage.inputTokens / 1_000_000 * selectedModel.inputPrice) +
        (usage.outputTokens / 1_000_000 * selectedModel.outputPrice);

      const logEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        taskType: taskName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost,
        durationMs
      };

      if (window.electron && window.electron.logUsage) {
        window.electron.logUsage(logEntry);
      } else {
        try {
          const stored = localStorage.getItem('diff-commit-logs');
          const logs: any[] = stored ? JSON.parse(stored) : [];
          logs.push(logEntry);
          if (logs.length > 1000) logs.shift();
          localStorage.setItem('diff-commit-logs', JSON.stringify(logs));
        } catch (e) {
          console.warn('Failed to save log to localStorage:', e);
        }
      }
      setActiveLogId(logEntry.id);
    },
    onError: setErrorMessage,
    onDiffUpdate: (prev, modified) => {
      // Establish baseline on first edit (if originalText is empty)
      // Otherwise keep the existing baseline for cumulative diffs
      // Use ref to avoid stale closure - originalText from closure would be the initial empty value
      const currentOriginalText = originalTextRef.current;
      const baseline = currentOriginalText.trim() ? currentOriginalText : prev;

      if (!currentOriginalText.trim()) {
        setOriginalText(prev); // Set baseline for first edit
      }
      setModifiedText(modified);
      performDiff(baseline, modified);
      setMode(ViewMode.DIFF);
    },
  });

  // Quick-send handler for Ctrl+Enter shortcut
  const handleQuickSend = useCallback((promptId: string = 'grammar') => {
    const textarea = previewTextareaRef.current?.getTextarea();
    if (!textarea) return;

    const { start, end } = expandToWordBoundaries(
      textarea.selectionStart,
      textarea.selectionEnd,
      previewText
    );

    // Only start operation if there's a selection
    if (start !== end) {
      startOperation(start, end, promptId);
    }
  }, [previewText, startOperation]);

  // Keyboard shortcut for quick send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        handleQuickSend('grammar');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleQuickSend]);

  // AI Request Cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Commit History (extracted to custom hook)
  const getCommitText = useCallback(() => {
    return mode === ViewMode.DIFF ? previewText : originalText;
  }, [mode, previewText, originalText]);

  const onAfterCommit = useCallback(async (committedText: string) => {
    // After commit: both panes should have matching content
    setOriginalText(committedText);
    setPreviewText(committedText);
    setModifiedText('');
    resetDiffState();

    // CRITICAL: Save content to disk so it persists when switching projects
    if (currentProject) {
      await saveCurrentProject(committedText);
    }
  }, [resetDiffState, currentProject, saveCurrentProject]);

  // Memoize browser FS callbacks for folder-based projects
  // Project name = folder name (used for commit storage)
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
    currentProjectName: currentProject?.name, // Folder name for unique identification
    browserLoadCommits,
    browserSaveCommits,
  });

  // Context Menu for text selection
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selection: string } | null>(null);

  // Save as Prompt dialog state
  const [savePromptDialogOpen, setSavePromptDialogOpen] = useState(false);
  const [pendingPromptText, setPendingPromptText] = useState('');

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
    // Restore to both panels with identical content
    setOriginalText(commit.content);
    setPreviewText(commit.content);
    setModifiedText('');
    resetDiffState();
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
  const [topPanelHeight, setTopPanelHeight] = useState<number>(60); // Percentage
  const [isDarkMode, setIsDarkMode] = useState(true);
  const isResizingLeftRight = useRef(false);
  const isResizingTopBottom = useRef(false);

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
  // Also skip if we just ran Compare (to preserve user's edits in the editor)
  useEffect(() => {
    if (segments.length === 0) return; // Don't clear previewText when segments are empty

    // Skip sync if flagged (e.g., after Compare button click)
    if (skipNextSegmentsSync.current) {
      skipNextSegmentsSync.current = false;
      return;
    }

    const computedText = segments
      .filter(s => s.isIncluded)
      .map(s => s.value)
      .join('');

    setPreviewText(computedText);
  }, [segments]);

  // Auto-compare effect: debounced real-time diff updates when enabled
  useEffect(() => {
    if (!isAutoCompareEnabled) return;
    // Don't auto-compare if no baseline or texts are identical
    if (!originalText.trim() || originalText === previewText) return;

    const timer = setTimeout(() => {
      skipNextSegmentsSync.current = true;
      setModifiedText(previewText);
      performDiff(originalText, previewText);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [previewText, isAutoCompareEnabled, originalText]);

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
      // Load content into both panels
      setOriginalText(content);
      setPreviewText(content);
      setModifiedText('');
      resetDiffState();
    },
    getSaveText: () => mode === ViewMode.DIFF ? previewText : originalText,
    onClearAll: () => {
      setOriginalText('');
      setModifiedText('');
      setPreviewText('');
      resetDiffState();
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
    onCreateRepository: async () => { await createRepository(); setShowProjectsPanel(true); },
    onOpenRepository: () => { openRepository(); setShowProjectsPanel(true); },
    onSaveProject: async () => {
      if (currentProject?.path && window.electron?.saveProjectBundle) {
        await window.electron.saveProjectBundle(currentProject.path);
      }
    },
  });

  // Resizing Logic (Horizontal - Left/Right)
  const startResizing = useCallback(() => {
    isResizingLeftRight.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingLeftRight.current = false;
    isResizingTopBottom.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleResize = useCallback((e: MouseEvent) => {
    if (isResizingLeftRight.current) {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) {
        setLeftPanelWidth(newWidth);
      }
    } else if (isResizingTopBottom.current) {
      const headerHeight = 64; // h-16 = 64px
      const availableHeight = window.innerHeight - headerHeight;
      const newHeight = ((e.clientY - headerHeight) / availableHeight) * 100;
      if (newHeight > 20 && newHeight < 80) {
        setTopPanelHeight(newHeight);
      }
    }
  }, []);

  // Resizing Logic (Vertical - Top/Bottom)
  const startResizingVertical = useCallback(() => {
    isResizingTopBottom.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleResize, stopResizing]);



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
  const getSourceTextForAI = (): { sourceText: string; fromRightTab: boolean } => {
    // Use previewText if available (the editor content)
    if (previewText.trim()) {
      return { sourceText: previewText, fromRightTab: true };
    }

    // Fallback to originalText or modifiedText
    const hasLeft = originalText.trim().length > 0;
    const hasRight = modifiedText.trim().length > 0;

    if (hasRight && !hasLeft) {
      return { sourceText: modifiedText, fromRightTab: true };
    } else if (hasLeft) {
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

    // Set baseline and run diff
    setOriginalText(sourceText);
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

    // Get native textarea selection first to check if we should only spellcheck a range
    const textarea = previewTextareaRef.current?.getTextarea();
    let selStart = 0;
    let selEnd = 0;
    let selectedText = '';
    let isSelectionMode = false;

    if (textarea) {
      const rawStart = textarea.selectionStart;
      const rawEnd = textarea.selectionEnd;
      if (rawStart !== rawEnd) {
        // Auto-expand to word boundaries
        const expanded = expandToWordBoundaries(rawStart, rawEnd, previewText);
        selStart = expanded.start;
        selEnd = expanded.end;
        selectedText = previewText.substring(selStart, selEnd);
        isSelectionMode = true;
      }
    }

    try {
      await initSpellChecker(); // Ensure loaded

      if (isSelectionMode && selectedText.trim()) {
        const result = checkSpelling(selectedText);

        if (result.isError) {
          setErrorMessage(result.errorMessage || 'Spell check failed');
          return;
        }

        // Apply result back to selection
        const newText = previewText.slice(0, selStart) + result.text + previewText.slice(selEnd);

        // setOriginalText(previewText); // Don't reset baseline - allow cumulative diffs
        setPreviewText(newText);
        setModifiedText(newText);

        performDiff(originalText, newText); // Diff against original baseline
        setMode(ViewMode.DIFF);

      } else {
        // No selection - check entire text (old logic)
        const { sourceText, fromRightTab } = getSourceTextForAI();
        if (!sourceText.trim()) {
          setErrorMessage('Please enter some text first.');
          return;
        }

        const result = checkSpelling(sourceText);
        if (result.isError) {
          setErrorMessage(result.errorMessage || 'Spell check failed');
          return;
        }

        setOriginalText(sourceText);
        setModifiedText(result.text);
        // Note: For full text, we might want to update previewText too if we are in INPUT mode?
        // But handleCompare usually sets just orig/mod. 
        // Let's stick to standard flow:
        performDiff(sourceText, result.text);
        setMode(ViewMode.DIFF);
      }

    } catch (e) {
      console.error(e);
      setErrorMessage('Failed to run spell check');
    }
  };

  // Smart AI Edit handler - routes to selection-based or full-text editing
  // Now delegates to useAsyncAI for unified handling and visual feedback (pulsing overlay)
  const handleAIEdit = async (promptId: string) => {
    // Special case: use local spell checker for spelling
    if (promptId === 'spelling_local') {
      return handleLocalSpellCheck();
    }

    setIsPolishMenuOpen(false);

    // Check for native textarea selection
    const textarea = previewTextareaRef.current?.getTextarea();
    let start = 0;
    let end = 0;
    let hasSelection = false;

    if (textarea) {
      const { selectionStart, selectionEnd } = textarea;
      if (selectionStart !== selectionEnd) {
        // Auto-expand to word boundaries for careless selections
        const expanded = expandToWordBoundaries(selectionStart, selectionEnd, previewText);
        start = expanded.start;
        end = expanded.end;
        hasSelection = true;
      }
    }

    // Trigger async operation (this handles overlay, progress, error, and diff updates automatically)
    // If no selection, we polish the entire text
    if (hasSelection) {
      startOperation(start, end, promptId);
    } else {
      if (!previewText.trim()) {
        setErrorMessage('Please enter some text first.');
        return;
      }
      startOperation(0, previewText.length, promptId);
    }
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

  // Save selected text as a new custom prompt
  const handleSaveAsPrompt = () => {
    if (contextMenu?.selection) {
      setPendingPromptText(contextMenu.selection);
      setSavePromptDialogOpen(true);
      setContextMenu(null);
    }
  };

  // Handle saving the prompt from the dialog
  const handleSavePromptSubmit = async (prompt: AIPrompt) => {
    try {
      await createPrompt({
        name: prompt.name,
        systemInstruction: prompt.systemInstruction,
        promptTask: prompt.promptTask,
        color: prompt.color,
      });
      // Success: close dialog and clear state
      setSavePromptDialogOpen(false);
      setPendingPromptText('');
      // Open prompts modal to show the new prompt
      setShowPromptsModal(true);
    } catch (error) {
      // Log error and re-throw so the dialog can display it
      console.error('Failed to save prompt:', error);
      throw error; // Dialog will catch this and show error message
    }
  };

  // fontClasses and sizeClasses now imported from constants/ui.ts



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
    <div
      className={clsx("flex flex-col h-full transition-colors duration-200")}
      style={{
        // CSS custom properties for dynamic theming based on hue slider
        // Dark mode: 10% darker, Light mode: 20% darker for richer colors
        '--bg-app': `hsl(${backgroundHue}, 30%, ${isDarkMode ? '5%' : '77%'})`,
        '--bg-panel': `hsl(${backgroundHue}, 25%, ${isDarkMode ? '8%' : '80%'})`,
        '--bg-header': `hsl(${backgroundHue}, 20%, ${isDarkMode ? '6%' : '82%'})`,
        '--bg-surface': `hsl(${backgroundHue}, 15%, ${isDarkMode ? '10%' : '78%'})`,
        '--bg-muted': `hsl(${backgroundHue}, 10%, ${isDarkMode ? '12%' : '75%'})`,
        '--border-color': `hsl(${backgroundHue}, 15%, ${isDarkMode ? '18%' : '68%'})`,
        backgroundColor: 'var(--bg-app)',
      } as React.CSSProperties}
    >
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
        onFontSize={setFontSize}
        onFontFamily={setFontFamily}
        onShowHelp={() => setShowHelp(true)}
        onShowLogs={() => setShowLogs(true)}
        onShowCommitHistory={() => setShowCommitHistory(true)}
        onPolish={(mode) => handleAIEdit(mode)}
        onFactCheck={handleFactCheck}
        onManagePrompts={() => setShowPromptsModal(true)}
        onManageProjects={() => setShowProjectsPanel(true)}
        onOpenRepository={handleOpenRepository}
        onCreateRepository={handleCreateRepository}
        onNewProject={() => {
          setOriginalText('');
          setPreviewText('');
          setModifiedText('');
          resetDiffState();
        }}
      />

      <AppHeader
        repositoryPath={repositoryPath}
        currentProject={currentProject}
        onOpenRepository={handleOpenRepository}
        setShowProjectsPanel={setShowProjectsPanel}
        backgroundHue={backgroundHue}
        setBackgroundHue={setBackgroundHue}
        sessionCost={sessionCost}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        fontSize={fontSize}
        setFontSize={setFontSize}
        setShowLogs={setShowLogs}
        setShowCommitHistory={setShowCommitHistory}
        setShowHelp={setShowHelp}
        commitCount={commits.length}
        mode={mode}
        isScrollSyncEnabled={isScrollSyncEnabled}
        setIsScrollSyncEnabled={setIsScrollSyncEnabled}
        onClearAll={() => {
          setOriginalText('');
          setModifiedText('');
          setPreviewText('');
          resetDiffState();
        }}
        onCopyFinal={copyFinal}
      />



      {/* DIFF MODE - Now the only mode */}
      {
        mode === ViewMode.DIFF && (
          <div className="w-full h-full flex flex-row">
            {/* Preview/Editor Panel - NOW LEFT */}
            <div
              className="flex flex-col h-full relative z-0 transition-colors duration-200 overflow-hidden"
              style={{ width: `${leftPanelWidth}%`, backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)' }}
            >
              <EditorPanel
                topPanelHeight={topPanelHeight}
                isSpeaking={isSpeaking}
                setIsSpeaking={setIsSpeaking}
                handleReadAloud={handleReadAloud}
                isPolishMenuOpen={isPolishMenuOpen}
                setIsPolishMenuOpen={setIsPolishMenuOpen}
                isPolishing={isPolishing}
                isFactChecking={isFactChecking}
                cancelAIOperation={cancelAIOperation}
                factCheckProgress={factCheckProgress}
                builtInPrompts={builtInPrompts}
                handleAIEdit={handleAIEdit}
                customPrompts={customPrompts}
                handleFactCheck={handleFactCheck}
                setShowPromptsModal={setShowPromptsModal}
                previewText={previewText}
                setPreviewText={setPreviewText}
                originalText={originalText}
                setModifiedText={setModifiedText}
                performDiff={performDiff}
                isAutoCompareEnabled={isAutoCompareEnabled}
                setIsAutoCompareEnabled={setIsAutoCompareEnabled}
                handleCommitClick={handleCommitClick}
                isShiftHeld={isShiftHeld}
                hasUnsavedChanges={hasUnsavedChanges}
                commits={commits}
                previewTextareaRef={previewTextareaRef}
                pendingOperations={pendingOperations}
                fontFamily={fontFamily}
                fontSize={fontSize}
                handleQuickSend={handleQuickSend}
                handleOpenContextMenu={handleOpenContextMenu}
                handleScrollSync={handleScrollSync}
                skipNextSegmentsSync={skipNextSegmentsSync}
              />

              {/* Horizontal Resizer Handle */}
              <div
                className="group h-1.5 bg-gray-200 dark:bg-slate-800 hover:bg-indigo-400 dark:hover:bg-indigo-500 cursor-row-resize transition-colors active:bg-indigo-600 dark:active:bg-indigo-500 flex items-center justify-center z-20"
                onMouseDown={startResizingVertical}
              >
                <div className="w-12 h-1 group-hover:h-1.5 transition-all rounded-full bg-gray-300 dark:bg-slate-600"></div>
              </div>

              <AIPromptPanel topPanelHeight={topPanelHeight} />
            </div>

            {/* Resizer Handle */}
            <div
              className="w-1 bg-gray-200 dark:bg-slate-800 hover:bg-indigo-400 dark:hover:bg-indigo-500 cursor-col-resize transition-colors active:bg-indigo-600 dark:active:bg-indigo-500 flex items-center justify-center z-20"
              onMouseDown={startResizing}
            >
              <div className="h-8 w-1 hover:w-2 transition-all rounded-full bg-gray-300 dark:bg-slate-600"></div>
            </div>

            <DiffPanel
              leftPanelWidth={leftPanelWidth}
              handleAcceptAll={handleAcceptAll}
              handleRejectAll={handleRejectAll}
              leftPaneRef={leftPaneRef}
              handleScrollSync={handleScrollSync}
              fontFamily={fontFamily}
              fontSize={fontSize}
              segments={segments}
              toggleSegment={toggleSegment}
              originalText={originalText}
            />

          </div>
        )
      }

      <AppModals
        activeLogId={activeLogId}
        handleRate={handleRate}
        setActiveLogId={setActiveLogId}
        errorMessage={errorMessage}
        setErrorMessage={setErrorMessage}
        showCommitHistory={showCommitHistory}
        setShowCommitHistory={setShowCommitHistory}
        commits={commits}
        handleRestoreCommit={handleRestoreCommit}
        handleCompareCommit={handleCompareCommit}
        handleDeleteCommit={handleDeleteCommit}
        handleClearAllCommits={handleClearAllCommits}
        originalText={originalText}
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        handleReadAloud={handleReadAloud}
        handlePolishSelection={handlePolishSelection}
        handleFactCheck={handleFactCheck}
        handleSaveAsPrompt={handleSaveAsPrompt}
        savePromptDialogOpen={savePromptDialogOpen}
        setSavePromptDialogOpen={setSavePromptDialogOpen}
        pendingPromptText={pendingPromptText}
        setPendingPromptText={setPendingPromptText}
        handleSavePromptSubmit={handleSavePromptSubmit}
        showPromptsModal={showPromptsModal}
        setShowPromptsModal={setShowPromptsModal}
        aiPrompts={aiPrompts}
        createPrompt={createPrompt}
        updatePrompt={updatePrompt}
        deletePrompt={deletePrompt}
        resetBuiltIn={resetBuiltIn}
        showProjectsPanel={showProjectsPanel}
        setShowProjectsPanel={setShowProjectsPanel}
        projects={projects}
        currentProject={currentProject}
        loadProject={loadProject}
        setOriginalText={setOriginalText}
        setPreviewText={setPreviewText}
        setModifiedText={setModifiedText}
        resetDiffState={resetDiffState}
        createNewProject={createNewProject}
        deleteProjectById={deleteProjectById}
        renameProjectById={renameProjectById}
        openRepository={openRepository}
        createRepository={createRepository}
        repositoryPath={repositoryPath}
        getRepoHandle={getRepoHandle}
        showHelp={showHelp}
        setShowHelp={setShowHelp}
        showLogs={showLogs}
        setShowLogs={setShowLogs}
        handleCreateRepository={handleCreateRepository}
        handleOpenRepository={handleOpenRepository}
      />

    </div >
  );
}

export default App;
