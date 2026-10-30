// Shared bits for the queued jobs.
import { env } from '../config/env.js';
import { insertRow, intId, toRow } from '../db/mongo.js';
import { modelFor, User, UserNotification } from '../models/index.js';
import { phpJsonEncode } from '../services/firebase.service.js';

export { phpJsonEncode };

/**
 * Laravel `url($path)` inside a queue worker: there is no HTTP request, so the root is config('app.url')
 * (APP_URL). Valid URLs pass through unchanged.
 */
export function jobUrl(path: string): string {
  if (/^(#|\/\/|mailto:|tel:|sms:|https?:\/\/)/i.test(path)) return path;
  return `${env.appUrl.replace(/\/+$/, '')}/${path.replace(/^\/+|\/+$/g, '')}`;
}

/** Model::find($id): `select * from <table> where id = ? limit 1`. */
export async function find(table: string, id: unknown) {
  const numericId = intId(id);
  if (numericId === null) return null;
  return toRow(await modelFor(table).findOne({ _id: numericId }).lean());
}

/** Users holding an FCM token (`whereNotNull('fcm_token')`), optionally without one id (`id != ?`). */
export async function usersWithToken(excludeId?: unknown) {
  const filter: Record<string, unknown> = { fcm_token: { $ne: null } };
  if (excludeId !== undefined) {
    const excludedId = Number(excludeId);
    filter._id = { $ne: Number.isFinite(excludedId) ? excludedId : 0 };
  }
  return (await User.find(filter).sort({ _id: 1 }).lean()).map((user) => toRow(user)!);
}

/** `$e->getLine()` / `$e->getFile()` equivalents from a JS stack. */
export function errorContext(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  const frame = /\(?([^\s(]+):(\d+):\d+\)?/.exec(err.stack?.split('\n')[1] ?? '');
  return { error_message: err.message, line: frame ? Number(frame[2]) : 0, file: frame?.[1] ?? '' };
}

/** JSON text → native value; text that isn't valid JSON stays a string (same rule as the migration). */
export function decodeOnce(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * UserNotification::insert($rows) — no Eloquent casts/timestamps applied. `data` is the JSON text the PHP
 * stored; it is kept as a native value, and `is_read` takes the column default.
 */
export async function insertNotifications(
  rows: Array<{ user_id: unknown; title: string; message: string; data: string; created_at: string; updated_at: string }>,
) {
  for (const row of rows) {
    await insertRow(UserNotification.collection.collectionName, {
      user_id: row.user_id,
      title: row.title,
      message: row.message,
      data: decodeOnce(row.data),
      is_read: 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
}
