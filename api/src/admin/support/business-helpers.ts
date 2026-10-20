// Shared Eloquent/Backpack behaviour for the Business admin screens.
import type { Request, Response } from 'express';
import { nowDb, toModelJson } from '../../core/time.js';
import { validate, type Messages, type Rules } from '../../core/validation/validator.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import { eloquentSave, poolDb, tableColumns } from '../../helpers/business.js';

export const ident = (c: string) => `\`${c.replace(/`/g, '')}\``;

/** FormRequest validation; on failure answers 422 like the generic engine and returns false. */
export async function validated(req: Request, res: Response, rules: Rules, messages: Messages = {}): Promise<boolean> {
  const result = await validate(req.input, rules, messages);
  if (!result.fails()) return true;
  res.status(422).json({ message: result.first(), errors: result.all() });
  return false;
}

/** `$request->only($fieldNames)` — keys absent from the request are left out. */
export const only = (input: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((n) => n in input).map((n) => [n, input[n]]));

/**
 * `Model::create($data)` with `$guarded = ['id']`: attributes that are not table columns are silently dropped
 * (isGuardableColumn), timestamps set. Returns the new id.
 */
export async function modelCreate(table: string, data: Record<string, unknown>): Promise<number> {
  const cols = new Set(await tableColumns(poolDb, table));
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (k !== 'id' && cols.has(k)) row[k] = v === undefined ? null : v;
  const now = nowDb();
  row.updated_at = now;
  row.created_at = now;
  const keys = Object.keys(row);
  const r = await exec(
    `INSERT INTO ${ident(table)} (${keys.map(ident).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => row[k]),
  );
  return r.insertId;
}

/** `$model->update($attrs)` (mass assignment, dirty attributes only, touches updated_at when dirty). */
export async function modelUpdate(table: string, row: Row, attrs: Record<string, unknown>): Promise<void> {
  await eloquentSave(poolDb, table, row, attrs, { massAssign: true });
}

/** `Model::where(...)->update($attrs)` — Eloquent builder update: always sets updated_at = now(). */
export async function builderUpdate(table: string, whereSql: string, params: unknown[], attrs: Record<string, unknown>) {
  const sets: Record<string, unknown> = { ...attrs, updated_at: nowDb() };
  const keys = Object.keys(sets);
  await exec(`UPDATE ${ident(table)} SET ${keys.map((k) => `${ident(k)} = ?`).join(', ')} WHERE ${whereSql}`, [
    ...keys.map((k) => sets[k]),
    ...params,
  ]);
}

export const findRow = (table: string, id: unknown) => first(`SELECT * FROM ${ident(table)} WHERE id = ? LIMIT 1`, [id]);

/** `Model::orderBy(...)->pluck('label', 'id')` → select options (null labels render as ''). */
export async function pluckOptions(sql: string, params: unknown[] = []) {
  const rows = await all(sql, params);
  return rows.map((r) => ({ value: String(r.v), label: r.l === null || r.l === undefined ? '' : String(r.l) }));
}

/** Names of related rows by id (relationship columns: `select`/`select2` with an attribute). */
export async function namesById(table: string, attr: string, ids: unknown[]): Promise<Map<string, unknown>> {
  const list = [...new Set(ids.filter((i) => i !== null && i !== undefined).map(String))];
  if (!list.length) return new Map();
  const rows = await all(`SELECT id, ${ident(attr)} AS n FROM ${ident(table)} WHERE id IN (${list.map(() => '?').join(',')})`, list);
  return new Map(rows.map((r) => [String(r.id), r.n]));
}

/** Backpack FetchOperation::fetch() for PinCode (`searchable_attributes` pin_code, simplePaginate(10)). */
export async function fetchPincodes(req: Request, res: Response) {
  const q = req.input.q;
  const page = Math.max(Number(req.input.page ?? 1) || 1, 1);
  const per = 10;
  // `request()->input('q') ?? false` — '' is converted to null by the middleware, so it means "no search".
  const where = q === null || q === undefined ? '' : 'WHERE `pin_code` LIKE ?';
  const params = q === null || q === undefined ? [] : [`%${String(q)}%`];
  const rows = await all(`SELECT * FROM pincodes ${where} LIMIT ? OFFSET ?`, [...params, per + 1, (page - 1) * per]);
  const more = rows.length > per;
  const data = rows.slice(0, per).map((r) => ({
    ...r,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }));
  const path = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`.replace(/\/$/, '');
  res.json({
    current_page: page,
    current_page_url: `${path}?page=${page}`,
    data,
    first_page_url: `${path}?page=1`,
    from: data.length ? (page - 1) * per + 1 : null,
    next_page_url: more ? `${path}?page=${page + 1}` : null,
    path,
    per_page: per,
    prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
    to: data.length ? (page - 1) * per + data.length : null,
  });
}

const toIso = (v: unknown) => (v === null || v === undefined ? null : toModelJson(String(v)));
