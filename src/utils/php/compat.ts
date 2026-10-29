// Small Laravel/PHP behaviour helpers used by the events / administration / notifications modules (events, administration, notifications).
import type { Request } from 'express';
import { nowDb } from '../../core/time.js';
import { url } from '../../core/url.js';

/**
 * Laravel `url($path)` for a DB value.
 * Laravel quirk: `url(null)` returns the UrlGenerator instance, which json_encodes to `{}`.
 * `url('')` is the bare root (no trailing slash).
 */
export function laravelUrl(req: Request, path: unknown): string | Record<string, never> {
  if (path === null || path === undefined) return {};
  const s = String(path);
  if (/^(#|\/\/|https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  return url(req, s.replace(/\/+$/, '')).replace(/\/+$/, '');
}

/** PHP truthiness. */
export function phpTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '' && v !== '0';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0; // decoded JSON arrays
  return true;
}

/** PHP `empty()`. */
export const phpEmpty = (v: unknown) => !phpTruthy(v);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** `Carbon::parse($date)->format('d M, Y')` for a DATE / DATETIME column string. */
export function formatDateDMY(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]}, ${m[1]}`;
}

/** `Carbon::parse($time)->format('h:i A')` for a TIME column string. */
export function formatTimeHiA(value: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** `Carbon::parse($date)->isToday()` in the app timezone (Asia/Kolkata). */
export function isTodayIst(value: string): boolean {
  return value.slice(0, 10) === nowDb().slice(0, 10);
}

/** Laravel `$request->bearerToken()`. */
export function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const pos = header.toLowerCase().lastIndexOf('bearer ');
  if (pos === -1) return null;
  const rest = header.slice(pos + 7);
  return rest.includes(',') ? rest.slice(0, rest.indexOf(',')) : rest;
}

/**
 * Backpack/Spatie HasTranslations attribute read (`$model->attr` for a `$translatable` column) in the
 * default locale 'en' (fallback 'en'): JSON object → its 'en' entry (null/'' entries ignored), anything
 * else → ''. Array translations are json_encoded by Backpack.
 */
export function translatedAttr(raw: unknown, locale = 'en'): unknown {
  let decoded: unknown = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    try {
      decoded = JSON.parse(String(raw));
    } catch {
      decoded = null;
    }
  }
  if (!decoded || typeof decoded !== 'object') return '';
  const t = (decoded as Record<string, unknown>)[locale];
  if (t === null || t === undefined || t === '') return '';
  return typeof t === 'object' ? JSON.stringify(t) : t;
}
