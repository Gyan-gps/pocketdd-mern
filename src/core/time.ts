// Laravel app timezone is Asia/Kolkata: `now()` is written to the DB as IST wall-clock time,
// while Eloquent serializes date attributes as UTC ISO-8601 with microseconds.
export const APP_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const pad = (num: number, len = 2) => String(num).padStart(len, '0');

/** `now()` formatted for a DB write: `YYYY-MM-DD HH:mm:ss` in IST. */
export function nowDb(date = new Date()): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return (
    `${istDate.getUTCFullYear()}-${pad(istDate.getUTCMonth() + 1)}-${pad(istDate.getUTCDate())} ` +
    `${pad(istDate.getUTCHours())}:${pad(istDate.getUTCMinutes())}:${pad(istDate.getUTCSeconds())}`
  );
}

/** Eloquent JSON for a datetime/date column: IST DB string → `2025-01-01T05:30:00.000000Z`. */
export function toModelJson(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const utc = Date.UTC(+year!, +month! - 1, +day!, +hour, +minute, +second) - IST_OFFSET_MS;
  return new Date(utc).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
}

/** Apply `toModelJson` to the given keys of a row (Eloquent `datetime`/`date` casts + timestamps). */
export function serializeDates<T extends Record<string, unknown>>(
  row: T,
  keys: string[] = ['created_at', 'updated_at'],
): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of keys) if (key in out) out[key] = toModelJson(out[key] as string | null);
  return out as T;
}
