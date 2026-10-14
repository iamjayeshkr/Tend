/** Tend's offline data contract and calendar-aware day engine. */
import { LocalRepository } from './data/localRepository'
export type Category = 'study' | 'work' | 'project' | 'exercise' | 'rest' | 'life';
export interface RoutineBlock { id: string; title: string; start: string; end: string; category: Category }
export interface Task { id: string; title: string; done: boolean; date: string; category: Category }
export interface TimeInterval { start: number; end: number }
export interface Activity {
  id: string; title: string; category: Category; start: number; end: number;
  value?: number; unit?: string; note?: string; outcome?: string;
  createdAt: number; modifiedAt: number; source: 'manual' | 'timer' | 'automatic';
  intervals?: TimeInterval[]; missionId?: string; timingApproximate?: boolean;
}
export interface Idea {
  id: string; text: string; kind: 'idea' | 'question'; status: 'unexplored' | 'researching' | 'answered'; createdAt: number;
  /** Optional so notebooks captured in earlier releases keep their original content. */
  title?: string; modifiedAt?: number; pinned?: boolean;
}
export interface Review { date: string; mood: number; win: string; lesson: string; tomorrow: string }
export interface WorkoutSet { id: string; exercise: string; weight: number; reps: number; createdAt: number }
export interface ActiveTimer {
  id: string; title: string; category: Category; startedAt: number; durationMinutes: number; pausedAt: number | null; pausedMs: number;
  /** Completed pauses only; pausedAt separately records an open pause. */
  pauses?: TimeInterval[]; missionId?: string; taskId?: string;
}
export interface Settings {
  name: string; wake: string; sleep: string; focusMinutes: number; breakMinutes: number;
  instagramLimit: number; youtubeLimit: number; usageWarnings: boolean; notifications: boolean; theme: 'light' | 'dark';
  cooldownMinutes: number; logDeadline: string; earliestLogMinutesBefore: number;
  restrictedPackages: string[]; lockOnMissedLog: boolean; alarmSoundOnMissedLog?: boolean;
  appLimits?: Record<string, number>; defaultAppLimit?: number; parentalPin?: string;
  wakeLockEnabled?: boolean; wakeLockMinutes?: number; wakeLockMode?: 'timer' | 'tasks' | 'log';
  wakeLockResleepPolicy?: 'reset' | 'resume';
}
export interface AppState {
  version: 1; onboarded: boolean; settings: Settings; routine: RoutineBlock[]; tasks: Task[];
  activities: Activity[]; ideas: Idea[]; reviews: Review[]; sets: WorkoutSet[]; timer: ActiveTimer | null;
  wakeLogs: Record<string, number>; sleepLogs: Record<string, number>;
}

const MINUTE = 60_000;
const CATEGORIES: readonly Category[] = ['study', 'work', 'project', 'exercise', 'rest', 'life'];

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older Android WebViews may expose getRandomValues without randomUUID.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function defaultState(): AppState {
  const block = (title: string, start: string, end: string, category: Category): RoutineBlock => ({ id: uid(), title, start, end, category });
  return {
    version: 1, onboarded: false,
    settings: {
      name: '', wake: '06:30', sleep: '23:00', focusMinutes: 25, breakMinutes: 5,
      instagramLimit: 30, youtubeLimit: 30, usageWarnings: false, notifications: false, theme: 'light',
      cooldownMinutes: 30, logDeadline: '20:30', earliestLogMinutesBefore: 60,
      restrictedPackages: ['com.instagram.android', 'com.google.android.youtube', 'com.spotify.music'],
      lockOnMissedLog: true,
      alarmSoundOnMissedLog: true,
      appLimits: {},
      defaultAppLimit: 30,
      wakeLockEnabled: false,
      wakeLockMinutes: 60,
      wakeLockMode: 'timer',
      wakeLockResleepPolicy: 'reset',
    },
    routine: [
      block('A gentle beginning', '06:30', '08:30', 'life'),
      block('Classes & deep work', '09:00', '13:00', 'work'),
      block('Lunch & a little pause', '13:00', '14:00', 'rest'),
      block('Make something happen', '14:00', '17:00', 'project'),
      block('Move your body', '17:00', '18:00', 'exercise'),
      block('Time to learn', '19:00', '21:00', 'study'),
      block('Slow down', '21:00', '23:00', 'rest'),
    ],
    tasks: [], activities: [], ideas: [], reviews: [], sets: [], timer: null, wakeLogs: {}, sleepLogs: {},
  };
}

/** Uses the device's local calendar, including when a timestamp crosses UTC midnight. */
export function dateKey(date: Date | number = new Date()): string {
  const value = typeof date === 'number' ? new Date(date) : date;
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid calendar date.');
  return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function isLogWindowOpen(
  settings: Pick<Settings, 'logDeadline' | 'earliestLogMinutesBefore'>,
  now = new Date()
): { open: boolean; opensAtFormatted: string; minutesRemaining: number; deadlinePassed: boolean } {
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const deadlineMinute = minutesOfDay(settings.logDeadline);
  const earliestMinute = Math.max(0, deadlineMinute - settings.earliestLogMinutesBefore);

  const opensAtDate = new Date(now);
  opensAtDate.setHours(Math.floor(earliestMinute / 60), earliestMinute % 60, 0, 0);
  const opensAtFormatted = opensAtDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const open = currentMinute >= earliestMinute;
  const minutesRemaining = Math.max(0, earliestMinute - currentMinute);
  const deadlinePassed = currentMinute >= deadlineMinute;

  return { open, opensAtFormatted, minutesRemaining, deadlinePassed };
}

export function currentBlock(routine: RoutineBlock[], now = new Date()): RoutineBlock | undefined {
  const minute = now.getHours() * 60 + now.getMinutes();
  return routine.find((block) => {
    const start = minutesOfDay(block.start), end = minutesOfDay(block.end);
    return start < end ? minute >= start && minute < end : start > end && (minute >= start || minute < end);
  });
}

/** Elapsed active milliseconds; pausing freezes the clock across app restarts. */
export function timerElapsed(timer: ActiveTimer, now = Date.now()): number {
  return Math.max(0, Math.min(now, timer.pausedAt ?? now) - timer.startedAt - timer.pausedMs);
}

/** Old timers know how much time was paused, but not where those pauses fell. */
export function timerTimingApproximate(timer: ActiveTimer): boolean {
  return timer.pausedMs > (timer.pauses ?? []).reduce((sum, pause) => sum + pause.end - pause.start, 0) + 1;
}

/**
 * Reconstruct actual work segments rather than moving paused time into the work
 * record. For older aggregate-only pauses, an end-aligned approximation preserves
 * duration; callers retain timingApproximate so this is never represented as exact.
 */
export function timerSegments(timer: ActiveTimer, end = Date.now(), durationMinutes?: number): TimeInterval[] {
  const cutoff = Math.max(timer.startedAt, Math.min(end, timer.pausedAt ?? end));
  const pauses = union((timer.pauses ?? []).map(pause => [Math.max(timer.startedAt, pause.start), Math.min(cutoff, pause.end)]));
  const segments: TimeInterval[] = [];
  let cursor = timer.startedAt;
  for (const [start, stop] of pauses) {
    if (start > cursor) segments.push({ start: cursor, end: start });
    cursor = Math.max(cursor, stop);
  }
  if (cursor < cutoff) segments.push({ start: cursor, end: cutoff });
  const knownPauseMs = pauses.reduce((sum, [start, stop]) => sum + stop - start, 0);
  let missingPauseMs = Math.max(0, timer.pausedMs - knownPauseMs);
  const afterLegacyAdjustment: TimeInterval[] = [];
  for (const segment of segments) {
    const removed = Math.min(missingPauseMs, segment.end - segment.start);
    missingPauseMs -= removed;
    if (segment.start + removed < segment.end) afterLegacyAdjustment.push({ start: segment.start + removed, end: segment.end });
  }
  let remaining = durationMinutes === undefined ? Infinity : Math.max(0, durationMinutes * MINUTE);
  return afterLegacyAdjustment.flatMap(segment => {
    const duration = Math.min(remaining, segment.end - segment.start);
    remaining -= duration;
    return duration > 0 ? [{ start: segment.start, end: segment.start + duration }] : [];
  });
}

type Interval = [number, number];
function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function intervalMinutes(intervals: Interval[]): number {
  return union(intervals).reduce((total, [start, end]) => total + (end - start) / MINUTE, 0);
}

function activityIntervals(activity: Activity): Interval[] {
  return (activity.intervals ?? [{ start: activity.start, end: activity.end }]).map(interval => [interval.start, interval.end]);
}

/** Actual logged duration; wall-clock start/end may include deliberate pauses. */
export function activityMinutes(activity: Activity): number { return intervalMinutes(activityIntervals(activity)); }

export function categoryDayMinutes(state: AppState, category: Category, date = dateKey(), now = Date.now()): number {
  const start = localMidnight(date), next = new Date(start);
  next.setDate(next.getDate() + 1);
  return intervalMinutes(state.activities.filter(activity => activity.category === category).flatMap(activity =>
    activityIntervals(activity).map(([from, to]): Interval => [Math.max(start.getTime(), from), Math.min(next.getTime(), now, to)]),
  ));
}

function localMidnight(key: string): Date {
  const date = new Date(`${key}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(date.getTime()) || dateKey(date) !== key) throw new Error('Invalid calendar date.');
  return date;
}

function atTime(date: Date, time: string): number {
  const result = new Date(date);
  const minute = minutesOfDay(time);
  result.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return result.getTime();
}

export interface DayStats {
  focusMinutes: number; exerciseMinutes: number; intentionalMinutes: number; unknownMinutes: number;
  taskTotal: number; taskDone: number;
}

/**
 * Completed logs are the source of truth. An unconfirmed running timer contributes
 * no history. Every duration is clipped to this local day and the current time;
 * overlapping logs never inflate a category or total. Unknown time measures gaps
 * inside the wake/sleep window, using the configured routine until actual logs exist.
 */
export function dayStats(state: AppState, date = dateKey(), now = Date.now()): DayStats {
  const midnight = localMidnight(date);
  const next = new Date(midnight);
  next.setDate(next.getDate() + 1);
  const dayStart = midnight.getTime(), dayEnd = Math.max(dayStart, Math.min(next.getTime(), now));
  const clip = (start: number, end: number): Interval => [Math.max(dayStart, start), Math.min(dayEnd, end)];
  const activities = state.activities.flatMap((activity) => activityIntervals(activity).map(([start, end]) => ({ category: activity.category, interval: clip(start, end) })));
  const intervals = activities.map((activity) => activity.interval);
  const wake = state.wakeLogs[date] ?? atTime(midnight, state.settings.wake);
  const sleep = state.sleepLogs[date] ?? atTime(midnight, state.settings.sleep);
  const awakeIntervals: Interval[] = sleep >= wake ? [clip(wake, sleep)] : [clip(dayStart, sleep), clip(wake, next.getTime())];
  const awake = union(awakeIntervals);
  const awakeCovered: Interval[] = [];
  for (const [start, end] of intervals) for (const [wakeStart, wakeEnd] of awake) {
    awakeCovered.push([Math.max(start, wakeStart), Math.min(end, wakeEnd)]);
  }
  const tasks = state.tasks.filter((task) => task.date === date);
  return {
    focusMinutes: intervalMinutes(activities.filter((activity) => ['study', 'work', 'project'].includes(activity.category)).map((activity) => activity.interval)),
    exerciseMinutes: intervalMinutes(activities.filter((activity) => activity.category === 'exercise').map((activity) => activity.interval)),
    intentionalMinutes: intervalMinutes(intervals),
    unknownMinutes: Math.max(0, intervalMinutes(awake) - intervalMinutes(awakeCovered)),
    taskTotal: tasks.length, taskDone: tasks.filter((task) => task.done).length,
  };
}

export function weekStats(state: AppState, now = new Date()): Array<{ date: string; label: string; focusMinutes: number; exerciseMinutes: number; intentionalMinutes: number }> {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - 6 + index);
    const date = dateKey(day);
    const { focusMinutes, exerciseMinutes, intentionalMinutes } = dayStats(state, date, now.getTime());
    return { date, label: day.toLocaleDateString('en-US', { weekday: 'short' }), focusMinutes, exerciseMinutes, intentionalMinutes };
  });
}

export function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(minutes / 60), remaining = minutes % 60;
  return hours > 0 ? `${hours}h${remaining ? ` ${remaining}m` : ''}` : `${remaining}m`;
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Validation builds fresh objects, so imported extra keys and prototype properties
// can never reach live application state. Invalid files never replace saved data.
function invalid(path: string): never { throw new Error(`This backup contains invalid data (${path}). Your current data has not changed.`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string, max = 10_000, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(path);
  return value;
}
function number(value: unknown, path: string, min = 0, max = 8_640_000_000_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path);
  return value;
}
function boolean(value: unknown, path: string): boolean { if (typeof value !== 'boolean') invalid(path); return value; }
function choice<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(path);
  return value as T;
}
function time(value: unknown, path: string): string {
  const result = string(value, path, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) invalid(path);
  return result;
}
function calendar(value: unknown, path: string): string {
  const result = string(value, path, 10);
  try { localMidnight(result); } catch { invalid(path); }
  return result;
}
function stringList(value: unknown, path: string, maxItemLength = 200, maxItems = 1000): string[] {
  if (!Array.isArray(value) || value.length > maxItems) invalid(path);
  return value.map((item, index) => string(item, `${path}[${index}]`, maxItemLength, false));
}
function array<T>(value: unknown, path: string, read: (value: Record<string, unknown>, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid(path);
  const ids = new Set<string>();
  return value.map((item, index) => {
    const rowPath = `${path}[${index}]`;
    const result = read(object(item, rowPath), rowPath);
    if (result && typeof result === 'object' && 'id' in result) {
      const id = (result as { id: string }).id;
      if (ids.has(id)) invalid(`${rowPath}.id is duplicated`);
      ids.add(id);
    }
    return result;
  });
}
function id(value: unknown, path: string): string { return string(value, `${path}.id`, 100, false); }
function category(value: unknown, path: string): Category { return choice(value, CATEGORIES, `${path}.category`); }
function optionalString(value: unknown, path: string): string | undefined { return value === undefined ? undefined : string(value, path); }
function readIntervals(value: unknown, path: string, earliest: number, latest = 8_640_000_000_000_000): TimeInterval[] {
  if (!Array.isArray(value) || value.length > 10_000) invalid(path);
  let previousEnd = earliest;
  return value.map((item, index) => {
    const row = object(item, `${path}[${index}]`);
    const start = number(row.start, `${path}[${index}].start`, earliest, latest);
    const end = number(row.end, `${path}[${index}].end`, start, latest);
    if (start < previousEnd) invalid(`${path} intervals overlap or are out of order`);
    previousEnd = end;
    return { start, end };
  });
}
function dateLogs(value: unknown, path: string): Record<string, number> {
  const input = object(value, path), result: Record<string, number> = {};
  if (Object.keys(input).length > 100_000) invalid(path);
  for (const [key, timestamp] of Object.entries(input)) result[calendar(key, path)] = number(timestamp, `${path}.${key}`);
  return result;
}

function validateState(value: unknown): AppState {
  const data = object(value, 'state');
  if (data.version !== 1) throw new Error('This backup version is not supported. Your current data has not changed.');
  const settings = object(data.settings, 'settings');
  let timer: ActiveTimer | null = null;
  if (data.timer !== null) {
    const input = object(data.timer, 'timer');
    timer = {
      id: id(input.id, 'timer'), title: string(input.title, 'timer.title', 500, false), category: category(input.category, 'timer'),
      startedAt: number(input.startedAt, 'timer.startedAt'), durationMinutes: number(input.durationMinutes, 'timer.durationMinutes', 1, 1440),
      pausedAt: input.pausedAt === null ? null : number(input.pausedAt, 'timer.pausedAt'), pausedMs: number(input.pausedMs, 'timer.pausedMs'),
      ...(input.pauses === undefined ? {} : { pauses: readIntervals(input.pauses, 'timer.pauses', number(input.startedAt, 'timer.startedAt'), input.pausedAt === null ? undefined : number(input.pausedAt, 'timer.pausedAt')) }),
      ...(input.missionId === undefined ? {} : { missionId: id(input.missionId, 'timer.mission') }),
      ...(input.taskId === undefined ? {} : { taskId: id(input.taskId, 'timer.task') }),
    };
    if (timer.pausedAt !== null && (timer.pausedAt < timer.startedAt || timer.pausedMs > timer.pausedAt - timer.startedAt)) invalid('timer pause duration');
    if ((timer.pauses ?? []).reduce((sum, pause) => sum + pause.end - pause.start, 0) > timer.pausedMs + 1) invalid('timer recorded pauses exceed total pause duration');
  }
  const reviews = array(data.reviews, 'reviews', (row, path): Review => ({ date: calendar(row.date, `${path}.date`), mood: number(row.mood, `${path}.mood`, 1, 5), win: string(row.win, `${path}.win`), lesson: string(row.lesson, `${path}.lesson`), tomorrow: string(row.tomorrow, `${path}.tomorrow`) }));
  if (new Set(reviews.map((review) => review.date)).size !== reviews.length) invalid('duplicate daily review');
  return {
    version: 1, onboarded: boolean(data.onboarded, 'onboarded'),
    settings: {
      name: string(settings.name, 'settings.name', 100), wake: time(settings.wake, 'settings.wake'), sleep: time(settings.sleep, 'settings.sleep'),
      focusMinutes: number(settings.focusMinutes, 'settings.focusMinutes', 1, 1440), breakMinutes: number(settings.breakMinutes, 'settings.breakMinutes', 1, 1440),
      instagramLimit: number(settings.instagramLimit, 'settings.instagramLimit', 0, 1440), youtubeLimit: number(settings.youtubeLimit, 'settings.youtubeLimit', 0, 1440),
      usageWarnings: boolean(settings.usageWarnings, 'settings.usageWarnings'), notifications: boolean(settings.notifications, 'settings.notifications'), theme: choice(settings.theme, ['light', 'dark'], 'settings.theme'),
      cooldownMinutes: settings.cooldownMinutes !== undefined ? number(settings.cooldownMinutes, 'settings.cooldownMinutes', 0, 1440) : 30,
      logDeadline: settings.logDeadline !== undefined ? time(settings.logDeadline, 'settings.logDeadline') : '20:30',
      earliestLogMinutesBefore: settings.earliestLogMinutesBefore !== undefined ? number(settings.earliestLogMinutesBefore, 'settings.earliestLogMinutesBefore', 0, 360) : 60,
      restrictedPackages: settings.restrictedPackages !== undefined
        ? stringList(settings.restrictedPackages, 'settings.restrictedPackages', 200)
        : ['com.instagram.android', 'com.google.android.youtube', 'com.spotify.music'],
      lockOnMissedLog: settings.lockOnMissedLog !== undefined ? boolean(settings.lockOnMissedLog, 'settings.lockOnMissedLog') : true,
      alarmSoundOnMissedLog: settings.alarmSoundOnMissedLog !== undefined ? boolean(settings.alarmSoundOnMissedLog, 'settings.alarmSoundOnMissedLog') : true,
      appLimits: settings.appLimits !== undefined && typeof settings.appLimits === 'object' && settings.appLimits !== null
        ? Object.fromEntries(
            Object.entries(settings.appLimits as Record<string, unknown>)
              .filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1440)
              .map(([k, v]) => [k, Math.round(v as number)])
          )
        : {},
      defaultAppLimit: settings.defaultAppLimit !== undefined ? number(settings.defaultAppLimit, 'settings.defaultAppLimit', 1, 1440) : 30,
      parentalPin: settings.parentalPin !== undefined ? optionalString(settings.parentalPin, 'settings.parentalPin') : undefined,
      wakeLockEnabled: settings.wakeLockEnabled !== undefined ? boolean(settings.wakeLockEnabled, 'settings.wakeLockEnabled') : false,
      wakeLockMinutes: settings.wakeLockMinutes !== undefined ? number(settings.wakeLockMinutes, 'settings.wakeLockMinutes', 5, 240) : 60,
      wakeLockMode: settings.wakeLockMode !== undefined ? choice(settings.wakeLockMode, ['timer', 'tasks', 'log'] as const, 'settings.wakeLockMode') : 'timer',
      wakeLockResleepPolicy: settings.wakeLockResleepPolicy !== undefined ? choice(settings.wakeLockResleepPolicy, ['reset', 'resume'] as const, 'settings.wakeLockResleepPolicy') : 'reset',
    },
    routine: array(data.routine, 'routine', (row, path): RoutineBlock => ({ id: id(row.id, path), title: string(row.title, `${path}.title`, 500, false), start: time(row.start, `${path}.start`), end: time(row.end, `${path}.end`), category: category(row.category, path) })),
    tasks: array(data.tasks, 'tasks', (row, path): Task => ({ id: id(row.id, path), title: string(row.title, `${path}.title`, 1000, false), done: boolean(row.done, `${path}.done`), date: calendar(row.date, `${path}.date`), category: category(row.category, path) })),
    activities: array(data.activities, 'activities', (row, path): Activity => {
      const start = number(row.start, `${path}.start`), end = number(row.end, `${path}.end`);
      if (end < start) invalid(`${path}.end is before start`);
      return {
        id: id(row.id, path), title: string(row.title, `${path}.title`, 1000, false), category: category(row.category, path), start, end,
        ...(row.value === undefined ? {} : { value: number(row.value, `${path}.value`, 0, 1_000_000_000) }),
        ...(row.unit === undefined ? {} : { unit: optionalString(row.unit, `${path}.unit`) }),
        ...(row.note === undefined ? {} : { note: optionalString(row.note, `${path}.note`) }),
        ...(row.outcome === undefined ? {} : { outcome: optionalString(row.outcome, `${path}.outcome`) }),
        ...(row.intervals === undefined ? {} : { intervals: readIntervals(row.intervals, `${path}.intervals`, start, end) }),
        ...(row.missionId === undefined ? {} : { missionId: id(row.missionId, `${path}.mission`) }),
        ...(row.timingApproximate === undefined ? {} : { timingApproximate: boolean(row.timingApproximate, `${path}.timingApproximate`) }),
        createdAt: number(row.createdAt, `${path}.createdAt`), modifiedAt: number(row.modifiedAt, `${path}.modifiedAt`), source: choice(row.source, ['manual', 'timer', 'automatic'], `${path}.source`),
      };
    }),
    ideas: array(data.ideas, 'ideas', (row, path): Idea => {
      const title = row.title === undefined ? undefined : string(row.title, `${path}.title`, 160);
      const text = string(row.text, `${path}.text`, 20_000);
      if (!text.trim() && !title?.trim()) invalid(`${path}.text`);
      return {
        id: id(row.id, path), text, kind: choice(row.kind, ['idea', 'question'], `${path}.kind`),
        status: choice(row.status, ['unexplored', 'researching', 'answered'], `${path}.status`), createdAt: number(row.createdAt, `${path}.createdAt`),
        ...(title === undefined ? {} : { title }),
        ...(row.modifiedAt === undefined ? {} : { modifiedAt: number(row.modifiedAt, `${path}.modifiedAt`) }),
        ...(row.pinned === undefined ? {} : { pinned: boolean(row.pinned, `${path}.pinned`) }),
      };
    }),
    sets: array(data.sets, 'sets', (row, path): WorkoutSet => ({ id: id(row.id, path), exercise: string(row.exercise, `${path}.exercise`, 500, false), weight: number(row.weight, `${path}.weight`, 0, 10_000), reps: number(row.reps, `${path}.reps`, 1, 100_000), createdAt: number(row.createdAt, `${path}.createdAt`) })),
    reviews, timer, wakeLogs: dateLogs(data.wakeLogs, 'wakeLogs'), sleepLogs: dateLogs(data.sleepLogs, 'sleepLogs'),
  };
}

function parseJson(text: string): unknown {
  if (typeof text !== 'string' || text.length > 32_000_000) throw new Error('This backup is empty or too large. Your current data has not changed.');
  try { return JSON.parse(text); } catch { throw new Error('This file is not a readable Tend backup. Your current data has not changed.'); }
}

export function parseBackup(text: string): AppState {
  const parsed = object(parseJson(text), 'backup');
  if (parsed.format !== undefined) {
    if (parsed.format !== 'tend-backup' || parsed.schemaVersion !== 1) throw new Error('This backup format or version is not supported. Your current data has not changed.');
    return validateState(parsed.state);
  }
  return validateState(parsed);
}

export function makeBackup(state: AppState): string {
  return JSON.stringify({ format: 'tend-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), state: validateState(state) }, null, 2);
}

interface NativeStorageBridge {
  loadState(): string | null | Promise<string | null>;
  saveState(json: string): void | boolean | string | Promise<void | boolean | string>;
}
function nativeStorage(): NativeStorageBridge | undefined {
  const scope = globalThis as unknown as { AndroidBridge?: Partial<NativeStorageBridge>; window?: { AndroidBridge?: Partial<NativeStorageBridge> } };
  const bridge = scope.AndroidBridge ?? scope.window?.AndroidBridge;
  return bridge && typeof bridge.loadState === 'function' && typeof bridge.saveState === 'function' ? bridge as NativeStorageBridge : undefined;
}

let writes: Promise<void> = Promise.resolve();

export async function loadState(): Promise<AppState> {
  await writes.catch(() => undefined);
  const bridge = nativeStorage();
  let raw: unknown;
  if (bridge) raw = await bridge.loadState();
  else {
    const repository = await LocalRepository.open();
    try { raw = await repository.loadWorkspace('guest'); }
    finally { repository.close(); }
  }
  if (raw === undefined || raw === null || raw === '') return defaultState();
  return typeof raw === 'string' ? parseBackup(raw) : validateState(raw);
}

/** Resolves only after the local transaction commits. Snapshots keep call order. */
export function persistState(state: AppState): Promise<void> {
  let snapshot: string;
  try { snapshot = JSON.stringify(validateState(state)); } catch (error) { return Promise.reject(error); }
  const write = writes.catch(() => undefined).then(async () => {
    const bridge = nativeStorage();
    if (bridge) {
      const result = await bridge.saveState(snapshot);
      if (result === false || (typeof result === 'string' && /^error\b/i.test(result))) throw new Error('Your changes could not be saved on this device.');
      return;
    }
    const repository = await LocalRepository.open();
    try {
      const previous = await repository.loadWorkspace('guest');
      await repository.commit('guest', previous, JSON.parse(snapshot) as AppState, []);
    } finally { repository.close(); }
  });
  writes = write;
  return write;
}
