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
  const pathString = String(path);
  if (/^(#|\/\/|https?:\/\/|mailto:|tel:)/i.test(pathString)) return pathString;
  return url(req, pathString.replace(/\/+$/, '')).replace(/\/+$/, '');
}

/** PHP truthiness. */
export function phpTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '' && value !== '0';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0; // decoded JSON arrays
  return true;
}

/** PHP `empty()`. */
export const phpEmpty = (value: unknown) => !phpTruthy(value);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (num: number) => String(num).padStart(2, '0');

/** `Carbon::parse($date)->format('d M, Y')` for a DATE / DATETIME column string. */
export function formatDateDMY(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]} ${MONTHS[Number(match[2]) - 1]}, ${match[1]}`;
}

/** `Carbon::parse($time)->format('h:i A')` for a TIME column string. */
export function formatTimeHiA(value: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hours12)}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
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
  const translation = (decoded as Record<string, unknown>)[locale];
  if (translation === null || translation === undefined || translation === '') return '';
  return typeof translation === 'object' ? JSON.stringify(translation) : translation;
}
