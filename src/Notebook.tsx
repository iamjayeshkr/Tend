import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, List, MoreHorizontal, Pin, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { uid, type AppState, type Idea } from './core';
import './notebook.css';

interface NotebookProps {
  state: AppState;
  commit: (fn: (state: AppState) => AppState) => Promise<boolean>;
  notify: (message: string) => void;
}

interface PageDraft extends Idea { title: string; revision: number; dirty: boolean }
type SavePhase = 'new' | 'edited' | 'saving' | 'saved' | 'error';
const DRAFT_KEY = 'tend.notebook.drafts.v1';
const statuses: Array<{ value: Idea['status']; label: string }> = [
  { value: 'unexplored', label: 'Still wondering' },
  { value: 'researching', label: 'Exploring' },
  { value: 'answered', label: 'Answered' },
];

function pageTitle(page: Idea): string {
  return page.title?.trim() || page.text.trim().split('\n')[0]?.slice(0, 70) || 'Untitled page';
}

function hasWords(page: Idea): boolean { return Boolean(page.text.trim() || page.title?.trim()); }

function newDraft(): PageDraft {
  const now = Date.now();
  return { id: uid(), title: '', text: '', kind: 'idea', status: 'unexplored', createdAt: now, revision: now, dirty: false };
}

function editDraft(page: Idea): PageDraft {
  return { ...page, title: page.title ?? '', revision: page.modifiedAt ?? page.createdAt, dirty: false };
}

function asIdea(draft: PageDraft): Idea {
  return {
    id: draft.id, title: draft.title, text: draft.text, kind: draft.kind, status: draft.status,
    createdAt: draft.createdAt, modifiedAt: draft.modifiedAt ?? draft.createdAt, pinned: Boolean(draft.pinned),
  };
}

// An immediate local draft protects keystrokes before the durable save completes,
// including when Android backgrounds the WebView or the user switches sections.
function readDrafts(): Record<string, PageDraft> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, PageDraft> = {};
    for (const value of Object.values(raw).slice(0, 1000)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Partial<PageDraft>;
      if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.title !== 'string' || item.title.length > 160 || typeof item.text !== 'string' || item.text.length > 20_000) continue;
      if (!['idea', 'question'].includes(item.kind ?? '') || !statuses.some(status => status.value === item.status)) continue;
      if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || item.createdAt < 0 || typeof item.revision !== 'number' || !Number.isFinite(item.revision) || item.revision < 0) continue;
      if (item.modifiedAt !== undefined && (typeof item.modifiedAt !== 'number' || !Number.isFinite(item.modifiedAt) || item.modifiedAt < 0)) continue;
      if (item.pinned !== undefined && typeof item.pinned !== 'boolean') continue;
      result[item.id] = { id: item.id, title: item.title, text: item.text, kind: item.kind!, status: item.status!, createdAt: item.createdAt, modifiedAt: item.modifiedAt, pinned: item.pinned, revision: item.revision, dirty: true };
    }
    return result;
  } catch { return {}; }
}

function PageSprig() {
  return <svg className="nb-sprig" viewBox="0 0 100 120" fill="none" aria-hidden="true">
    <path d="M47 104c8-25 13-50 8-86M54 74C30 71 20 58 22 42c20 1 29 14 32 32Zm3-26c19-4 27-14 27-30-18 1-27 11-27 30ZM50 91C30 86 18 89 9 79c16-11 35-1 41 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M54 67 36 53M62 39l11-13M46 89 22 83M55 17l-5-7m9 6 4-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>;
}

export default function Notebook({ state, commit, notify }: NotebookProps) {
  const [initial] = useState(() => {
    const cache = readDrafts();
    const recovered = Object.values(cache).filter(hasWords).sort((a, b) => b.revision - a.revision)[0];
    const latest = [...state.ideas].sort((a, b) => (b.modifiedAt ?? b.createdAt) - (a.modifiedAt ?? a.createdAt))[0];
    return { cache, draft: recovered ?? (latest ? editDraft(latest) : newDraft()), recovered: Boolean(recovered) };
  });
  const [draft, setDraft] = useState<PageDraft>(initial.draft);
  const draftRef = useRef(draft);
  const [cache, setCache] = useState(initial.cache);
  const cacheRef = useRef(cache);
  const [phase, setPhase] = useState<SavePhase>(initial.recovered ? 'edited' : hasWords(draft) ? 'saved' : 'new');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'question' | 'pinned'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [removed, setRemoved] = useState<Idea | null>(null);
  const [draftStorageAvailable, setDraftStorageAvailable] = useState(true);
  const [recovered, setRecovered] = useState(initial.recovered);
  const titleInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const callbacks = useRef({ commit, notify });
  callbacks.current = { commit, notify };
  const sequence = useRef(Date.now());
  const saves = useRef(new Map<string, { revision: number; promise: Promise<boolean> }>());
  const savedRevisions = useRef(new Map<string, number>());
  const deletedIds = useRef(new Set<string>());
  const flush = useRef<() => Promise<boolean>>(async () => true);

  function cacheDraft(next: PageDraft | null, id = next?.id) {
    const updated = { ...cacheRef.current };
    if (next) updated[next.id] = next;
    else if (id) delete updated[id];
    cacheRef.current = updated;
    if (mounted.current) setCache(updated);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
      if (mounted.current) setDraftStorageAvailable(true);
    } catch {
      if (mounted.current) setDraftStorageAvailable(false);
    }
  }

  function changePage(changes: Partial<Pick<PageDraft, 'title' | 'text' | 'kind' | 'status' | 'pinned'>>) {
    sequence.current = Math.max(Date.now(), sequence.current + 1);
    const next: PageDraft = { ...draftRef.current, ...changes, modifiedAt: Date.now(), revision: sequence.current, dirty: true };
    draftRef.current = next;
    setDraft(next);
    setPhase(hasWords(next) ? 'edited' : 'new');
    cacheDraft(next);
  }

  async function saveSnapshot(snapshot: PageDraft): Promise<boolean> {
    if (!snapshot.dirty || !hasWords(snapshot) || deletedIds.current.has(snapshot.id)) return true;
    if ((savedRevisions.current.get(snapshot.id) ?? -1) >= snapshot.revision) return true;
    const pending = saves.current.get(snapshot.id);
    if (pending?.revision === snapshot.revision) return pending.promise;
    if (mounted.current && draftRef.current.id === snapshot.id && draftRef.current.revision === snapshot.revision) setPhase('saving');
    const promise = (async () => {
      const idea = asIdea(snapshot);
      let ok = false;
      try {
        ok = await callbacks.current.commit(current => {
          if (deletedIds.current.has(snapshot.id)) return current;
          const exists = current.ideas.some(page => page.id === snapshot.id);
          return { ...current, ideas: exists ? current.ideas.map(page => page.id === snapshot.id ? idea : page) : [...current.ideas, idea] };
        });
      } catch { ok = false; }
      if (ok) {
        savedRevisions.current.set(snapshot.id, snapshot.revision);
        if (cacheRef.current[snapshot.id]?.revision === snapshot.revision) cacheDraft(null, snapshot.id);
      }
      if (mounted.current && draftRef.current.id === snapshot.id && draftRef.current.revision === snapshot.revision) {
        if (ok) {
          draftRef.current = { ...draftRef.current, dirty: false };
          setDraft(draftRef.current);
        }
        setPhase(ok ? 'saved' : 'error');
      }
      if (saves.current.get(snapshot.id)?.revision === snapshot.revision) saves.current.delete(snapshot.id);
      return ok;
    })();
    saves.current.set(snapshot.id, { revision: snapshot.revision, promise });
    return promise;
  }
  flush.current = () => saveSnapshot(draftRef.current);

  useEffect(() => {
    mounted.current = true;
    const onHidden = () => { if (document.visibilityState === 'hidden') void flush.current(); };
    const onPageHide = () => { void flush.current(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      void flush.current();
    };
  }, []);

  useEffect(() => {
    if (!draft.dirty || !hasWords(draft)) return;
    const timeout = window.setTimeout(() => { void saveSnapshot(draft); }, 650);
    return () => window.clearTimeout(timeout);
  }, [draft.id, draft.revision, draft.dirty]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!draftStorageAvailable && draftRef.current.dirty && hasWords(draftRef.current)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftStorageAvailable]);

  useLayoutEffect(() => {
    const field = bodyInput.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(field.scrollHeight, 352)}px`;
  }, [draft.id, draft.text]);

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  const allPages = useMemo(() => {
    const merged = new Map<string, Idea | PageDraft>();
    for (const page of state.ideas) if (!deletedIds.current.has(page.id)) merged.set(page.id, page);
    for (const item of Object.values(cache)) if (!deletedIds.current.has(item.id) && hasWords(item)) merged.set(item.id, item);
    if (draft && !deletedIds.current.has(draft.id) && hasWords(draft)) merged.set(draft.id, draft);
    return [...merged.values()].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.modifiedAt ?? b.createdAt) - (a.modifiedAt ?? a.createdAt));
  }, [state.ideas, cache, draft]);

  const visiblePages = allPages.filter(page => {
    const matchesFilter = filter === 'all' || (filter === 'question' ? page.kind === 'question' : page.pinned);
    return matchesFilter && `${page.title ?? ''} ${page.text}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });

  const chronologicalPages = useMemo(() => {
    const map = new Map<string, Idea | PageDraft>();
    for (const page of state.ideas) {
      if (!deletedIds.current.has(page.id)) map.set(page.id, page);
    }
    for (const item of Object.values(cache)) {
      if (!deletedIds.current.has(item.id)) map.set(item.id, item);
    }
    if (draft && !deletedIds.current.has(draft.id)) {
      map.set(draft.id, draft);
    }
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }, [state.ideas, cache, draft]);

  const pageIndex = chronologicalPages.findIndex(page => page.id === draft.id);
  const pageNumber = (pageIndex >= 0 ? pageIndex : 0) + 1;
  const words = `${draft.title} ${draft.text}`.trim().split(/\s+/).filter(Boolean).length;
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const [slideAnimation, setSlideAnimation] = useState<'left' | 'right' | null>(null);

  function activate(next: PageDraft) {
    draftRef.current = next;
    setDraft(next);
    setPhase(next.dirty && hasWords(next) ? 'edited' : hasWords(next) ? 'saved' : 'new');
    setMenuOpen(false);
    setConfirmDelete(false);
    setRecovered(false);
    setDrawerOpen(false);
  }

  async function openPage(page: Idea | PageDraft) {
    if (page.id === draftRef.current.id) { setDrawerOpen(false); return; }
    setOperationBusy(true);
    const ok = await flush.current();
    if (ok) {
      const target = cacheRef.current[page.id] ?? ('dirty' in page ? (page as PageDraft) : editDraft(page));
      activate(target);
    }
    setOperationBusy(false);
  }

  async function addPage() {
    setOperationBusy(true);
    const ok = await flush.current();
    if (ok) {
      const next = newDraft();
      cacheDraft(next);
      activate(next);
      setSearch('');
      setFilter('all');
      window.setTimeout(() => titleInput.current?.focus(), 0);
    }
    setOperationBusy(false);
  }

  async function removePage() {
    const selected = draftRef.current;
    setOperationBusy(true);
    const ok = await callbacks.current.commit(current => ({ ...current, ideas: current.ideas.filter(page => page.id !== selected.id) }));
    if (ok) {
      deletedIds.current.add(selected.id);
      cacheDraft(null, selected.id);
      setRemoved(asIdea(selected));
      const remaining = chronologicalPages.filter(page => page.id !== selected.id);
      const target = remaining[pageIndex > 0 ? pageIndex - 1 : 0];
      activate(target ? (cacheRef.current[target.id] ?? ('dirty' in target ? (target as PageDraft) : editDraft(target))) : newDraft());
    }
    setOperationBusy(false);
  }

  async function undoRemoval() {
    if (!removed) return;
    const restored = removed;
    setOperationBusy(true);
    const saved = await flush.current();
    if (saved) {
      const ok = await callbacks.current.commit(current => ({ ...current, ideas: current.ideas.some(page => page.id === restored.id) ? current.ideas : [...current.ideas, restored] }));
      if (ok) {
        deletedIds.current.delete(restored.id);
        activate(editDraft(restored));
        setRemoved(null);
        callbacks.current.notify('Your page is back in the notebook.');
      }
    }
    setOperationBusy(false);
  }

  function indexContent(mobile: boolean) {
    return <>
      <div className="nb-index-heading"><div><span className="nb-overline">THE CONTENTS</span><h2>Your pages<span>{allPages.length.toString().padStart(2, '0')}</span></h2></div>{mobile && <button className="nb-icon-button" aria-label="Close page list" onClick={() => setDrawerOpen(false)}><X size={20}/></button>}</div>
      <label className="nb-search"><Search size={16}/><input aria-label="Search notebook" placeholder="Find a thought…" value={search} onChange={event => setSearch(event.target.value)}/>{search && <button className="nb-search-clear" aria-label="Clear notebook search" onClick={() => setSearch('')}><X size={14}/></button>}</label>
      <div className="nb-filters" aria-label="Filter notebook pages">
        {([{ value: 'all', label: 'All' }, { value: 'question', label: 'Questions' }, { value: 'pinned', label: 'Pinned' }] as const).map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
      </div>
      <div className="nb-page-list">
        {visiblePages.map(page => <button key={page.id} className={`nb-index-page ${draft.id === page.id ? 'is-current' : ''}`} aria-label={`Open page: ${pageTitle(page)}`} aria-current={draft.id === page.id ? 'page' : undefined} disabled={operationBusy} onClick={() => void openPage(page)}>
          <span className="nb-page-corner" aria-hidden="true"/>
          <span className="nb-index-page-meta">{page.kind === 'question' ? <><CircleHelp size={12}/>{statuses.find(item => item.value === page.status)?.label}</> : 'NOTE'}{page.pinned && <Pin size={12} aria-label="Pinned"/>}</span>
          <strong>{pageTitle(page)}</strong>
          <span className="nb-page-preview">{page.title ? page.text.trim().replace(/\n/g, ' ') || 'A thought, ready to unfold.' : page.text.trim().split('\n').slice(1).join(' ') || 'Open this page to keep writing.'}</span>
          <time dateTime={new Date(page.modifiedAt ?? page.createdAt).toISOString()}>{new Date(page.modifiedAt ?? page.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short' })}</time>
        </button>)}
        {!visiblePages.length && <div className="nb-index-empty"><BookOpen size={26} strokeWidth={1.3}/><strong>{allPages.length ? 'No pages here yet.' : 'A little room to think.'}</strong><p>{search ? 'Try another word, or clear your search.' : filter === 'pinned' ? 'Pin a page from its options to find it quickly.' : filter === 'question' ? 'Choose “Question” on a page to follow an idea further.' : 'Your notes will gather here as you write.'}</p>{(search || filter !== 'all') && <button onClick={() => { setSearch(''); setFilter('all'); }}>Show all pages</button>}</div>}
      </div>
      <p className="nb-index-signoff">small thoughts, kept safe.</p>
    </>;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartPos.current || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartPos.current.x;
    const deltaY = endY - touchStartPos.current.y;
    const elapsed = Date.now() - touchStartPos.current.time;
    touchStartPos.current = null;

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && elapsed < 800) {
      if (deltaX < 0) {
        if (operationBusy) return;
        setSlideAnimation('left');
        setTimeout(() => setSlideAnimation(null), 260);
        if (pageIndex >= 0 && pageIndex < chronologicalPages.length - 1) {
          const next = chronologicalPages[pageIndex + 1];
          if (next) void openPage(next);
        } else {
          void addPage();
        }
      } else if (deltaX > 0) {
        if (operationBusy || pageIndex <= 0) return;
        setSlideAnimation('right');
        setTimeout(() => setSlideAnimation(null), 260);
        const previous = chronologicalPages[pageIndex - 1];
        if (previous) void openPage(previous);
      }
    }
  };

  return <section className="tend-notebook" aria-label="Personal notebook">
    <header className="nb-heading"><div><span className="nb-overline">MAKE A LITTLE SPACE</span><h1>Your notebook<span>.</span></h1><p>A quiet place for class notes, ideas and questions.</p></div><button className="nb-primary" onClick={() => void addPage()} disabled={operationBusy}><Plus size={18}/>New page</button></header>
    <div className="nb-mobile-toolbar"><button ref={drawerTrigger} onClick={() => setDrawerOpen(true)}><List size={18}/>Browse pages<span>{chronologicalPages.length}</span><ChevronDown size={15}/></button><span>your thoughts, in order.</span></div>
    <div className="nb-workspace">
      <aside className="nb-index" aria-label="Notebook page list">{indexContent(false)}</aside>
      <div className="nb-book-wrap">
        <div className="nb-book-edge" aria-hidden="true"/>
        <article
          className={`nb-paper ${slideAnimation ? `is-sliding-${slideAnimation}` : ''}`}
          aria-label={`Notebook page ${pageNumber}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="nb-binding" aria-hidden="true"><i/><i/><i/><i/><i/></div>
          <div className="nb-paper-top"><span className="nb-overline">{draft.kind === 'question' ? 'A QUESTION TO FOLLOW' : allPages.length === 0 ? 'YOUR FIRST PAGE' : 'A LITTLE ROOM TO THINK'}</span><div className="nb-paper-controls">
            <span className={`nb-save-status is-${phase}`} role="status" aria-live="polite">{phase === 'saved' ? <><Check size={13}/>Saved on this device</> : phase === 'saving' ? 'Saving…' : phase === 'error' ? 'Couldn’t save' : phase === 'edited' ? 'Unsaved changes' : 'Start with a thought'}</span>
            {hasWords(draft) && <button className="nb-icon-button" aria-label="Page options" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); setConfirmDelete(false); }} disabled={operationBusy}><MoreHorizontal size={21}/></button>}
          </div></div>
          {menuOpen && <><button className="nb-menu-dismiss" aria-label="Close page options" onClick={() => { setMenuOpen(false); setConfirmDelete(false); }}/><div className="nb-page-menu" aria-label="Page options menu">
            {confirmDelete ? <><strong>Remove this page?</strong><p>You can undo this after removing it.</p><button className="nb-remove-button" onClick={() => void removePage()} disabled={operationBusy}><Trash2 size={15}/>Remove this page</button><button onClick={() => setConfirmDelete(false)}>Keep writing</button></> : <><button onClick={() => { changePage({ pinned: !draft.pinned }); setMenuOpen(false); }}><Pin size={16}/>{draft.pinned ? 'Unpin page' : 'Pin page'}</button><button className="nb-remove-button" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Remove page</button></>}
          </div></>}
          {recovered && <div className="nb-recovered"><RotateCcw size={14}/><span>Your last draft is here. Pick up where you left off.</span><button aria-label="Dismiss recovered draft message" onClick={() => setRecovered(false)}><X size={14}/></button></div>}
          {phase === 'error' && <p className="nb-save-error">This page has not been saved to your notebook.{draftStorageAvailable ? ' A recovery draft is kept on this device.' : ' Please keep this page open.'} Try saving again.</p>}
          <div className="nb-writing-area">
            <label className="nb-title-label"><span className="nb-sr-only">Page title</span><input ref={titleInput} aria-label="Page title" className="nb-page-title" placeholder="Give this page a title" value={draft.title} maxLength={160} disabled={operationBusy} onChange={event => changePage({ title: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); bodyInput.current?.focus(); } }}/></label>
            <div className="nb-page-details"><time dateTime={new Date(draft.createdAt).toISOString()}>{new Date(draft.createdAt).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</time><span aria-hidden="true">·</span><label className="nb-kind-select"><span className="nb-sr-only">Page type</span><select aria-label="Page type" value={draft.kind} disabled={operationBusy} onChange={event => changePage({ kind: event.target.value as Idea['kind'] })}><option value="idea">Note</option><option value="question">Question</option></select><ChevronDown size={12}/></label>{draft.pinned && <Pin size={13} aria-label="Pinned page"/>}</div>
            {draft.kind === 'question' && <div className="nb-question-progress"><CircleHelp size={15}/><label htmlFor="nb-question-status">Where are you with this?</label><select id="nb-question-status" aria-label="Question progress" value={draft.status} disabled={operationBusy} onChange={event => changePage({ status: event.target.value as Idea['status'] })}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}
            <div className="nb-body-wrap"><textarea ref={bodyInput} aria-label="Write your page" className="nb-page-body" placeholder={draft.kind === 'question' ? 'What are you wondering about?\nLeave room for an answer.' : 'Start writing here…'} value={draft.text} maxLength={20_000} rows={11} disabled={operationBusy} onChange={event => changePage({ text: event.target.value })}/>{!hasWords(draft) && <div className="nb-blank-invitation" aria-hidden="true"><PageSprig/><span>It doesn’t need to be perfect.<br/>It just needs to be yours.</span></div>}</div>
          </div>
          <footer className="nb-paper-footer"><span>{words ? `${words} ${words === 1 ? 'word' : 'words'}` : 'No pressure. Just a blank page.'}</span><span className="nb-page-number">{String(pageNumber).padStart(2, '0')}</span><button className="nb-save-button" onClick={() => void flush.current()} disabled={operationBusy || phase === 'saving' || !hasWords(draft) || !draft.dirty}><Check size={15}/>{phase === 'saved' ? 'Saved' : 'Save page'}</button></footer>
          {draft.text.length >= 19_000 && <p className="nb-limit-hint">{(20_000 - draft.text.length).toLocaleString()} characters left on this page. Start a new page whenever you need more room.</p>}
        </article>
        <div className="nb-below-paper">
          <span>Some things deserve more than a passing thought.</span>
          <div>
            <button
              aria-label="Previous notebook page"
              disabled={operationBusy || pageIndex <= 0}
              onClick={() => {
                if (pageIndex > 0) {
                  const previous = chronologicalPages[pageIndex - 1];
                  if (previous) {
                    setSlideAnimation('right');
                    setTimeout(() => setSlideAnimation(null), 260);
                    void openPage(previous);
                  }
                }
              }}
            >
              <ArrowLeft size={17}/>
            </button>
            <button
              aria-label={pageIndex >= chronologicalPages.length - 1 ? "Slide to new notebook page" : "Next notebook page"}
              title={pageIndex >= chronologicalPages.length - 1 ? "Slide into new page" : "Next page"}
              disabled={operationBusy}
              onClick={() => {
                setSlideAnimation('left');
                setTimeout(() => setSlideAnimation(null), 260);
                if (pageIndex >= 0 && pageIndex < chronologicalPages.length - 1) {
                  const next = chronologicalPages[pageIndex + 1];
                  if (next) void openPage(next);
                } else {
                  void addPage();
                }
              }}
            >
              {pageIndex >= chronologicalPages.length - 1 ? <Plus size={17}/> : <ArrowRight size={17}/>}
            </button>
          </div>
        </div>
      </div>
    </div>
    <dialog ref={drawer} className="nb-page-drawer tend-notebook" aria-label="Browse notebook pages" onCancel={() => setDrawerOpen(false)} onClose={() => { setDrawerOpen(false); drawerTrigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><div className="nb-drawer-content">{indexContent(true)}<button className="nb-primary" onClick={() => void addPage()} disabled={operationBusy}><Plus size={18}/>New page</button></div></dialog>
    {removed && <div className="nb-undo" role="status"><span>Page removed.</span><button onClick={() => void undoRemoval()} disabled={operationBusy}><RotateCcw size={15}/>Undo removal</button><button className="nb-icon-button" aria-label="Dismiss undo" onClick={() => setRemoved(null)}><X size={17}/></button></div>}
  </section>;
}
