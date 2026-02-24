import React, { useEffect } from 'react';
import clsx from 'clsx';
import { MenuBar } from './components/MenuBar';
import { AppHeader } from './components/AppHeader';
import { EditorPanel } from './components/EditorPanel';
import { AIPromptPanel } from './components/AIPromptPanel';
import { DiffPanel } from './components/DiffPanel';
import { AppModals } from './components/AppModals';
import { useUI, useProject, useAI } from './contexts';
import { useElectronMenu } from './hooks/useElectronMenu';

export default function App() {
  // --- Contexts ---
  const {
    backgroundHue, isDarkMode,
    topPanelHeight, leftPanelWidth,
    startResizing, startResizingVertical,
    setIsShiftHeld, isPromptPanelVisible
  } = useUI();

  const {
    handleCommitClick, handleAccept, hasUnpersistedChanges
  } = useProject();

  const {
    handleQuickSend, hasStagedPromptChanges
  } = useAI();

  // --- Hooks ---
  useElectronMenu();

  useEffect(() => {
    if (!window.electron?.setWindowDirtyState) return;
    void window.electron.setWindowDirtyState(hasUnpersistedChanges || hasStagedPromptChanges);
  }, [hasUnpersistedChanges, hasStagedPromptChanges]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) setIsShiftHeld(true);

      // Shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCommitClick();
        } else if (e.key === '\\') {
          e.preventDefault();
          handleAccept();
        } else if (e.key === 'g') {
          e.preventDefault();
          handleQuickSend('grammar');
        } else if (e.key === 'p') {
          e.preventDefault();
          handleQuickSend('polish');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) setIsShiftHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleCommitClick, handleAccept, handleQuickSend, setIsShiftHeld]);

  // --- Render ---
  return (
    <div
      className={clsx(
        "flex flex-col h-screen w-screen overflow-hidden selection:bg-indigo-100 dark:selection:bg-indigo-900/40",
        isDarkMode && "dark"
      )}
      style={{
        '--app-hue': backgroundHue,
        // Dynamic color variables based on mode and hue
        // Light mode: outer areas neutral, panels colored
        // Dark mode: all areas subtly colored
        '--bg-app': isDarkMode
          ? `hsl(${backgroundHue}, 20%, 8%)`
          : `hsl(0, 0%, 96%)`, // Neutral gray for outer margins
        '--bg-header': isDarkMode
          ? `hsl(${backgroundHue}, 15%, 10%)`
          : `hsl(0, 0%, 98%)`, // Neutral gray for headers in light mode
        '--bg-panel': isDarkMode
          ? `hsl(${backgroundHue}, 15%, 12%)`
          : `hsl(${backgroundHue}, 40%, 84%)`, // Subtle hue for panel containers
        '--bg-muted': isDarkMode
          ? `hsl(${backgroundHue}, 10%, 15%)`
          : `hsl(${backgroundHue}, 30%, 86%)`, // Content area background follows hue
        '--bg-surface': isDarkMode
          ? `hsl(${backgroundHue}, 12%, 18%)`
          : `hsl(${backgroundHue}, 35%, 89%)`, // Inner surface very subtle hue
        '--border-color': isDarkMode
          ? `hsl(${backgroundHue}, 10%, 25%)`
          : `hsl(${backgroundHue}, 25%, 78%)`, // Borders slightly more saturated
        backgroundColor: 'var(--bg-app)',
      } as React.CSSProperties}
    >
      <MenuBar />

      <AppHeader />

      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Section (Editor + AI Prompt) */}
        <div
          className="flex flex-col overflow-hidden h-full relative"
          style={{ width: `${leftPanelWidth}%` }}
        >
          <div
            className="flex-none overflow-hidden"
            style={{ height: `${isPromptPanelVisible ? topPanelHeight : 100}%` }}
          >
            <EditorPanel />
          </div>

          {/* Horizontal Resizer (between Editor and AI Prompt) */}
          {isPromptPanelVisible && (
            <>
              <div
                className="h-1.5 w-full cursor-row-resize hover:bg-indigo-500/20 active:bg-indigo-500/40 transition-colors z-30 flex-none"
                onMouseDown={startResizingVertical}
              />

              <div className="flex-1 min-h-0 overflow-hidden">
                <AIPromptPanel />
              </div>
            </>
          )}
        </div>

        {/* Vertical Resizer (between Left Section and Diff View) */}
        <div
          className="w-1.5 h-full cursor-col-resize hover:bg-indigo-500/20 active:bg-indigo-500/40 transition-colors z-30 flex-none"
          onMouseDown={startResizing}
        />

        {/* Right Section (Diff View) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0" style={{ backgroundColor: 'var(--bg-panel)' }}>
          <DiffPanel />
        </div>
      </main>

      <AppModals />
    </div>
  );
}
