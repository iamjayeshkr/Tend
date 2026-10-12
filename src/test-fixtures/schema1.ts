import type { AppState } from '../core';

const WAKE = 1_789_174_800_000;
const FOCUS_START = 1_789_182_000_000;
const FIRST_PAUSE_START = 1_789_182_600_000;
const FIRST_PAUSE_END = 1_789_182_900_000;
const SECOND_SEGMENT_START = 1_789_182_900_000;
const FOCUS_END = 1_789_183_800_000;
const EXERCISE_END = 1_789_184_700_000;
const TIMER_PAUSED_AT = 1_789_185_600_000;
const NOTE_MODIFIED = 1_789_187_400_000;
const SLEEP = 1_789_234_200_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function schema1CompleteState(): AppState {
  return {
    version: 1,
    onboarded: true,
    settings: {
      name: 'Mira Example',
      wake: '06:30',
      sleep: '23:00',
      focusMinutes: 25,
      breakMinutes: 5,
      instagramLimit: 20,
      youtubeLimit: 35,
      usageWarnings: true,
      notifications: true,
      theme: 'light',
      cooldownMinutes: 45,
      logDeadline: '20:30',
      earliestLogMinutesBefore: 60,
      restrictedPackages: ['com.instagram.android', 'com.google.android.youtube'],
      lockOnMissedLog: true,
      alarmSoundOnMissedLog: true,
      appLimits: { 'com.instagram.android': 20, 'com.google.android.youtube': 35 },
      defaultAppLimit: 30,
      parentalPin: '2468',
      wakeLockEnabled: true,
      wakeLockMinutes: 60,
      wakeLockMode: 'tasks',
      wakeLockResleepPolicy: 'resume',
    },
    routine: [
      { id: 'routine-morning', title: 'Learn before the day starts', start: '06:30', end: '09:00', category: 'study' },
      { id: 'routine-evening', title: 'Wind down', start: '21:00', end: '23:00', category: 'rest' },
    ],
    tasks: [
      { id: 'task-linked', title: 'Review binary search', done: false, date: '2026-09-12', category: 'study' },
      { id: 'task-finished', title: 'Send synthetic report', done: true, date: '2026-09-12', category: 'work' },
    ],
    activities: [
      {
        id: 'activity-focus',
        title: 'Review binary search',
        category: 'study',
        start: FOCUS_START,
        end: FOCUS_END,
        note: 'Synthetic focus fixture',
        outcome: 'Reviewed one worked example',
        createdAt: FOCUS_START,
        modifiedAt: FOCUS_END,
        source: 'timer',
        intervals: [
          { start: FOCUS_START, end: FIRST_PAUSE_START },
          { start: SECOND_SEGMENT_START, end: FOCUS_END },
        ],
        missionId: 'mission-fixture',
        timingApproximate: false,
      },
      {
        id: 'activity-walk',
        title: 'Morning walk',
        category: 'exercise',
        start: FOCUS_END,
        end: EXERCISE_END,
        value: 1.2,
        unit: 'km',
        note: 'Synthetic movement fixture',
        createdAt: FOCUS_END,
        modifiedAt: EXERCISE_END,
        source: 'manual',
      },
    ],
    ideas: [
      { id: 'idea-legacy', text: 'An untitled thought from an earlier release.', kind: 'idea', status: 'unexplored', createdAt: FOCUS_START },
      { id: 'idea-titled', title: 'A deterministic question', text: 'How should this fixture survive restore?', kind: 'question', status: 'researching', createdAt: FOCUS_END, modifiedAt: NOTE_MODIFIED, pinned: true },
    ],
    reviews: [
      { date: '2026-09-12', mood: 4, win: 'Kept the fixture deterministic', lesson: 'Compatibility needs literal evidence', tomorrow: 'Run the restore journey' },
    ],
    sets: [
      { id: 'set-squat', exercise: 'Squat', weight: 20, reps: 10, createdAt: EXERCISE_END },
    ],
    timer: null,
    wakeLogs: { '2026-09-12': WAKE },
    sleepLogs: { '2026-09-12': SLEEP },
  };
}

export function schema1LegacyState(): AppState {
  const state = schema1CompleteState();
  state.settings.cooldownMinutes = 30;
  state.settings.logDeadline = '20:30';
  state.settings.earliestLogMinutesBefore = 60;
  state.settings.restrictedPackages = ['com.instagram.android', 'com.google.android.youtube', 'com.spotify.music'];
  state.settings.lockOnMissedLog = true;
  state.settings.appLimits = {};
  state.settings.defaultAppLimit = 30;
  delete state.settings.parentalPin;
  state.settings.wakeLockEnabled = false;
  state.settings.wakeLockMinutes = 60;
  state.settings.wakeLockMode = 'timer';
  state.settings.wakeLockResleepPolicy = 'reset';
  state.ideas = [clone(state.ideas[0]!)];
  return state;
}

export function schema1ActiveTimerState(): AppState {
  const state = schema1CompleteState();
  state.timer = {
    id: 'timer-active',
    title: 'Review binary search',
    category: 'study',
    startedAt: FOCUS_START,
    durationMinutes: 25,
    pausedAt: null,
    pausedMs: FIRST_PAUSE_END - FIRST_PAUSE_START,
    pauses: [{ start: FIRST_PAUSE_START, end: FIRST_PAUSE_END }],
    missionId: 'mission-fixture',
    taskId: 'task-linked',
  };
  return state;
}

export function schema1PausedTimerState(): AppState {
  const state = schema1ActiveTimerState();
  state.timer = { ...state.timer!, id: 'timer-paused', pausedAt: TIMER_PAUSED_AT };
  return state;
}

export function schema1RawBackup(state: AppState = schema1CompleteState()): string {
  return JSON.stringify(clone(state));
}

export function schema1LegacyRawBackup(): string {
  const state = schema1LegacyState();
  const settings = state.settings as unknown as Record<string, unknown>;
  for (const key of [
    'cooldownMinutes',
    'logDeadline',
    'earliestLogMinutesBefore',
    'restrictedPackages',
    'lockOnMissedLog',
    'alarmSoundOnMissedLog',
    'appLimits',
    'defaultAppLimit',
    'parentalPin',
    'wakeLockEnabled',
    'wakeLockMinutes',
    'wakeLockMode',
    'wakeLockResleepPolicy',
  ]) delete settings[key];
  return JSON.stringify(state);
}

export function schema1WrappedBackup(state: AppState = schema1CompleteState()): string {
  return JSON.stringify({
    format: 'tend-backup',
    schemaVersion: 1,
    exportedAt: '2026-09-12T12:00:00.000Z',
    state: clone(state),
  });
}

const duplicateTask = schema1CompleteState();
duplicateTask.tasks.push(clone(duplicateTask.tasks[0]!));
const invalidActivityRange = schema1CompleteState();
invalidActivityRange.activities[0] = { ...invalidActivityRange.activities[0]!, start: FOCUS_END, end: FOCUS_START, intervals: undefined };

export const schema1InvalidBackups = Object.freeze({
  corruptJson: '{not-json',
  unsupportedFormat: JSON.stringify({ format: 'not-tend', schemaVersion: 1, state: schema1CompleteState() }),
  unsupportedVersion: JSON.stringify({ format: 'tend-backup', schemaVersion: 2, state: schema1CompleteState() }),
  duplicateTask: JSON.stringify(duplicateTask),
  invalidActivityRange: JSON.stringify(invalidActivityRange),
});
