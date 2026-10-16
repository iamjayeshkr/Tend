import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { ShortcutsModal } from './ShortcutsModal';

describe('CommandPalette & ShortcutsModal', () => {
  const dummyProps = {
    isOpen: true,
    onClose: vi.fn(),
    onGoPage: vi.fn(),
    onNewNote: vi.fn(),
    onNewTask: vi.fn(),
    onToggleTimer: vi.fn(),
    onStartTimer: vi.fn(),
    timerActive: false,
    timerPaused: false,
    onOpenReflection: vi.fn(),
    onOpenActivity: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenShortcutsGuide: vi.fn(),
  };

  it('renders CommandPalette with search bar and key actions when open', () => {
    const html = renderToStaticMarkup(<CommandPalette {...dummyProps} />);
    expect(html).toContain('Type an action, shortcut, or page...');
    expect(html).toContain('Create new note');
    expect(html).toContain('Capture a task');
    expect(html).toContain('Start focus timer');
    expect(html).toContain('Go to Today');
    expect(html).toContain('Go to Notebook');
    expect(html).toContain('View all keyboard shortcuts');
  });

  it('reflects active timer state in CommandPalette title', () => {
    const htmlRunning = renderToStaticMarkup(
      <CommandPalette {...dummyProps} timerActive={true} timerPaused={false} />
    );
    expect(htmlRunning).toContain('Pause focus session');

    const htmlPaused = renderToStaticMarkup(
      <CommandPalette {...dummyProps} timerActive={true} timerPaused={true} />
    );
    expect(htmlPaused).toContain('Resume focus session');
  });

  it('renders nothing when CommandPalette isOpen is false', () => {
    const html = renderToStaticMarkup(<CommandPalette {...dummyProps} isOpen={false} />);
    expect(html).toBe('');
  });

  it('renders ShortcutsModal with categorized productivity hotkeys', () => {
    const html = renderToStaticMarkup(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);
    expect(html).toContain('Keyboard Shortcuts');
    expect(html).toContain('Everyday Speed &amp; Capture');
    expect(html).toContain('Fast Navigation');
    expect(html).toContain('Ruled Notebook Hotkeys');
    expect(html).toContain('Open Command Palette &amp; Search');
    expect(html).toContain('Create new note &amp; focus editor');
    expect(html).toContain('Instantly save current draft');
    expect(html).toContain('Flip to previous note page');
    expect(html).toContain('Flip to next note page');
  });

  it('renders nothing when ShortcutsModal isOpen is false', () => {
    const html = renderToStaticMarkup(<ShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(html).toBe('');
  });
});
