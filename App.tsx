
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Diff from 'diff';
import { DiffSegment, ViewMode, FontFamily, PolishMode } from './types';
import { Button } from './components/Button';
import { DiffSegment as DiffSegmentComponent } from './components/DiffSegment';
import { HelpModal } from './components/HelpModal';
import { generateDiffSummary, polishMergedText } from './services/gemini';
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
  Check
} from 'lucide-react';
import clsx from 'clsx';

type FontSize = 'sm' | 'base' | 'lg' | 'xl';

function App() {
  const [mode, setMode] = useState<ViewMode>(ViewMode.INPUT);
  const [originalText, setOriginalText] = useState<string>("The sky above the port was the color of television, tuned to a dead channel.\n\nIt was a bright cold day in April, and the clocks were striking thirteen.");
  const [modifiedText, setModifiedText] = useState<string>("The sky above the port was the color of a tablet, tuned to a streaming service.\n\nIt was a bright warm day in May, and the clocks were striking one.");
  
  // History Management
  const [segments, setSegments] = useState<DiffSegment[]>([]);
  const [history, setHistory] = useState<DiffSegment[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [previewText, setPreviewText] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isPolishMenuOpen, setIsPolishMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Text to Speech
  const [isSpeaking, setIsSpeaking] = useState(false);
  const previewTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Appearance & Layout
  const [fontFamily, setFontFamily] = useState<FontFamily>('sans');
  const [fontSize, setFontSize] = useState<FontSize>('base');
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(50); // Percentage
  const isResizing = useRef(false);
  
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

  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    const result = await generateDiffSummary(originalText, modifiedText);
    setSummary(result);
    setIsSummarizing(false);
  };
  
  const handlePolish = async (mode: PolishMode) => {
      setIsPolishMenuOpen(false);
      setIsPolishing(true);
      const polished = await polishMergedText(previewText, mode);
      
      // Update state to reflect the new comparison: Current Committed vs Polished
      setOriginalText(previewText);
      setModifiedText(polished);
      
      // Run the diff immediately
      performDiff(previewText, polished);
      
      setIsPolishing(false);
      
      let summaryText = "Comparison updated: Showing changes between your previous draft and the AI polished version.";
      if (mode === 'spelling') summaryText = "Comparison updated: Showing spelling corrections.";
      if (mode === 'grammar') summaryText = "Comparison updated: Showing grammar and spelling corrections.";
      if (mode === 'prompt') summaryText = "Comparison updated: Showing expanded detailed prompt instructions.";
      
      setSummary(summaryText);
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
    <div className="flex flex-col h-full bg-white">
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      
      {/* Header */}
      <header className="flex-none h-16 border-b border-gray-200 px-6 flex items-center justify-between bg-white z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <ArrowRightLeft className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Diff & Commit AI</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            {/* Font Family */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
              <button 
                  onClick={() => setFontFamily('sans')}
                  className={clsx("p-1.5 rounded text-xs font-semibold transition-all w-10", fontFamily === 'sans' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Sans Serif"
              >
                Sans
              </button>
              <button 
                  onClick={() => setFontFamily('serif')}
                  className={clsx("p-1.5 rounded text-xs font-serif font-semibold transition-all w-10", fontFamily === 'serif' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Serif"
              >
                Serif
              </button>
              <button 
                  onClick={() => setFontFamily('mono')}
                  className={clsx("p-1.5 rounded text-xs font-mono font-semibold transition-all w-10", fontFamily === 'mono' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Monospace"
              >
                Mono
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
               <button 
                  onClick={() => setFontSize('sm')} 
                  className={clsx("w-8 p-1.5 rounded text-xs font-semibold transition-all", fontSize === 'sm' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Small Text"
                >
                  S
                </button>
                <button 
                  onClick={() => setFontSize('base')} 
                  className={clsx("w-8 p-1.5 rounded text-sm font-semibold transition-all", fontSize === 'base' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Medium Text"
                >
                  M
                </button>
                <button 
                  onClick={() => setFontSize('lg')} 
                  className={clsx("w-8 p-1.5 rounded text-base font-semibold transition-all", fontSize === 'lg' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Large Text"
                >
                  L
                </button>
                 <button 
                  onClick={() => setFontSize('xl')} 
                  className={clsx("w-8 p-1.5 rounded text-lg font-semibold transition-all", fontSize === 'xl' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                  title="Extra Large Text"
                >
                  XL
                </button>
            </div>
          </div>

          <button 
            onClick={() => setShowHelp(true)}
            className="text-gray-500 hover:text-indigo-600 transition-colors p-2"
            title="Help & Instructions"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          
          {mode === ViewMode.DIFF && (
            <>
               <div className="h-6 w-px bg-gray-200 mx-1"></div>
               <div className="flex items-center gap-1">
                 <button 
                    onClick={undo} 
                    disabled={historyIndex <= 0}
                    className="p-2 text-gray-600 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors"
                    title="Undo (Ctrl+Z)"
                 >
                   <Undo className="w-5 h-5" />
                 </button>
                 <button 
                    onClick={redo} 
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 text-gray-600 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors"
                    title="Redo (Ctrl+Shift+Z)"
                 >
                   <Redo className="w-5 h-5" />
                 </button>
               </div>

              <div className="h-6 w-px bg-gray-200 mx-1"></div>
              
              <Button variant="ghost" onClick={() => setMode(ViewMode.INPUT)} size="sm" icon={<RotateCcw className="w-4 h-4" />}>
                Reset
              </Button>
               
               <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleGenerateSummary} 
                isLoading={isSummarizing}
                icon={<Sparkles className="w-4 h-4 text-amber-500" />}
              >
                AI Summary
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex">
        
        {/* INPUT MODE */}
        {mode === ViewMode.INPUT && (
          <div className="w-full h-full flex flex-col md:flex-row p-6 gap-6 overflow-y-auto">
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Original Version</label>
              <textarea
                className={clsx(
                  "flex-1 p-4 rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none leading-relaxed shadow-sm",
                  fontClasses[fontFamily],
                  sizeClasses[fontSize]
                )}
                placeholder="Paste original text here..."
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
              />
            </div>
            
            <div className="flex-none flex items-center justify-center py-4 md:py-0">
               <button 
                 onClick={() => setModifiedText(originalText)}
                 className="p-2 bg-gray-100 hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 rounded-full md:rotate-0 rotate-90 transition-all shadow-sm active:scale-95 active:shadow-inner group"
                 title="Copy Original to Revised"
               >
                 <ChevronRight className="w-6 h-6 group-hover:scale-110 transition-transform" />
               </button>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Revised Version</label>
              <textarea
                 className={clsx(
                  "flex-1 p-4 rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none leading-relaxed shadow-sm",
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
                className="flex flex-col border-r border-gray-200 h-full overflow-hidden bg-gray-50/50"
                style={{ width: `${leftPanelWidth}%` }}
            >
              <div className="flex-none p-4 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex justify-between items-center">
                 <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                   <FileText className="w-4 h-4" /> 
                   Interactive Diff
                 </h2>
                 <div className="flex gap-2 text-xs">
                   <button onClick={handleAcceptAll} className="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200 transition">Accept All</button>
                   <button onClick={handleRejectAll} className="px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 border border-red-200 transition">Reject All</button>
                 </div>
              </div>
              
              <div 
                className={clsx(
                    "flex-1 overflow-y-auto p-8 text-gray-800 bg-white m-4 rounded-xl shadow-sm border border-gray-100",
                    fontClasses[fontFamily],
                    sizeClasses[fontSize]
                )}
              >
                {segments.map((seg) => (
                  <DiffSegmentComponent key={seg.id} segment={seg} onClick={toggleSegment} />
                ))}
              </div>
              
              <div className="p-3 text-xs text-gray-500 text-center bg-gray-50 border-t border-gray-200 flex justify-center gap-4">
                 <div className="flex items-center gap-1.5">
                   <span className="w-2.5 h-2.5 bg-green-100 border border-green-500 rounded-sm"></span>
                   <span>Added</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <span className="w-2.5 h-2.5 bg-red-100 border border-red-500 rounded-sm"></span>
                   <span>Removed</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <span className="w-2.5 h-2.5 bg-blue-50 border border-blue-400 border-dashed rounded-sm"></span>
                   <span>Restored</span>
                 </div>
              </div>
            </div>

            {/* Resizer Handle */}
            <div
                className="w-1 bg-gray-200 hover:bg-indigo-400 cursor-col-resize transition-colors active:bg-indigo-600 flex items-center justify-center z-20"
                onMouseDown={startResizing}
            >
                <div className="h-8 w-1 hover:w-2 transition-all rounded-full bg-gray-300"></div>
            </div>

            {/* Preview/Output Panel (Resizable) */}
            <div 
                className="flex flex-col h-full bg-white relative z-0"
                style={{ width: `${100 - leftPanelWidth}%` }}
            >
               <div className="flex-none p-4 border-b border-gray-200 flex justify-between items-center bg-white relative">
                 <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Committed Preview
                 </h2>
                 <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleReadAloud} 
                      className={clsx("text-indigo-600 hover:bg-indigo-50", isSpeaking && "bg-indigo-100")}
                      title={isSpeaking ? "Stop Speaking" : "Read Aloud (Select text to read section)"}
                      icon={isSpeaking ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-4 h-4" />}
                    >
                      {isSpeaking ? "Stop" : "Read"}
                    </Button>
                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                    
                    <div className="relative">
                        {isPolishMenuOpen && (
                            <div className="fixed inset-0 z-10" onClick={() => setIsPolishMenuOpen(false)}></div>
                        )}
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setIsPolishMenuOpen(!isPolishMenuOpen)} 
                            isLoading={isPolishing} 
                            icon={<Wand2 className="w-3 h-3" />}
                            className={clsx(isPolishMenuOpen && "bg-gray-50 ring-2 ring-indigo-100")}
                        >
                            AI Edit...
                        </Button>
                        
                        {isPolishMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 border-b border-gray-50">Correction Level</div>
                                <button onClick={() => handlePolish('spelling')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                    Spelling Only
                                </button>
                                <button onClick={() => handlePolish('grammar')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                    Grammar Fix
                                </button>
                                <button onClick={() => handlePolish('polish')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition-colors flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                    Full Polish
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button onClick={() => handlePolish('prompt')} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    Prompt Expansion
                                </button>
                            </div>
                        )}
                    </div>

                    <Button variant="primary" size="sm" onClick={copyFinal} icon={<Copy className="w-3 h-3" />}>
                        Copy
                    </Button>
                 </div>
              </div>

              <div className="flex-1 flex flex-col bg-gray-50/30">
                <textarea 
                   ref={previewTextareaRef}
                   className={clsx(
                     "flex-1 w-full h-full p-8 resize-none bg-transparent border-none focus:ring-0 text-gray-800 focus:bg-white transition-colors outline-none",
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
                <div className="absolute bottom-0 left-0 right-0 bg-indigo-50 border-t border-indigo-100 p-6 shadow-lg transform transition-transform duration-300 max-h-[50%] overflow-y-auto z-10">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-indigo-900 font-semibold flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> AI Summary
                        </h3>
                        <button onClick={() => setSummary('')} className="text-indigo-400 hover:text-indigo-700">&times;</button>
                    </div>
                    <div className="prose prose-sm prose-indigo text-indigo-800">
                        <p className="whitespace-pre-wrap">{summary}</p>
                    </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
