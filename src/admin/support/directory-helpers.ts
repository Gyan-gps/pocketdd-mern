// Shared Eloquent/Backpack behaviour for the directory admin screens
// (administrator, designation, city-helpline-number, address, about-us, pincode). Storage is MongoDB.
import type { Request } from 'express';
import { escapeRegex, type Filter, type Row } from '../../db/mongo.js';
import { Pincode, modelFor } from '../../models/index.js';
import { phpJsonDecodeAssoc } from '../../utils/php/values.js';
import { phpEmpty } from '../../utils/php/compat.js';
import { phpJsonEncode, phpStrictEqual } from '../../utils/php/json.js';
import { NEVER, findById, groupValues, onlyColumns, pluckOptions } from './catalog-helpers.js';

export { onlyColumns, phpEmpty };

export type FormOpts = Record<string, Array<{ value: string; label: string }>>;


/**
 * Repeatable field input as Backpack receives it: the hidden main input (`name=""` → NULL after
 * ConvertEmptyStringsToNull) is overridden by `name[i][sub]` rows when there are any. The Next form (and API
 * clients) may also send the rows JSON-encoded in the main input — decoded here so FormRequest wildcard
 * rules (`name.*.sub`) see the array, as they do in PHP.
 */
export function decodeRepeatableInput(req: Request, name: string): void {
  const value = req.input[name];
  if (typeof value !== 'string') return;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') req.input[name] = clean(parsed);
  } catch {
    /* left as the raw string, like PHP */
  }
}

/** TrimStrings + ConvertEmptyStringsToNull applied to nested repeatable values. */
function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clean(nested)]));
  }
  return value;
}

/**
 * `json_decode($v, true)` of a JSON column. Values are stored natively now, so a native value is decoded as if it
 * were the stored text (sequential-key objects become lists); a string is the raw text, as before.
 */
export function decodeAssoc(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  return phpJsonDecodeAssoc(typeof value === 'string' ? value : JSON.stringify(value));
}

/** The raw column text the SQL row had for a JSON column (PHP json_encode); strings and NULL pass through. */
export function rawJson(value: unknown): unknown {
  return value === null || value === undefined || typeof value === 'string' ? (value ?? null) : phpJsonEncode(value);
}

/**
 * Eloquent `json` / `array` cast write (Model::asJson). Backpack's decodeJsonCastedAttributes() first
 * json_decodes a non-empty string input. The column holds a native value.
 */
export function jsonCastWrite(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value === '') return '';
    try {
      return JSON.parse(value);
    } catch {
      // json_decode() failure → NULL
      return null;
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Model::originalIsEquivalent() for json/array casts: decoded values compared with `===`. When equivalent,
 * the stored value is returned so the generic dirty check leaves the column untouched.
 */
export function keepIfJsonEquivalent(existing: Row, key: string, next: unknown): unknown {
  const before = existing[key];
  if (before === null || before === undefined || next === null || next === undefined) return next;
  return phpStrictEqual(decodeAssoc(before), decodeAssoc(next)) ? before : next;
}

/** `PinCode::find($id)->pin_code ?? ''` (`'-'` when the id is empty). */
export async function pinCodeColumn(pincodeId: unknown): Promise<string> {
  if (phpEmpty(pincodeId)) return '-';
  const pincode = await findById(Pincode.collection.collectionName, pincodeId, { pin_code: 1 });
  return (pincode?.pin_code as string | null | undefined) ?? '';
}

/** `PinCode::groupBy('state')->orderBy('state', 'ASC')->pluck('state', 'state')` (form dropdown). */
export async function stateOptions(): Promise<Array<{ value: string; label: string }>> {
  // ONLY_FULL_GROUP_BY is off in Laravel's mysql config (strict => true but modes exclude it): grouping by state.
  return pluckSame(await groupValues(Pincode.collection.collectionName, 'state', { order: 'asc' }), 'state');
}

/** `EXISTS (SELECT * FROM pincodes WHERE x.pincode_id = pincodes.id AND pin_code LIKE %term%)` as a filter on `pincode_id`. */
export async function pinCodeIdsLike(term: string): Promise<Filter<Row>> {
  const pincodes = await Pincode.find(
    { $expr: { $regexMatch: { input: { $toString: '$pin_code' }, regex: escapeRegex(term), options: 'i' } } },
    { _id: 1 },
  ).lean<Row[]>();
  return pincodes.length ? { pincode_id: { $in: pincodes.map((pincode) => pincode._id) } } : NEVER;
}

/** `column LIKE '%term%'` on the raw JSON text of a JSON column (the engine's search cannot cast arrays to text). */
export async function jsonColumnLike(collection: string, field: string, term: string): Promise<Filter<Row>> {
  const needle = term.toLowerCase();
  const rows = await modelFor(collection)
    .find({ [field]: { $ne: null } } as never, { [field]: 1 })
    .lean<Row[]>();
  const ids = rows.filter((row) => String(rawJson(row[field])).toLowerCase().includes(needle)).map((row) => row._id);

  return ids.length ? { id: { $in: ids } } : NEVER;
}

/** pluck('x', 'x') → [value => label]; PHP array keys: null → '' and later duplicates overwrite. */
export const pluckSame = (rows: Row[], column: string) => pluckOptions(rows, column, column);
