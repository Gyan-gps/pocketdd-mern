// Shared Eloquent/Backpack behaviour for the catalog admin screens
// (business-category, business-sub-category, advertisment, slider, location).
import { nowDb } from '../../core/time.js';
import { all, exec, first } from '../../db/pool.js';
import { poolDb, tableColumns } from '../../helpers/business.js';

/** Eloquent mass assignment with `$guarded = ['id']`: attributes that are not table columns are silently dropped. */
export async function onlyColumns(table: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cols = new Set(await tableColumns(poolDb, table));
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id' && cols.has(k)));
}

/** cviebrock Sluggable with source `slug_or_name` (no such accessor): a blank slug stays NULL, a sent one is kept. */
export function slugOrNull(data: Record<string, unknown>): Record<string, unknown> {
  if (!('slug' in data)) return data;
  const s = data.slug;
  return { ...data, slug: s === undefined || s === null || String(s).trim() === '' ? null : s };
}

/** `X::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1])` after the trait store(). */
export async function setTreeColumns(table: string, id: number): Promise<void> {
  const row = await first(`SELECT lft, rgt, depth, updated_at FROM \`${table}\` WHERE id = ?`, [id]);
  if (!row) return;
  const lft = id + 1;
  const dirty = Number(row.lft) !== lft || row.lft === null || Number(row.rgt) !== lft || row.rgt === null || Number(row.depth) !== 1 || row.depth === null;
  if (!dirty) return;
  const now = nowDb();
  await exec(
    row.updated_at === now
      ? `UPDATE \`${table}\` SET lft = ?, rgt = ?, depth = ? WHERE id = ?`
      : `UPDATE \`${table}\` SET lft = ?, rgt = ?, depth = ?, updated_at = '${now}' WHERE id = ?`,
    [lft, lft, 1, id],
  );
}

/**
 * Eloquent `date`/`datetime` cast on write (fromDateTime): a `Y-m-d` string becomes midnight
 * (`Y-m-d 00:00:00`); other parseable strings are re-formatted as `Y-m-d H:i:s`.
 */
export function castDateTime(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return v ?? null;
  const s = String(v);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2]!.padStart(2, '0')}-${ymd[3]!.padStart(2, '0')} 00:00:00`;
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (full) return `${full[1]}-${full[2]}-${full[3]} ${full[4]}:${full[5]}:${full[6] ?? '00'}`;
  return s;
}

/** Datatables date column / Backpack date field value: the date part of the stored datetime. */
export const ymd = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v).slice(0, 10));

/** Backpack `orWhereDate(col, Carbon::parse($term))` when the search term passes the `date` rule. */
export function dateSearch(columns: string[]) {
  return (term: string) => {
    const t = Date.parse(term);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { sql: columns.map((c) => `DATE(\`${c}\`) = ?`).join(' OR '), params: columns.map(() => day) };
  };
}

/** Backpack date_range filter value `{"from": …, "to": …}` → `where col >= from and col <= to`. */
export function dateRange(column: string, value: unknown) {
  let dates: { from?: unknown; to?: unknown } | null = null;
  try {
    dates = JSON.parse(String(value));
  } catch {
    dates = null;
  }
  // json_decode failure → `$dates->from` on null: PHP warning → 500 in Laravel; treated as no filter here.
  if (!dates || typeof dates !== 'object') return [];
  return [
    { sql: `\`${column}\` >= ?`, params: [dates.from ?? null] },
    { sql: `\`${column}\` <= ?`, params: [dates.to ?? null] },
  ];
}

/** `->pluck($value, $key)->toArray()` as `[{value: key, label: value}]` (later duplicate keys win, PHP-array order). */
export function pluckOptions(rows: Array<Record<string, unknown>>, valueCol: string, keyCol: string) {
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r[keyCol] ?? ''), String(r[valueCol] ?? ''));
  return [...map].map(([value, label]) => ({ value, label }));
}

export const STATUS_FILTER = [
  { value: '0', label: 'InActive' },
  { value: '1', label: 'Active' },
];

/** `has('x')` filter with a value: `where x = value`. */
export function eqFilter(input: Record<string, unknown>, key: string, column = key) {
  const v = input[key];
  return v === null || v === undefined || v === '' ? [] : [{ sql: `\`${column}\` = ?`, params: [v] }];
}

/** The `sorting` dropdown filter shared by the category/sub-category/advertisement lists. */
export function sortingFilter(input: Record<string, unknown>, fallback: Array<[string, 'asc' | 'desc']> | undefined) {
  if (!('sorting' in input)) return fallback;
  switch (input.sorting) {
    case 'a_z':
      return [['name', 'asc']] as Array<[string, 'asc' | 'desc']>;
    case 'z_a':
      return [['name', 'desc']] as Array<[string, 'asc' | 'desc']>;
    case 'newest':
      return [['created_at', 'desc']] as Array<[string, 'asc' | 'desc']>;
    case 'oldest':
      return [['created_at', 'asc']] as Array<[string, 'asc' | 'desc']>;
    default:
      return [] as Array<[string, 'asc' | 'desc']>;
  }
}

/** Backpack appends `ORDER BY <key> DESC` unless the primary key is already ordered. */
export const withKeyDesc = (order: Array<[string, 'asc' | 'desc']> | undefined): Array<[string, 'asc' | 'desc']> => {
  const o = order ?? [];
  return o.some(([c]) => c === 'id') ? o : [...o, ['id', 'desc']];
};

/** Today in the app timezone (`Carbon::today()->toDateString()`). */
export const todayIst = () => nowDb().slice(0, 10);

export { all, first };
