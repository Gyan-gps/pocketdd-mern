// Shared Eloquent/Backpack behaviour for the Business admin screens.
import type { Request, Response } from 'express';
import { nowDb, toModelJson } from '../../core/time.js';
import { validate, type Messages, type Rules } from '../../core/validation/validator.js';
import { C, childRow, col, insertRow, like, nextId, toRow, type EmbeddedTable, type Filter, type Row } from '../../db/mongo.js';
import { eloquentSave, locateTable, looseEq, mysqlValue, poolDb, tableColumns, tableRow, withoutChildren } from '../../db/eloquent.js';

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
 * (isGuardableColumn), timestamps set. Returns the new id. Embedded child tables need their parent fk in `data`.
 */
export async function modelCreate(table: string, data: Record<string, unknown>): Promise<number> {
  const cols = new Set(await tableColumns(poolDb, table));
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (k !== 'id' && cols.has(k)) values[k] = v === undefined ? null : v;
  const now = nowDb();
  values.updated_at = now;
  values.created_at = now;
  const loc = locateTable(table);
  if (!loc.embedded) return insertRow(loc.collection, tableRow(table, values));
  const { field, fk } = loc.embedded;
  const id = await nextId(`${loc.collection}.${field}`);
  const child = { id, ...tableRow(table, values) };
  const parentId = mysqlValue(table, fk, values[fk] ?? null);
  const r =
    parentId === null ? null : await col(loc.collection).updateOne({ _id: parentId }, { $push: { [field]: child } } as never);
  if (!r?.matchedCount) await col('_orphans').insertOne({ table, row: { id, [fk]: parentId, ...tableRow(table, values) } });
  return id;
}

/** `$model->update($attrs)` (mass assignment, dirty attributes only, touches updated_at when dirty). */
export async function modelUpdate(table: string, row: Row, attrs: Record<string, unknown>): Promise<void> {
  await eloquentSave(poolDb, table, row, attrs, { massAssign: true });
}

/**
 * `Model::where(...)->update($attrs)` — Eloquent builder update: always sets updated_at = now().
 * `filter` is a Mongo filter on the row shape (`id` → `_id`); top-level tables only.
 */
export async function builderUpdate(table: string, filter: Filter<Row>, attrs: Record<string, unknown>) {
  const loc = locateTable(table);
  if (loc.embedded) throw new Error(`builderUpdate() on embedded table ${table}`);
  const sets: Record<string, unknown> = { ...attrs, updated_at: nowDb() };
  const $set = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, mysqlValue(table, k, v)]));
  const { id, ...rest } = filter as Row;
  const f = id === undefined ? rest : { _id: id, ...rest };
  await col(loc.collection).updateMany(f, { $set });
}

/** `Model::find($id)` as the `SELECT *` row (embedded child tables: childRow() shape, orphans included). */
export async function findRow(table: string, id: unknown): Promise<Row | null> {
  const loc = locateTable(table);
  const match = looseEq(id);
  if (!loc.embedded) {
    return toRow(await col(loc.collection).findOne({ _id: match } as Filter<Row>, { projection: withoutChildren(loc.collection) }));
  }
  const { field } = loc.embedded;
  const parent = await col(loc.collection).findOne({ [`${field}.id`]: match }, { projection: { [field]: 1 } });
  if (parent) {
    const child = (parent[field] as Row[]).find((c) => String(c.id) === String(id));
    if (child) return childRow(table as EmbeddedTable, parent._id as unknown as number, child);
  }
  const orphan = await col('_orphans').findOne({ table, 'row.id': match });
  return orphan ? (orphan.row as Row) : null;
}


/** Names of related rows by id (relationship columns: `select`/`select2` with an attribute). Top-level tables. */
export async function namesById(table: string, attr: string, ids: unknown[]): Promise<Map<string, unknown>> {
  const list = [...new Set(ids.filter((i) => i !== null && i !== undefined).map(String))];
  if (!list.length) return new Map();
  const nums = list.map(Number).filter((n) => Number.isInteger(n));
  const loc = locateTable(table);
  const rows = await col(loc.collection)
    .find({ _id: { $in: nums } } as unknown as Filter<Row>, { projection: { [attr]: 1 } })
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r[attr] ?? null]));
}

/** Backpack FetchOperation::fetch() for PinCode (`searchable_attributes` pin_code, simplePaginate(10)). */
export async function fetchPincodes(req: Request, res: Response) {
  const q = req.input.q;
  const page = Math.max(Number(req.input.page ?? 1) || 1, 1);
  const per = 10;
  // `request()->input('q') ?? false` — '' is converted to null by the middleware, so it means "no search".
  const filter: Filter<Row> = q === null || q === undefined ? {} : { pin_code: like(String(q)) };
  const docs = await col(C.pincodes)
    .find(filter)
    .sort({ _id: 1 })
    .skip((page - 1) * per)
    .limit(per + 1)
    .toArray();
  const rows = docs.map((d) => toRow(d)!);
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
