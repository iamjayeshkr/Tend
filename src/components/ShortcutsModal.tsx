import React from 'react';
import { X, Sparkles, Command, BookOpen, CheckCircle2, Timer, Compass, Edit3 } from 'lucide-react';
import { Sprout } from '../Doodles';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';
  const alt = isMac ? '⌥' : 'Alt';

  const groups = [
    {
      title: '⚡ Everyday Speed & Capture',
      icon: Sparkles,
      shortcuts: [
        { keys: [mod, 'K'], label: 'Open Command Palette & Search' },
        { keys: [mod, 'N'], label: 'Create new note & focus editor' },
        { keys: [mod, 'T'], label: 'Capture a task into Today’s list' },
        { keys: ['Space'], label: 'Toggle Focus Timer (Start / Pause / Resume)' },
        { keys: [mod, '⇧', 'F'], label: 'Global start / toggle Focus Timer' },
        { keys: [mod, '⇧', 'R'], label: 'Evening reflection & check-in' },
      ],
    },
    {
      title: '🗺️ Fast Navigation',
      icon: Compass,
      shortcuts: [
        { keys: [mod, '1'], label: 'Today Dashboard' },
        { keys: [mod, '2'], label: 'Daily Rhythm & Timeline' },
        { keys: [mod, '3'], label: 'Focus Room & Shield' },
        { keys: [mod, '4'], label: 'Notebook Journal' },
        { keys: [mod, '5'], label: 'Weekly Reflections' },
        { keys: [mod, '6'], label: 'Your Space & Identity' },
      ],
    },
    {
      title: '📖 Ruled Notebook Hotkeys',
      icon: BookOpen,
      shortcuts: [
        { keys: [mod, 'S'], label: 'Instantly save current draft' },
        { keys: [mod, 'N'], label: 'New clean page in notebook' },
        { keys: [alt, '←'], label: 'Flip to previous note page' },
        { keys: [alt, '→'], label: 'Flip to next note page' },
        { keys: [mod, '⇧', 'P'], label: 'Pin / unpin active note' },
      ],
    },
    {
      title: '🌿 System & Dialogs',
      icon: Command,
      shortcuts: [
        { keys: ['?'], label: 'Open this Keyboard Shortcuts cheat sheet' },
        { keys: [mod, ','], label: 'Open Preferences & Settings' },
        { keys: ['Esc'], label: 'Dismiss active dialog or palette' },
      ],
    },
  ];

  return (
    <div className="modal-backdrop frosted-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
      <div className="modal frosted-modal shortcuts-modal" onClick={e => e.stopPropagation()}>
        {/* Botanical watermark */}
        <div className="modal-corner-art" aria-hidden="true">
          <svg viewBox="0 0 120 140" fill="none">
            <path d="M60 125c12-32 18-65 12-110M70 88C38 84 25 68 28 47c26 1 38 18 42 41Zm4-33c24-5 35-18 35-39-23 1-35 14-35 39ZM65 109C38 103 23 107 11 94c21-14 45-1 54 15Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className="modal-heading">
          <div>
            <div className="modal-eyebrow">
              <Sprout />
              <span>KEYBOARD PRODUCTIVITY</span>
            </div>
            <h2>Keyboard Shortcuts</h2>
            <p className="modal-intro">
              Fly through Tend with thoughtful, intentional hotkeys designed for flow.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close shortcuts guide">
            <X size={18} />
          </button>
        </div>

        <div className="shortcuts-grid">
          {groups.map((group, gIdx) => {
            const Icon = group.icon;
            return (
              <div key={gIdx} className="shortcut-group-card">
                <div className="shortcut-group-title">
                  <Icon size={15} />
                  <span>{group.title}</span>
                </div>
                <div className="shortcut-table">
                  {group.shortcuts.map((sc, sIdx) => (
                    <div key={sIdx} className="shortcut-row">
                      <span className="shortcut-label">{sc.label}</span>
                      <div className="shortcut-badges">
                        {sc.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="sc-kbd">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-actions-bar" style={{ marginTop: '24px' }}>
          <button className="primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Got it, let’s fly
          </button>
        </div>
      </div>
    </div>
  );
}
