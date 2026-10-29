// Shared bits for the queued jobs.
import { env } from '../config/env.js';
import { col, insertRow, intId, TABLE_COLLECTION, toRow } from '../db/mongo.js';
import { phpJsonEncode } from '../services/firebase.js';

export { phpJsonEncode };

/**
 * Laravel `url($path)` inside a queue worker: there is no HTTP request, so the root is config('app.url')
 * (APP_URL). Valid URLs pass through unchanged.
 */
export function jobUrl(p: string): string {
  if (/^(#|\/\/|mailto:|tel:|sms:|https?:\/\/)/i.test(p)) return p;
  return `${env.appUrl.replace(/\/+$/, '')}/${p.replace(/^\/+|\/+$/g, '')}`;
}

/** Model::find($id): `select * from <table> where id = ? limit 1`. */
export async function find(table: string, id: unknown) {
  const n = intId(id);
  if (n === null) return null;
  return toRow(await col(TABLE_COLLECTION[table] ?? table).findOne({ _id: n as never }));
}

/** Users holding an FCM token (`whereNotNull('fcm_token')`), optionally without one id (`id != ?`). */
export async function usersWithToken(excludeId?: unknown) {
  const filter: Record<string, unknown> = { fcm_token: { $ne: null } };
  if (excludeId !== undefined) {
    const n = Number(excludeId);
    filter._id = { $ne: Number.isFinite(n) ? n : 0 };
  }
  return (await col('users').find(filter).sort({ _id: 1 }).toArray()).map((d) => toRow(d)!);
}

/** `$e->getLine()` / `$e->getFile()` equivalents from a JS stack. */
export function errorContext(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const frame = /\(?([^\s(]+):(\d+):\d+\)?/.exec(err.stack?.split('\n')[1] ?? '');
  return { error_message: err.message, line: frame ? Number(frame[2]) : 0, file: frame?.[1] ?? '' };
}

/** JSON text → native value; text that isn't valid JSON stays a string (same rule as the migration). */
export function decodeOnce(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * UserNotification::insert($rows) — no Eloquent casts/timestamps applied. `data` is the JSON text the PHP
 * stored; it is kept as a native value, and `is_read` takes the column default.
 */
export async function insertNotifications(
  rows: Array<{ user_id: unknown; title: string; message: string; data: string; created_at: string; updated_at: string }>,
) {
  for (const r of rows) {
    await insertRow('user_notifications', {
      user_id: r.user_id,
      title: r.title,
      message: r.message,
      data: decodeOnce(r.data),
      is_read: 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  }
}
