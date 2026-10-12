export function fail(path: string): never { throw new Error(`Invalid protocol data (${path}). Your existing journal is unchanged.`); }
export function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
  return value as Record<string, unknown>;
}
export function str(value: unknown, path: string, max = 2000, nonempty = true): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) fail(path);
  return value;
}
export function num(value: unknown, path: string, min = 0, max = 8_640_000_000_000_000, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(path);
  return value;
}
export function bool(value: unknown, path: string): boolean { if (typeof value !== 'boolean') fail(path); return value; }
export function one<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) fail(path);
  return value as T;
}
export function arr<T>(value: unknown, path: string, read: (item: unknown, path: string) => T, max = 100_000): T[] {
  if (!Array.isArray(value) || value.length > max) fail(path);
  const result = value.map((item, index) => read(item, `${path}[${index}]`));
  const ids = result.filter((item): item is T & { id: string } => Boolean(item && typeof item === 'object' && 'id' in item)).map(item => item.id);
  if (new Set(ids).size !== ids.length) fail(`${path} duplicate identifiers`);
  return result;
}
export function strings(value: unknown, path: string, max = 1000): string[] {
  const result = arr(value, path, (item, p) => str(item, p, 200), max);
  if (new Set(result).size !== result.length) fail(`${path} duplicates`);
  return result;
}
export function date(value: unknown, path: string): string {
  const result = str(value, path, 10), parsed = new Date(`${result}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || localDate(parsed.getTime()) !== result) fail(path);
  return result;
}
export function time(value: unknown, path: string): string {
  const result = str(value, path, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) fail(path);
  return result;
}
export function localDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}
export function identifier(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
}
export function optional<T>(value: unknown, parse: (value: unknown) => T): T | undefined { return value === undefined ? undefined : parse(value); }
