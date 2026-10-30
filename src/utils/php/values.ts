// PHP value semantics (string conversion, trim, json_decode, filter_var, Str::slug) and Laravel UploadedFile
// behaviour, shared by the ported controllers.
import crypto from 'node:crypto';
import { PhpError } from '../../core/http/response.js';

/** PHP trim(); default character set " \t\n\r\0\x0B". */
export function phpTrim(text: string, chars = ' \t\n\r\0\x0B'): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start]!)) start++;
  while (end > start && chars.includes(text[end - 1]!)) end--;
  return text.slice(start, end);
}

export interface UploadedFileLike {
  fieldname?: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export const isUploadedFile = (value: unknown): value is UploadedFileLike =>
  !!value && typeof value === 'object' && 'originalname' in value && 'size' in value;

const TMP_PATHS = new WeakMap<object, string>();
/** PDO binding of a PHP value (UploadedFile binds as its tmp path via __toString()). */
export function bind(value: unknown): unknown {
  if (value === undefined) return null;
  if (isUploadedFile(value)) return uploadedTmpPath(value);
  return value;
}

/** `(string) $uploadedFile` — PHP's upload tmp name, e.g. `/tmp/phpAbC123`. */
export function uploadedTmpPath(file: UploadedFileLike): string {
  let tmpPath = TMP_PATHS.get(file);
  if (!tmpPath) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    tmpPath = '/tmp/php' + Array.from(crypto.randomBytes(6), (byte) => chars[byte % chars.length]).join('');
    TMP_PATHS.set(file, tmpPath);
  }
  return tmpPath;
}

/** PHP string conversion as used by `.` concatenation / string functions in non-strict mode. */
export function phpStr(value: unknown, fn?: string, argNo = 1, argName = 'string'): string {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return '1';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === 'string') return value;
  if (isUploadedFile(value)) return uploadedTmpPath(value);
  if (fn) {
    const type = Array.isArray(value) || typeof value === 'object' ? 'array' : typeof value;
    throw new PhpError(`${fn}(): Argument #${argNo} ($${argName}) must be of type string, ${type} given`);
  }
  // `'x' . []` → "Array" plus an E_WARNING, which Laravel turns into an ErrorException.
  throw new Error('Array to string conversion');
}

/** PHP 8 `strtolower()` (ASCII only). */
export const phpLower = (text: string) => text.replace(/[A-Z]/g, (char) => char.toLowerCase());

/** filter_var($v, FILTER_VALIDATE_URL) (scheme + authority required for hierarchical URLs). */
export function filterValidateUrl(value: string): boolean {
  if (!/^[\x21-\x7e]+$/.test(value)) return false;
  const match = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(value);
  if (!match) return false;
  const scheme = match[1]!.toLowerCase();
  const rest = match[2]!;
  if (scheme === 'http' || scheme === 'https') return /^\/\/[^/?#\s]+/.test(rest) && /^\/\/[a-z0-9_.\-[\]:@%]+([/?#]|$)/i.test(rest);
  if (scheme === 'mailto' || scheme === 'news' || scheme === 'file') return rest.length > 0;
  return /^\/\/[^/?#\s]+/.test(rest);
}

/** `json_decode($v, true)` re-encoded by Laravel: empty objects → [], sequential-key objects → lists. */
export function phpJsonDecodeAssoc(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  let decoded: unknown = raw;
  // JSON columns are stored decoded; a string is either a text column or a value that was not valid JSON.
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const fix = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(fix);
    if (node && typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.every((key, i) => key === String(i))) return keys.map((key) => fix((node as Record<string, unknown>)[key]));
      return Object.fromEntries(keys.map((key) => [key, fix((node as Record<string, unknown>)[key])]));
    }
    return node;
  };
  return fix(decoded);
}

/** `Str::slug($title)` for ASCII / Latin input (voku ASCII transliteration of other scripts is not ported). */
export function strSlug(title: unknown): string {
  let slug = phpStr(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  slug = slug.replace(/_+/gu, '-');
  slug = slug.split('@').join('-at-');
  slug = slug.toLowerCase().replace(/[^-\p{L}\p{N}\s]+/gu, '');
  slug = slug.replace(/[-\s]+/gu, '-');
  return slug.replace(/^-+|-+$/g, '');
}

