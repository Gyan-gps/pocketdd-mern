// PHP value semantics (string conversion, trim, json_decode, filter_var, Str::slug) and Laravel UploadedFile
// behaviour, shared by the ported controllers.
import crypto from 'node:crypto';
import { PhpError } from '../../core/http/response.js';

/** PHP trim(); default character set " \t\n\r\0\x0B". */
export function phpTrim(s: string, chars = ' \t\n\r\0\x0B'): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a]!)) a++;
  while (b > a && chars.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
}

export interface UploadedFileLike {
  fieldname?: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export const isUploadedFile = (v: unknown): v is UploadedFileLike =>
  !!v && typeof v === 'object' && 'originalname' in v && 'size' in v;

const TMP_PATHS = new WeakMap<object, string>();
/** PDO binding of a PHP value (UploadedFile binds as its tmp path via __toString()). */
export function bind(value: unknown): unknown {
  if (value === undefined) return null;
  if (isUploadedFile(value)) return uploadedTmpPath(value);
  return value;
}

/** `(string) $uploadedFile` — PHP's upload tmp name, e.g. `/tmp/phpAbC123`. */
export function uploadedTmpPath(file: UploadedFileLike): string {
  let p = TMP_PATHS.get(file);
  if (!p) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    p = '/tmp/php' + Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join('');
    TMP_PATHS.set(file, p);
  }
  return p;
}

/** PHP string conversion as used by `.` concatenation / string functions in non-strict mode. */
export function phpStr(v: unknown, fn?: string, argNo = 1, argName = 'string'): string {
  if (v === null || v === undefined || v === false) return '';
  if (v === true) return '1';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return v;
  if (isUploadedFile(v)) return uploadedTmpPath(v);
  if (fn) {
    const type = Array.isArray(v) || typeof v === 'object' ? 'array' : typeof v;
    throw new PhpError(`${fn}(): Argument #${argNo} ($${argName}) must be of type string, ${type} given`);
  }
  // `'x' . []` → "Array" plus an E_WARNING, which Laravel turns into an ErrorException.
  throw new Error('Array to string conversion');
}

/** PHP 8 `strtolower()` (ASCII only). */
export const phpLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** filter_var($v, FILTER_VALIDATE_URL) (scheme + authority required for hierarchical URLs). */
export function filterValidateUrl(v: string): boolean {
  if (!/^[\x21-\x7e]+$/.test(v)) return false;
  const m = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(v);
  if (!m) return false;
  const scheme = m[1]!.toLowerCase();
  const rest = m[2]!;
  if (scheme === 'http' || scheme === 'https') return /^\/\/[^/?#\s]+/.test(rest) && /^\/\/[a-z0-9_.\-[\]:@%]+([/?#]|$)/i.test(rest);
  if (scheme === 'mailto' || scheme === 'news' || scheme === 'file') return rest.length > 0;
  return /^\/\/[^/?#\s]+/.test(rest);
}

/** `json_decode($v, true)` re-encoded by Laravel: empty objects → [], sequential-key objects → lists. */
export function phpJsonDecodeAssoc(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  let v: unknown = raw;
  // JSON columns are stored decoded; a string is either a text column or a value that was not valid JSON.
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const fix = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(fix);
    if (x && typeof x === 'object') {
      const keys = Object.keys(x);
      if (keys.every((k, i) => k === String(i))) return keys.map((k) => fix((x as Record<string, unknown>)[k]));
      return Object.fromEntries(keys.map((k) => [k, fix((x as Record<string, unknown>)[k])]));
    }
    return x;
  };
  return fix(v);
}

/** `Str::slug($title)` for ASCII / Latin input (voku ASCII transliteration of other scripts is not ported). */
export function strSlug(title: unknown): string {
  let s = phpStr(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  s = s.replace(/_+/gu, '-');
  s = s.split('@').join('-at-');
  s = s.toLowerCase().replace(/[^-\p{L}\p{N}\s]+/gu, '');
  s = s.replace(/[-\s]+/gu, '-');
  return s.replace(/^-+|-+$/g, '');
}

