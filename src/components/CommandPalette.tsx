import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  BookOpen,
  CheckCircle2,
  Timer,
  Moon,
  Sparkles,
  Settings,
  HelpCircle,
  ArrowRight,
  Sun,
  Flame,
  LayoutGrid,
  FileText,
  Clock,
  Briefcase,
  Shield,
  X,
} from 'lucide-react';
import { Sprout } from '../Doodles';

export interface CommandAction {
  id: string;
  title: string;
  subtitle: string;
  category: 'Quick Actions' | 'Navigation' | 'Focus & Rhythm' | 'System';
  shortcut?: string[];
  icon: typeof Search;
  onExecute: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onGoPage: (page: 'today' | 'rhythm' | 'focus' | 'notebook' | 'reflect' | 'you') => void;
  onNewNote: () => void;
  onNewTask: () => void;
  onToggleTimer: () => void;
  onStartTimer: () => void;
  timerActive: boolean;
  timerPaused: boolean;
  onOpenReflection: () => void;
  onOpenActivity: () => void;
  onOpenSettings: () => void;
  onOpenShortcutsGuide: () => void;
  onOpenAuth?: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onGoPage,
  onNewNote,
  onNewTask,
  onToggleTimer,
  onStartTimer,
  timerActive,
  timerPaused,
  onOpenReflection,
  onOpenActivity,
  onOpenSettings,
  onOpenShortcutsGuide,
  onOpenAuth,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modSymbol = isMac ? '⌘' : 'Ctrl';

  const actions: CommandAction[] = useMemo(() => [
    {
      id: 'new-note',
      title: 'Create new note',
      subtitle: 'Open the notebook editor with a clean ruled page',
      category: 'Quick Actions',
      shortcut: [modSymbol, 'N'],
      icon: BookOpen,
      keywords: ['note', 'page', 'write', 'journal', 'jot', 'idea'],
      onExecute: () => {
        onNewNote();
        onClose();
      },
    },
    {
      id: 'new-task',
      title: 'Capture a task',
      subtitle: 'Add an intention or next action to today’s list',
      category: 'Quick Actions',
      shortcut: [modSymbol, 'T'],
      icon: CheckCircle2,
      keywords: ['task', 'todo', 'item', 'add', 'action', 'check'],
      onExecute: () => {
        onNewTask();
        onClose();
      },
    },
    {
      id: 'toggle-timer',
      title: timerActive ? (timerPaused ? 'Resume focus session' : 'Pause focus session') : 'Start focus timer',
      subtitle: timerActive ? (timerPaused ? 'Pick up right where you paused' : 'Take a breath and pause the clock') : 'Set your duration and begin intentional work',
      category: 'Focus & Rhythm',
      shortcut: ['Space', 'or', modSymbol, '⇧', 'F'],
      icon: Timer,
      keywords: ['timer', 'focus', 'start', 'pause', 'resume', 'pomodoro', 'clock'],
      onExecute: () => {
        if (timerActive) {
          onToggleTimer();
        } else {
          onStartTimer();
        }
        onClose();
      },
    },
    {
      id: 'evening-reflection',
      title: 'Evening reflection & check-in',
      subtitle: 'Note your mood, what went well, and what you’re grateful for',
      category: 'Quick Actions',
      shortcut: [modSymbol, '⇧', 'R'],
      icon: Moon,
      keywords: ['reflect', 'evening', 'review', 'mood', 'gratitude', 'journal'],
      onExecute: () => {
        onOpenReflection();
        onClose();
      },
    },
    {
      id: 'log-activity',
      title: 'Log past activity',
      subtitle: 'Record time spent offline or earlier today',
      category: 'Focus & Rhythm',
      shortcut: [],
      icon: Clock,
      keywords: ['log', 'activity', 'past', 'manual', 'time'],
      onExecute: () => {
        onOpenActivity();
        onClose();
      },
    },
    {
      id: 'nav-today',
      title: 'Go to Today',
      subtitle: 'Central calm dashboard and next tasks',
      category: 'Navigation',
      shortcut: [modSymbol, '1'],
      icon: Sun,
      keywords: ['today', 'dashboard', 'home', 'main'],
      onExecute: () => {
        onGoPage('today');
        onClose();
      },
    },
    {
      id: 'nav-rhythm',
      title: 'Go to Daily Rhythm',
      subtitle: 'Intentional schedule, routine timeline & tracking',
      category: 'Navigation',
      shortcut: [modSymbol, '2'],
      icon: Clock,
      keywords: ['rhythm', 'routine', 'schedule', 'timeline'],
      onExecute: () => {
        onGoPage('rhythm');
        onClose();
      },
    },
    {
      id: 'nav-focus',
      title: 'Go to Focus Room',
      subtitle: 'Large circular timer and distraction shield',
      category: 'Navigation',
      shortcut: [modSymbol, '3'],
      icon: Timer,
      keywords: ['focus', 'room', 'timer', 'shield', 'distraction'],
      onExecute: () => {
        onGoPage('focus');
        onClose();
      },
    },
    {
      id: 'nav-notebook',
      title: 'Go to Notebook',
      subtitle: 'Your ruled paper journal and wandering thoughts',
      category: 'Navigation',
      shortcut: [modSymbol, '4'],
      icon: BookOpen,
      keywords: ['notebook', 'journal', 'notes', 'pages', 'writing'],
      onExecute: () => {
        onGoPage('notebook');
        onClose();
      },
    },
    {
      id: 'nav-reflect',
      title: 'Go to Weekly Reflections',
      subtitle: 'Review stats, moods, and weekly rhythm balance',
      category: 'Navigation',
      shortcut: [modSymbol, '5'],
      icon: Moon,
      keywords: ['reflect', 'reflections', 'stats', 'weekly', 'review'],
      onExecute: () => {
        onGoPage('reflect');
        onClose();
      },
    },
    {
      id: 'nav-you',
      title: 'Go to Your Space & Sync',
      subtitle: 'Identity, account settings, and cloud sync status',
      category: 'Navigation',
      shortcut: [modSymbol, '6'],
      icon: LayoutGrid,
      keywords: ['you', 'space', 'account', 'sync', 'profile'],
      onExecute: () => {
        onGoPage('you');
        onClose();
      },
    },
    {
      id: 'view-shortcuts',
      title: 'View all keyboard shortcuts',
      subtitle: 'Complete list of navigation and productivity hotkeys',
      category: 'System',
      shortcut: ['?'],
      icon: HelpCircle,
      keywords: ['shortcuts', 'keyboard', 'hotkeys', 'cheat', 'help'],
      onExecute: () => {
        onOpenShortcutsGuide();
        onClose();
      },
    },
    {
      id: 'open-settings',
      title: 'Tend Settings & Backups',
      subtitle: 'Custom allowances, appearance, and data export',
      category: 'System',
      shortcut: [modSymbol, ','],
      icon: Settings,
      keywords: ['settings', 'preferences', 'backup', 'export', 'import'],
      onExecute: () => {
        onOpenSettings();
        onClose();
      },
    },
    ...(onOpenAuth ? [{
      id: 'open-auth',
      title: 'Sign In / Account Access (Clerk)',
      subtitle: 'Sign in, manage Clerk identity, or switch accounts',
      category: 'System' as const,
      icon: Shield,
      keywords: ['auth', 'login', 'signin', 'signup', 'clerk', 'account', 'sync'],
      onExecute: () => {
        onOpenAuth();
        onClose();
      },
    }] : []),
  ], [modSymbol, onNewNote, onNewTask, timerActive, timerPaused, onToggleTimer, onStartTimer, onOpenReflection, onOpenActivity, onGoPage, onOpenShortcutsGuide, onOpenSettings, onOpenAuth, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(act => {
      if (act.title.toLowerCase().includes(q)) return true;
      if (act.subtitle.toLowerCase().includes(q)) return true;
      if (act.category.toLowerCase().includes(q)) return true;
      if (act.keywords?.some(k => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onExecute();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        {/* Decorative subtle botanical watermark */}
        <div className="cmd-watermark" aria-hidden="true">
          <svg viewBox="0 0 100 120" fill="none">
            <path d="M47 104c8-25 13-50 8-86M54 74C30 71 20 58 22 42c20 1 29 14 32 32Zm3-26c19-4 27-14 27-30-18 1-27 11-27 30ZM50 91C30 86 18 89 9 79c16-11 35-1 41 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className="cmd-header">
          <div className="cmd-search-wrap">
            <Search className="cmd-search-icon" size={18} />
            <input
              ref={inputRef}
              type="text"
              className="cmd-input"
              placeholder="Type an action, shortcut, or page..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query ? (
              <button className="cmd-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : (
              <kbd className="cmd-esc-hint">esc</kbd>
            )}
          </div>
        </div>

        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmd-empty">
              <Sprout />
              <p>No actions match &ldquo;{query}&rdquo;</p>
              <span>Try typing &ldquo;note&rdquo;, &ldquo;task&rdquo;, &ldquo;focus&rdquo;, or &ldquo;rhythm&rdquo;</span>
            </div>
          ) : (
            filtered.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = action.icon;
              return (
                <div
                  key={action.id}
                  className={`cmd-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => action.onExecute()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="cmd-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="cmd-item-body">
                    <div className="cmd-item-title">{action.title}</div>
                    <div className="cmd-item-sub">{action.subtitle}</div>
                  </div>
                  {action.shortcut && action.shortcut.length > 0 && (
                    <div className="cmd-item-shortcut">
                      {action.shortcut.map((key, i) =>
                        key === 'or' ? (
                          <span key={i} className="cmd-shortcut-or">or</span>
                        ) : (
                          <kbd key={i} className="cmd-kbd">{key}</kbd>
                        )
                      )}
                    </div>
                  )}
                  <ArrowRight size={14} className="cmd-item-arrow" />
                </div>
              );
            })
          )}
        </div>

        <div className="cmd-footer">
          <div className="cmd-footer-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to select</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
          <button className="cmd-footer-help-link" onClick={() => { onOpenShortcutsGuide(); onClose(); }}>
            <HelpCircle size={13} />
            <span>Shortcuts guide (?)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
