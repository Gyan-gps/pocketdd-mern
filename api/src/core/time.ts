// Laravel app timezone is Asia/Kolkata: `now()` is written to the DB as IST wall-clock time,
// while Eloquent serializes date attributes as UTC ISO-8601 with microseconds.
export const APP_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** `now()` formatted for a DB write: `YYYY-MM-DD HH:mm:ss` in IST. */
export function nowDb(date = new Date()): string {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** Eloquent JSON for a datetime/date column: IST DB string → `2025-01-01T05:30:00.000000Z`. */
export function toModelJson(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return value;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const utc = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s) - IST_OFFSET_MS;
  return new Date(utc).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
}

/** Apply `toModelJson` to the given keys of a row (Eloquent `datetime`/`date` casts + timestamps). */
export function serializeDates<T extends Record<string, unknown>>(
  row: T,
  keys: string[] = ['created_at', 'updated_at'],
): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) if (k in out) out[k] = toModelJson(out[k] as string | null);
  return out as T;
}
