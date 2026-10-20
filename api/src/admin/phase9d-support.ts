// Shared Eloquent/Backpack behaviour for the phase 9D admin entities
// (administrator, designation, city-helpline-number, address, about-us, pincode).
import type { Request } from 'express';
import { phpJsonDecodeAssoc } from '../helpers/business.js';
import { phpJsonEncode, phpStrictEqual } from '../helpers/phpJson.js';
import { all, first, type Row } from '../db/pool.js';
import { onlyColumns } from './phase9b-support.js';

export { onlyColumns };

export type FormOpts = Record<string, Array<{ value: string; label: string }>>;

/** PHP empty(). */
export function phpEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Repeatable field input as Backpack receives it: the hidden main input (`name=""` → NULL after
 * ConvertEmptyStringsToNull) is overridden by `name[i][sub]` rows when there are any. The Next form (and API
 * clients) may also send the rows JSON-encoded in the main input — decoded here so FormRequest wildcard
 * rules (`name.*.sub`) see the array, as they do in PHP.
 */
export function decodeRepeatableInput(req: Request, name: string): void {
  const v = req.input[name];
  if (typeof v !== 'string') return;
  try {
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === 'object') req.input[name] = clean(parsed);
  } catch {
    /* left as the raw string, like PHP */
  }
}

/** TrimStrings + ConvertEmptyStringsToNull applied to nested repeatable values. */
function clean(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  return v;
}

/**
 * Eloquent `json` / `array` cast write (Model::asJson → json_encode, default flags). Backpack's
 * decodeJsonCastedAttributes() first json_decodes a non-empty string input.
 */
export function jsonCastWrite(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value === '') return phpJsonEncode(value);
    try {
      return phpJsonEncode(JSON.parse(value));
    } catch {
      // json_decode() failure → NULL
      return null;
    }
  }
  return phpJsonEncode(value);
}

/**
 * Model::originalIsEquivalent() for json/array casts: decoded values compared with `===`. When equivalent,
 * the stored raw string is returned so the generic dirty check (string compare) leaves the column untouched.
 */
export function keepIfJsonEquivalent(existing: Row, key: string, next: unknown): unknown {
  const before = existing[key];
  if (before === null || before === undefined || next === null || next === undefined) return next;
  return phpStrictEqual(phpJsonDecodeAssoc(before), phpJsonDecodeAssoc(next)) ? before : next;
}

/** `PinCode::find($id)->pin_code ?? ''` (`'-'` when the id is empty). */
export async function pinCodeColumn(pincodeId: unknown): Promise<string> {
  if (phpEmpty(pincodeId)) return '-';
  const p = await first('SELECT pin_code FROM pincodes WHERE id = ? LIMIT 1', [pincodeId]);
  return (p?.pin_code as string | null | undefined) ?? '';
}

/** `PinCode::groupBy('state')->orderBy('state', 'ASC')->pluck('state', 'state')` (form dropdown). */
export async function stateOptions(): Promise<Array<{ value: string; label: string }>> {
  // ONLY_FULL_GROUP_BY is off in Laravel's mysql config (strict => true but modes exclude it): grouping by state.
  const rows = await all('SELECT state FROM pincodes GROUP BY state ORDER BY state ASC');
  return pluckSame(rows, 'state');
}

/** pluck('x', 'x') → [value => label]; PHP array keys: null → '' and later duplicates overwrite. */
export function pluckSame(rows: Row[], col: string): Array<{ value: string; label: string }> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const v = r[col];
    const key = v === null || v === undefined ? '' : String(v);
    map.set(key, v === null || v === undefined ? '' : String(v));
  }
  return [...map].map(([value, label]) => ({ value, label }));
}

/** Backpack select2/dropdown filter: `?name=value` applied with addClause('where', col, value). */
export function eqWhere(input: Record<string, unknown>, key: string, column = key) {
  const v = input[key];
  if (v === undefined || v === null || v === '') return [];
  return [{ sql: `\`${column}\` = ?`, params: [v] }];
}
