// Shared bits for the queued jobs.
import { env } from '../config/env.js';
import { exec, first } from '../db/pool.js';
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
export const find = (table: string, id: unknown) => first(`SELECT * FROM \`${table}\` WHERE \`id\` = ? LIMIT 1`, [id]);

/** `$e->getLine()` / `$e->getFile()` equivalents from a JS stack. */
export function errorContext(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const frame = /\(?([^\s(]+):(\d+):\d+\)?/.exec(err.stack?.split('\n')[1] ?? '');
  return { error_message: err.message, line: frame ? Number(frame[2]) : 0, file: frame?.[1] ?? '' };
}

/** UserNotification::insert($rows) — one multi-row INSERT, no Eloquent casts/timestamps applied. */
export async function insertNotifications(
  rows: Array<{ user_id: unknown; title: string; message: string; data: string; created_at: string; updated_at: string }>,
) {
  if (!rows.length) return;
  await exec(
    'INSERT INTO `user_notifications` (`user_id`, `title`, `message`, `data`, `created_at`, `updated_at`) VALUES ?',
    [rows.map((r) => [r.user_id, r.title, r.message, r.data, r.created_at, r.updated_at])],
  );
}
