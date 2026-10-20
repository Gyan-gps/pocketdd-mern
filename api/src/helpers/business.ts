// Laravel/PHP behaviour helpers used by the phase 4 modules (business, business-location, profile).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env.js';
import { PhpError } from '../core/http/respond.js';
import { nowDb } from '../core/time.js';
import { all, exec, first, pool, wrapQueryError, type Row } from '../db/pool.js';
import { phpTrim, transliterateEnglishToHindi } from './transliterate.js';

// ---------------------------------------------------------------- DB access (pool or one transaction)

export interface Db {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  first<T = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string, params?: unknown[]): Promise<ResultSetHeader>;
}

export const poolDb: Db = { all, first, exec };

/**
 * One connection with Laravel's transaction semantics: DB::beginTransaction() nests with savepoints
 * (`trans2`, …), commit() of a nested level only decrements, rollBack() at level 0 is a no-op.
 * A transaction still open when the request ends is rolled back (PHP closes the connection).
 */
export class Tx implements Db {
  private level = 0;
  private constructor(private readonly conn: PoolConnection) {}

  static async open(): Promise<Tx> {
    return new Tx(await pool.getConnection());
  }

  async all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const [rows] = await this.conn.query(sql, params);
      return rows as T[];
    } catch (e) {
      wrapQueryError(e, sql, params);
    }
  }

  async first<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.all<T>(sql, params))[0] ?? null;
  }

  async exec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
    try {
      const [res] = await this.conn.query<ResultSetHeader>(sql, params);
      return res;
    } catch (e) {
      wrapQueryError(e, sql, params);
    }
  }

  async begin(): Promise<void> {
    if (this.level === 0) await this.conn.query('START TRANSACTION');
    else await this.conn.query(`SAVEPOINT trans${this.level + 1}`);
    this.level++;
  }

  async commit(): Promise<void> {
    if (this.level === 1) await this.conn.query('COMMIT');
    this.level = Math.max(0, this.level - 1);
  }

  async rollBack(): Promise<void> {
    if (this.level === 0) return;
    if (this.level === 1) await this.conn.query('ROLLBACK');
    else await this.conn.query(`ROLLBACK TO SAVEPOINT trans${this.level}`);
    this.level--;
  }

  /** End of request: an uncommitted transaction is discarded. */
  async release(): Promise<void> {
    try {
      if (this.level > 0) await this.conn.query('ROLLBACK');
    } finally {
      this.level = 0;
      this.conn.release();
    }
  }
}

/** `->where($col, $value)`: a null value becomes `IS NULL`. */
export function whereEq(column: string, value: unknown): [string, unknown[]] {
  return value === null || value === undefined ? [`${column} IS NULL`, []] : [`${column} = ?`, [bind(value)]];
}

/** PDO binding of a PHP value (UploadedFile binds as its tmp path via __toString()). */
export function bind(value: unknown): unknown {
  if (value === undefined) return null;
  if (isUploadedFile(value)) return uploadedTmpPath(value);
  return value;
}

/** Schema::getColumnListing() — used for Eloquent mass-assignment (`$guarded = ['id']`). */
export async function tableColumns(db: Db, table: string): Promise<string[]> {
  const rows = await db.all(
    'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [table],
  );
  return rows.map((r) => String(r.c));
}

const isNumericLike = (v: unknown) =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(v));

/** Model::originalIsEquivalent() for plain (uncast) attributes; dates compare as stored strings. */
export function originalIsEquivalent(row: Row, key: string, value: unknown): boolean {
  if (!(key in row)) return false;
  const original = row[key];
  if (value === original) return true;
  if (value === null || value === undefined) return false;
  return isNumericLike(value) && isNumericLike(original) && String(value) === String(original);
}

/**
 * `$model->update($attrs)` / `$model->save()` for a model loaded as `row`:
 * unknown columns are silently dropped when `massAssign` (guarded = ['id']), only dirty attributes
 * are written and `updated_at` is touched (unless set dirty explicitly). Mutates `row` like Eloquent.
 */
export async function eloquentSave(
  db: Db,
  table: string,
  row: Row,
  attrs: Record<string, unknown>,
  opts: { massAssign: boolean },
): Promise<void> {
  let entries = Object.entries(attrs);
  if (opts.massAssign) {
    const cols = new Set(await tableColumns(db, table));
    entries = entries.filter(([k]) => k !== 'id' && cols.has(k));
  }
  const dirty: Array<[string, unknown]> = [];
  for (const [k, v] of entries) {
    const value = v === undefined ? null : v;
    if (!originalIsEquivalent(row, k, value)) dirty.push([k, value]);
  }
  if (!dirty.length) {
    for (const [k, v] of entries) row[k] = v === undefined ? null : v;
    return;
  }
  if (!dirty.some(([k]) => k === 'updated_at')) {
    const now = nowDb();
    if (!originalIsEquivalent(row, 'updated_at', now)) dirty.push(['updated_at', now]);
  }
  await db.exec(`UPDATE \`${table}\` SET ${dirty.map(([k]) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`, [
    ...dirty.map(([, v]) => bind(v)),
    row.id,
  ]);
  for (const [k, v] of entries) row[k] = v === undefined ? null : v;
  for (const [k, v] of dirty) row[k] = v;
}

// ---------------------------------------------------------------- PHP value semantics

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
  let v: unknown;
  try {
    v = JSON.parse(String(raw));
  } catch {
    return null;
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

// ---------------------------------------------------------------- App\Helpers\General

/**
 * `(new General)->quickTranslate($text)` as consumed by Business::insertNewBusiness():
 * `json_decode($response->getContent(), true)['data']['translated_text'] ?? null`.
 */
export async function quickTranslatedText(text: unknown): Promise<string | null> {
  if (Array.isArray(text) || (text !== null && typeof text === 'object')) {
    throw new PhpError(`trim(): Argument #1 ($string) must be of type string, array given`);
  }
  const t = phpTrim(phpStr(text));
  if (t === '' || t === '0') return null; // empty() → 400 {"error": …}
  const out = await transliterateEnglishToHindi(t);
  return out === '' ? null : out;
}

/** General::generateSeriesFromId(). */
export function generateSeriesFromId(id: number): string {
  let group = Math.trunc((id - 1) / 999);
  const number = ((id - 1) % 999) + 1;
  let letters = '';
  while (group >= 0) {
    letters = String.fromCharCode((group % 26) + 65) + letters;
    group = Math.trunc(group / 26) - 1;
  }
  return letters.padStart(2, 'A') + String(number).padStart(3, '0');
}

// ---------------------------------------------------------------- file uploads

const STREAM_ERRORS: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory',
};

/** PHP base64_decode() (non-strict): characters outside the alphabet are skipped. */
function phpBase64Decode(s: string): Buffer {
  return Buffer.from(s.replace(/[^A-Za-z0-9+/]/g, ''), 'base64');
}

/**
 * Controllers' private createImageFromBase64($base64, $folder): writes
 * public_path('/uploads/<folder>/') . "<rand 5 digits>-<time()>-img.<type>" and returns the relative path.
 * `mkdir` = the BusinessController variant creates the folder; BusinessUserProfileController's does not.
 */
export function createImageFromBase64(base64: unknown, folder: string, opts: { mkdir: boolean }): string {
  const str = phpStr(base64, 'explode', 2);
  const parts = str.split(';base64,');
  const typeAux = parts[0]!.split('image/');
  if (typeAux.length < 2) throw new Error('Undefined array key 1');
  const imageType = typeAux[1]!;
  const name = `${crypto.randomInt(10000, 100000)}-${Math.floor(Date.now() / 1000)}-img.${imageType}`;
  const dir = path.posix.join(env.publicPath, 'uploads', folder) + '/';
  const destination = dir + name;
  if (opts.mkdir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
  if (parts.length < 2) throw new Error('Undefined array key 1');
  const data = phpBase64Decode(parts[1]!);
  try {
    fs.writeFileSync(destination, data);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? '';
    throw new Error(`file_put_contents(${destination}): Failed to open stream: ${STREAM_ERRORS[code] ?? 'Operation failed'}`);
  }
  return `uploads/${folder}/${name}`;
}
