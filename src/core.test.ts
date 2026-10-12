import { afterEach, describe, expect, it, vi } from 'vitest';
import { activityMinutes, categoryDayMinutes, currentBlock, dateKey, dayStats, defaultState, formatClock, formatMinutes, isLogWindowOpen, loadState, makeBackup, parseBackup, persistState, timerElapsed, timerSegments, timerTimingApproximate, uid, weekStats, type Activity, type ActiveTimer } from './core';

const stamp = (value: string) => new Date(value).getTime();
const activity = (start: string, end: string, category: Activity['category'] = 'study'): Activity => ({ id: uid(), title: 'Session', start: stamp(start), end: stamp(end), category, source: 'manual', createdAt: stamp(start), modifiedAt: stamp(end) });

afterEach(() => { vi.unstubAllGlobals(); });

describe('accurate paused sessions', () => {
  const minute = 60_000;
  const start = stamp('2026-09-12T12:50:00');
  const timer = (): ActiveTimer => ({ id: 'timer', title: 'Work across lunch', category: 'work', startedAt: start, durationMinutes: 25, pausedAt: null, pausedMs: 20 * minute, pauses: [{ start: start + 5 * minute, end: start + 25 * minute }], taskId: 'task', missionId: 'mission' });

  it('retains actual active segments before and after a pause', () => {
    const active = timer();
    expect(timerSegments(active, start + 30 * minute)).toEqual([{ start, end: start + 5 * minute }, { start: start + 25 * minute, end: start + 30 * minute }]);
    expect(timerElapsed(active, start + 30 * minute)).toBe(10 * minute);
    expect(timerTimingApproximate(active)).toBe(false);
    active.pausedAt = start + 30 * minute;
    expect(timerSegments(active, start + 90 * minute)).toEqual(timerSegments(active, start + 30 * minute));
  });

  it('trims corrected duration through active intervals without counting the break', () => {
    expect(timerSegments(timer(), start + 30 * minute, 7)).toEqual([{ start, end: start + 5 * minute }, { start: start + 25 * minute, end: start + 27 * minute }]);
    expect(timerSegments(timer(), start + 30 * minute, 100)).toEqual(timerSegments(timer(), start + 30 * minute));
    expect(timerSegments(timer(), start - minute)).toEqual([]);
  });

  it('keeps legacy elapsed time while identifying unknown pause placement', () => {
    const legacy = timer();
    delete legacy.pauses;
    expect(timerTimingApproximate(legacy)).toBe(true);
    expect(timerSegments(legacy, start + 30 * minute)).toEqual([{ start: start + 20 * minute, end: start + 30 * minute }]);
  });

  it('keeps category and total calculations consistent across gaps, overlap and midnight', () => {
    const state = defaultState();
    const entry = activity('2026-09-12T23:45:00', '2026-09-13T00:30:00', 'work');
    entry.intervals = [{ start: stamp('2026-09-12T23:45:00'), end: stamp('2026-09-12T23:55:00') }, { start: stamp('2026-09-13T00:15:00'), end: stamp('2026-09-13T00:30:00') }];
    state.activities = [entry, activity('2026-09-13T00:20:00', '2026-09-13T00:40:00', 'work')];
    const now = stamp('2026-09-13T12:00:00');
    expect(activityMinutes(entry)).toBe(25);
    expect(categoryDayMinutes(state, 'work', '2026-09-12', now)).toBe(10);
    expect(categoryDayMinutes(state, 'work', '2026-09-13', now)).toBe(25);
    expect(dayStats(state, '2026-09-13', now).focusMinutes).toBe(25);
    expect(dayStats(state, '2026-09-13', now).intentionalMinutes).toBe(25);
  });

  it('round-trips timer and activity linkage without dropping interval metadata', () => {
    const state = defaultState();
    state.timer = timer();
    state.activities = [{ ...activity('2026-09-12T12:50:00', '2026-09-12T13:20:00', 'work'), intervals: timerSegments(state.timer, start + 30 * minute), missionId: 'mission', timingApproximate: false }];
    expect(parseBackup(makeBackup(state))).toEqual(state);
  });

  it('rejects overlapping, out-of-range, reversed intervals and false timer accounting', () => {
    const badIntervals = [[{ start: start - 1, end: start + minute }], [{ start, end: start + 31 * minute }], [{ start: start + minute, end: start }], [{ start, end: start + 3 * minute }, { start: start + 2 * minute, end: start + 4 * minute }]];
    for (const intervals of badIntervals) {
      const state = defaultState();
      state.activities = [{ ...activity('2026-09-12T12:50:00', '2026-09-12T13:20:00'), intervals }];
      expect(() => parseBackup(JSON.stringify(state))).toThrow();
    }
    const state = defaultState(); state.timer = { ...timer(), pausedMs: 0 };
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
  });
});

describe('local day engine', () => {
  it('starts honestly, with a routine but no invented history', () => {
    const state = defaultState();
    expect(state.onboarded).toBe(false);
    expect(state.routine).toHaveLength(7);
    expect(state.tasks).toEqual([]);
    expect(state.activities).toEqual([]);
    expect(state.ideas).toEqual([]);
    expect(defaultState().routine[0]?.id).not.toBe(state.routine[0]?.id);
  });

  it('finds overnight blocks, with an exclusive end boundary', () => {
    const routine = [{ id: '1', title: 'Late study', start: '23:00', end: '01:00', category: 'study' as const }];
    expect(currentBlock(routine, new Date('2026-09-12T23:30:00'))?.id).toBe('1');
    expect(currentBlock(routine, new Date('2026-09-13T00:30:00'))?.id).toBe('1');
    expect(currentBlock(routine, new Date('2026-09-13T01:00:00'))).toBeUndefined();
    expect(currentBlock(routine, new Date('2026-09-12T22:59:00'))).toBeUndefined();
  });

  it('uses the local calendar date', () => {
    const local = new Date(2026, 8, 12, 0, 3);
    expect(dateKey(local)).toBe('2026-09-12');
    expect(dateKey(local.getTime())).toBe('2026-09-12');
    expect(() => dateKey(NaN)).toThrow();
  });

  it('splits an activity across midnight without losing or duplicating minutes', () => {
    const state = defaultState();
    state.activities.push(activity('2026-09-12T23:30:00', '2026-09-13T00:30:00'));
    const now = stamp('2026-09-13T12:00:00');
    expect(dayStats(state, '2026-09-12', now).focusMinutes).toBe(30);
    expect(dayStats(state, '2026-09-13', now).focusMinutes).toBe(30);
  });

  it('unions overlapping activities and includes intentional rest', () => {
    const state = defaultState();
    state.settings.wake = '09:00'; state.settings.sleep = '23:00';
    state.activities.push(activity('2026-09-12T09:00:00', '2026-09-12T10:00:00'), activity('2026-09-12T09:30:00', '2026-09-12T10:30:00', 'project'), activity('2026-09-12T10:00:00', '2026-09-12T11:00:00', 'rest'));
    const stats = dayStats(state, '2026-09-12', stamp('2026-09-12T12:00:00'));
    expect(stats.focusMinutes).toBe(90);
    expect(stats.intentionalMinutes).toBe(120);
    expect(stats.unknownMinutes).toBe(60);
  });

  it('uses actual wake/sleep logs and caps future activity at now', () => {
    const state = defaultState();
    state.wakeLogs['2026-09-12'] = stamp('2026-09-12T10:00:00');
    state.sleepLogs['2026-09-12'] = stamp('2026-09-12T22:00:00');
    state.activities.push(activity('2026-09-12T10:30:00', '2026-09-12T14:00:00', 'exercise'));
    const stats = dayStats(state, '2026-09-12', stamp('2026-09-12T11:00:00'));
    expect(stats.exerciseMinutes).toBe(30);
    expect(stats.intentionalMinutes).toBe(30);
    expect(stats.unknownMinutes).toBe(30);
    expect(dayStats(state, '2026-09-13', stamp('2026-09-12T11:00:00')).unknownMinutes).toBe(0);
  });

  it('does not silently accept a forgotten running timer as productive history', () => {
    const state = defaultState();
    state.timer = { id: uid(), title: 'Study', category: 'study', startedAt: stamp('2026-09-11T21:00:00'), durationMinutes: 25, pausedAt: null, pausedMs: 0 };
    expect(dayStats(state, '2026-09-12', stamp('2026-09-12T12:00:00')).focusMinutes).toBe(0);
  });

  it('filters tasks by date and returns the seven trailing local dates', () => {
    const state = defaultState();
    state.tasks.push({ id: uid(), title: 'Essay', done: true, category: 'study', date: '2026-09-12' }, { id: uid(), title: 'Tomorrow', done: false, category: 'work', date: '2026-09-13' });
    const stats = dayStats(state, '2026-09-12', stamp('2026-09-12T12:00:00'));
    expect(stats.taskDone).toBe(1); expect(stats.taskTotal).toBe(1);
    const days = weekStats(state, new Date('2026-09-12T12:00:00'));
    expect(days).toHaveLength(7); expect(days[0]?.date).toBe('2026-09-06'); expect(days[6]?.date).toBe('2026-09-12');
  });
});

describe('timer recovery and formatting', () => {
  const timer: ActiveTimer = { id: 'timer', title: 'Learn', category: 'study', startedAt: 100_000, durationMinutes: 25, pausedAt: null, pausedMs: 10_000 };
  it('subtracts earlier pauses and freezes during the current pause', () => {
    expect(timerElapsed(timer, 160_000)).toBe(50_000);
    expect(timerElapsed({ ...timer, pausedAt: 150_000 }, 900_000)).toBe(40_000);
    expect(timerElapsed(timer, 1)).toBe(0);
  });
  it('formats large sessions without minute wraparound', () => {
    expect(formatClock(3_661_000)).toBe('01:01:01');
    expect(formatClock(90_000)).toBe('01:30');
    expect(formatClock(-1)).toBe('00:00');
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(NaN)).toBe('0m');
  });
});

describe('backup validation', () => {
  it('preserves old untitled thoughts and new notebook metadata in the same backup', () => {
    const state = defaultState();
    const original = { id: 'old-idea', text: 'A thought from my original notebook.\nKeep both lines.', kind: 'idea' as const, status: 'unexplored' as const, createdAt: 1000 };
    state.ideas.push(original, { id: 'new-page', title: 'Questions about light', text: 'How do rainbows form?', kind: 'question', status: 'researching', createdAt: 2000, modifiedAt: 3000, pinned: true });
    const restored = parseBackup(makeBackup(state));
    expect(restored.ideas).toEqual(state.ideas);
    expect(restored.ideas[0]).not.toHaveProperty('title');
    expect(restored.ideas[0]).not.toHaveProperty('modifiedAt');
    expect(restored.ideas[0]).not.toHaveProperty('pinned');
    expect(parseBackup(JSON.stringify({ ...state, ideas: [original] })).ideas[0]).toEqual(original);
  });

  it('allows a notebook title without a body but rejects empty pages and invalid metadata', () => {
    const state = defaultState();
    state.ideas.push({ id: 'page', title: 'A place to begin', text: '', kind: 'idea', status: 'unexplored', createdAt: 1000 });
    expect(parseBackup(makeBackup(state)).ideas[0]?.text).toBe('');
    for (const change of [{ title: '' }, { title: 'x'.repeat(161) }, { modifiedAt: -1 }, { modifiedAt: 'today' }, { pinned: 'yes' }]) {
      expect(() => parseBackup(JSON.stringify({ ...state, ideas: [{ ...state.ideas[0], ...change }] }))).toThrow();
    }
  });

  it('roundtrips all supported data through a versioned backup', () => {
    const state = defaultState();
    state.activities.push({ ...activity('2026-09-12T09:00:00', '2026-09-12T09:30:00'), value: 4.2, unit: 'km', note: 'A good morning', outcome: 'Completed' });
    state.ideas.push({ id: uid(), text: 'Why?', kind: 'question', status: 'researching', createdAt: Date.now() });
    state.reviews.push({ date: '2026-09-12', mood: 4, win: 'Rest', lesson: '', tomorrow: 'Read' });
    state.sets.push({ id: uid(), exercise: 'Squat', reps: 10, weight: 20, createdAt: Date.now() });
    expect(parseBackup(makeBackup(state))).toEqual(state);
    expect(JSON.parse(makeBackup(state)).schemaVersion).toBe(1);
  });

  it.each(['{broken', 'null', '[]', '{}', '{"version":2}', '{"format":"other","schemaVersion":1}'])('rejects a malformed or incompatible file: %s', (text) => {
    expect(() => parseBackup(text)).toThrow();
  });

  it('rejects invalid dates, ranges, duplicates, booleans and reversed sessions', () => {
    const changes: Array<(state: any) => void> = [
      (state) => { state.settings.wake = '25:00'; },
      (state) => { state.settings.focusMinutes = -10; },
      (state) => { state.settings.notifications = 'true'; },
      (state) => { state.wakeLogs['2026-02-30'] = 0; },
      (state) => { state.routine.push(state.routine[0]); },
      (state) => { state.activities.push({ ...activity('2026-09-12T10:00:00', '2026-09-12T09:00:00') }); },
      (state) => { state.activities = 'not an array'; },
    ];
    for (const change of changes) { const state = defaultState(); change(state); expect(() => parseBackup(JSON.stringify(state))).toThrow(); }
  });

  it('discards unexpected properties instead of propagating them into state', () => {
    const state = JSON.parse(JSON.stringify(defaultState()));
    state.untrusted = 'ignored'; state.settings.extra = 'ignored';
    expect(parseBackup(JSON.stringify(state))).not.toHaveProperty('untrusted');
    expect(parseBackup(JSON.stringify(state)).settings).not.toHaveProperty('extra');
  });
});

describe('durable local storage', () => {
  it('reports IndexedDB errors without switching to an empty fallback database', async () => {
    const getItem = vi.fn(), setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem, setItem });
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { onerror: null as (() => void) | null, error: new Error('Database unavailable') };
      queueMicrotask(() => request.onerror?.());
      return request;
    } });
    await expect(loadState()).rejects.toThrow('Database unavailable');
    await expect(persistState(defaultState())).rejects.toThrow('Database unavailable');
    expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled();
  });

  it('falls back to local storage only when IndexedDB is unavailable', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
    expect((await loadState()).onboarded).toBe(false);
    const state = defaultState(); state.settings.name = 'Mira';
    await persistState(state);
    expect(await loadState()).toEqual(state);
    values.set('tend.state.v1', '{broken');
    await expect(loadState()).rejects.toThrow();
    expect(values.get('tend.state.v1')).toBe('{broken');
  });

  it('prefers native SQLite, serializes writes, and snapshots at call time', async () => {
    let raw: string | null = null;
    const savedNames: string[] = [];
    vi.stubGlobal('AndroidBridge', {
      loadState: () => raw,
      saveState: async (json: string) => { await new Promise((resolve) => setTimeout(resolve, 5)); raw = json; savedNames.push(JSON.parse(json).settings.name); return true; },
    });
    const state = defaultState(); state.settings.name = 'First';
    const first = persistState(state);
    state.settings.name = 'Second';
    const second = persistState(state);
    state.settings.name = 'Unsaved';
    await Promise.all([first, second]);
    expect(savedNames).toEqual(['First', 'Second']);
    expect((await loadState()).settings.name).toBe('Second');
  });

  it('surfaces write errors and allows the next successful save', async () => {
    const saveState = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('AndroidBridge', { loadState: () => null, saveState });
    await expect(persistState(defaultState())).rejects.toThrow('could not be saved');
    await expect(persistState(defaultState())).resolves.toBeUndefined();
  });

  it('does not erase existing records when a corrupt state is passed to save', async () => {
    const saveState = vi.fn();
    vi.stubGlobal('AndroidBridge', { loadState: () => null, saveState });
    const state = defaultState(); state.settings.focusMinutes = NaN;
    await expect(persistState(state)).rejects.toThrow();
    expect(saveState).not.toHaveBeenCalled();
  });
});

describe('time-gated logging and app protection settings', () => {
  it('correctly detects when the log entry window is open or locked', () => {
    const settings = { logDeadline: '20:30', earliestLogMinutesBefore: 60 }; // open at 19:30

    const morning = new Date('2026-09-14T10:00:00');
    const earlyCheck = isLogWindowOpen(settings, morning);
    expect(earlyCheck.open).toBe(false);
    expect(earlyCheck.deadlinePassed).toBe(false);
    expect(earlyCheck.minutesRemaining).toBe(9 * 60 + 30); // 10:00 to 19:30 = 570 min

    const justBefore = new Date('2026-09-14T19:29:00');
    expect(isLogWindowOpen(settings, justBefore).open).toBe(false);

    const atEarliest = new Date('2026-09-14T19:30:00');
    const windowOpen = isLogWindowOpen(settings, atEarliest);
    expect(windowOpen.open).toBe(true);
    expect(windowOpen.deadlinePassed).toBe(false);
    expect(windowOpen.minutesRemaining).toBe(0);

    const pastDeadline = new Date('2026-09-14T21:00:00');
    const late = isLogWindowOpen(settings, pastDeadline);
    expect(late.open).toBe(true);
    expect(late.deadlinePassed).toBe(true);
  });

  it('persists and validates extended protection settings', () => {
    const state = defaultState();
    state.settings.cooldownMinutes = 45;
    state.settings.logDeadline = '21:00';
    state.settings.earliestLogMinutesBefore = 30;
    state.settings.restrictedPackages = ['com.instagram.android', 'com.spotify.music', 'com.zhiliaoapp.musically'];
    state.settings.lockOnMissedLog = true;

    const roundtrip = parseBackup(makeBackup(state));
    expect(roundtrip.settings.cooldownMinutes).toBe(45);
    expect(roundtrip.settings.logDeadline).toBe('21:00');
    expect(roundtrip.settings.earliestLogMinutesBefore).toBe(30);
    expect(roundtrip.settings.restrictedPackages).toEqual(['com.instagram.android', 'com.spotify.music', 'com.zhiliaoapp.musically']);
    expect(roundtrip.settings.lockOnMissedLog).toBe(true);
  });

  it('persists and validates appLimits, defaultAppLimit, and parentalPin', () => {
    const state = defaultState();
    state.settings.appLimits = {
      'com.roblox.client': 45,
      'com.mojang.minecraftpe': 60,
    };
    state.settings.defaultAppLimit = 30;
    state.settings.parentalPin = '1234';

    const roundtrip = parseBackup(makeBackup(state));
    expect(roundtrip.settings.appLimits).toEqual({
      'com.roblox.client': 45,
      'com.mojang.minecraftpe': 60,
    });
    expect(roundtrip.settings.defaultAppLimit).toBe(30);
    expect(roundtrip.settings.parentalPin).toBe('1234');
  });
});

