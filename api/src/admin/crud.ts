// Generic Backpack-style CRUD for the admin panel. Each Admin\XCrudController becomes one CrudConfig
// (api/src/admin/entities/<name>.ts). Semantics mirrored from Backpack 7:
//  - list: default order clauses, DataTables search (LIKE %term% on searchable columns),
//    pageLength 25 (config/backpack/operations/list.php), ordering by clicked column.
//  - create/update: FormRequest validation → `$request->only(field names)` (getStrippedSaveRequest)
//    → Model::create / ->update (timestamps set; only declared fields written).
//  - only the operations the PHP controller `use`s are exposed.
import { Router, type Request } from 'express';
import { nowDb } from '../core/time.js';
import { validate, type Messages, type Rules } from '../core/validation/validator.js';
import { all, exec, first, type Row } from '../db/pool.js';
import { adminAuth } from './auth.js';

export interface ListFilterResult {
  where?: Array<{ sql: string; params?: unknown[] }>;
  orderBy?: Array<[string, 'asc' | 'desc']>;
}

export type Operation ='list' | 'show' | 'create' | 'update' | 'delete';

export interface CrudConfig {
  /** Backpack route segment, e.g. `department` (→ /api/admin/department). */
  route: string;
  table: string;
  operations: Operation[];
  list: {
    /** Columns returned to the list view (`*` for all). */
    select?: string;
    /** `CRUD::addClause('orderBy', …)` / default ordering. */
    orderBy?: Array<[string, 'asc' | 'desc']>;
    /** Columns the DataTables search box matches with LIKE. */
    searchable: string[];
    /** Columns the user may sort by. */
    sortable?: string[];
    /** Extra fixed WHERE (e.g. `CRUD::addClause('where', …)`). */
    where?: { sql: string; params?: unknown[] };
    /** Extra OR'ed search condition (e.g. Backpack's `orWhereDate` for date columns); null = none. */
    searchExtra?: (
      term: string,
    ) => { sql: string; params: unknown[] } | null | Promise<{ sql: string; params: unknown[] } | null>;
    /** Backpack list filters (`addFilter`): extra AND conditions and/or a replacement default order. */
    filters?: (input: Record<string, unknown>) => ListFilterResult | Promise<ListFilterResult>;
    /** Filter dropdown values, returned as `filters` in the list response. */
    filterOptions?: () => Promise<Record<string, Array<{ value: string; label: string }>>>;
  };
  /** Server-computed form dropdown options (GET /<route>/form-options[?id=]). */
  formOptions?: (req: Request, id: string | null) => Promise<Record<string, Array<{ value: string; label: string }>>>;
  /** Custom routes registered before the generic ones (they win on the same path): overridden store()/update(),
   *  FetchOperation endpoints… A handler may answer `{ id, message, redirect }` (redirect = Backpack panel path). */
  routes?: (r: Router) => void;
  /** Overridden store()/update() that only change the redirect target (panel path, e.g. `business-detail/create`). */
  redirect?: { create?: string; update?: string };
  /** Field names sent by the create/update forms (`$request->only(...)`). */
  fields: { create: string[]; update: string[] };
  validation?: {
    create?: { rules: Rules | ((req: Request) => Rules | Promise<Rules>); messages?: Messages };
    update?: { rules: Rules | ((req: Request, id: string) => Rules | Promise<Rules>); messages?: Messages };
  };
  /** Model casts applied on write (e.g. json → JSON.stringify). */
  casts?: Record<string, 'json' | 'boolean' | 'integer'>;
  /** Shape rows for list/show responses. */
  serialize?: (row: Row, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  hooks?: {
    /** Replace/augment data before insert (e.g. uploads, slugs). Return the data to write. */
    beforeCreate?: (data: Record<string, unknown>, req: Request) => Promise<Record<string, unknown>> | Record<string, unknown>;
    afterCreate?: (id: number, data: Record<string, unknown>, req: Request) => Promise<void> | void;
    beforeUpdate?: (
      data: Record<string, unknown>,
      existing: Row,
      req: Request,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    afterUpdate?: (id: number, data: Record<string, unknown>, req: Request) => Promise<void> | void;
    beforeDelete?: (existing: Row, req: Request) => Promise<void> | void;
  };
}

const ident = (c: string) => `\`${c.replace(/`/g, '')}\``;

function applyCasts(data: Record<string, unknown>, casts: CrudConfig['casts'] = {}) {
  const out = { ...data };
  for (const [k, cast] of Object.entries(casts)) {
    if (!(k in out) || out[k] === null || out[k] === undefined) continue;
    if (cast === 'json') out[k] = typeof out[k] === 'string' ? out[k] : JSON.stringify(out[k]);
    if (cast === 'boolean') out[k] = ['1', 'true', 'on', 1, true].includes(out[k] as never) ? 1 : 0;
    if (cast === 'integer') out[k] = Math.trunc(Number(out[k]));
  }
  return out;
}

const pick = (input: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((n) => n in input).map((n) => [n, input[n]]));

export function crudRouter(cfg: CrudConfig): Router {
  const r = Router();
  r.use(adminAuth);
  cfg.routes?.(r);
  const ops = new Set(cfg.operations);
  const serialize = async (row: Row, req: Request) => (cfg.serialize ? cfg.serialize(row, req) : { ...row });

  if (ops.has('list')) {
    r.get('/', async (req, res, next) => {
      try {
        const q = req.input;
        const length = Math.min(Number(q.length ?? 25) || 25, 1000);
        const page = Math.max(Number(q.page ?? 1) || 1, 1);
        const where: string[] = [];
        const params: unknown[] = [];
        if (cfg.list.where) {
          where.push(`(${cfg.list.where.sql})`);
          params.push(...(cfg.list.where.params ?? []));
        }
        const search = q.search ? String(q.search) : '';
        const extra = search && cfg.list.searchExtra ? await cfg.list.searchExtra(search) : null;
        if (search && (cfg.list.searchable.length || extra)) {
          const ors = cfg.list.searchable.map((c) => `${ident(c)} LIKE ?`);
          params.push(...cfg.list.searchable.map(() => `%${search}%`));
          if (extra) {
            ors.push(extra.sql);
            params.push(...extra.params);
          }
          where.push(`(${ors.join(' OR ')})`);
        }
        const filtered: ListFilterResult = cfg.list.filters ? await cfg.list.filters(q) : {};
        for (const w of filtered.where ?? []) {
          where.push(`(${w.sql})`);
          params.push(...(w.params ?? []));
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const order: Array<[string, string]> = [];
        const sortBy = q.sort ? String(q.sort) : '';
        if (sortBy && (cfg.list.sortable ?? []).includes(sortBy)) order.push([sortBy, q.dir === 'desc' ? 'desc' : 'asc']);
        order.push(...(filtered.orderBy ?? cfg.list.orderBy ?? []));
        // Backpack always appends the primary key DESC (stable order for ties) unless already ordered by it.
        if (!order.some(([c]) => c === 'id')) order.push(['id', 'desc']);
        const orderSql = `ORDER BY ${order.map(([c, d]) => `${ident(c)} ${d === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`;
        const total = Number((await first(`SELECT COUNT(*) AS c FROM ${ident(cfg.table)} ${whereSql}`, params))?.c ?? 0);
        const rows = await all(
          `SELECT ${cfg.list.select ?? '*'} FROM ${ident(cfg.table)} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
          [...params, length, (page - 1) * length],
        );
        const data = await Promise.all(rows.map((row) => serialize(row, req)));
        // DataTables recordsTotal: the whole table, before clauses, filters and search
        // ("Showing 1 to 14 of 14 entries (filtered from 16 total entries)").
        const totalAll = whereSql
          ? Number((await first(`SELECT COUNT(*) AS c FROM ${ident(cfg.table)}`))?.c ?? 0)
          : total;
        const body = { data, total, totalAll, page, length };
        res.json(cfg.list.filterOptions ? { ...body, filters: await cfg.list.filterOptions() } : body);
      } catch (e) {
        next(e);
      }
    });
  }

  if (cfg.formOptions) {
    r.get('/form-options', async (req, res, next) => {
      try {
        res.json(await cfg.formOptions!(req, req.query.id ? String(req.query.id) : null));
      } catch (e) {
        next(e);
      }
    });
  }

  const load = (id: string) => first(`SELECT * FROM ${ident(cfg.table)} WHERE id = ? LIMIT 1`, [id]);

  if (ops.has('show') || ops.has('update')) {
    r.get('/:id', async (req, res, next) => {
      try {
        const row = await load(req.params.id!);
        if (!row) return void res.status(404).json({ message: 'Not Found' });
        res.json(await serialize(row, req));
      } catch (e) {
        next(e);
      }
    });
  }

  if (ops.has('create')) {
    r.post('/', async (req, res, next) => {
      try {
        const v = cfg.validation?.create;
        if (v) {
          const rules = typeof v.rules === 'function' ? await v.rules(req) : v.rules;
          const result = await validate(req.input, rules, v.messages);
          if (result.fails()) return void res.status(422).json({ message: result.first(), errors: result.all() });
        }
        let data = pick(req.input, cfg.fields.create);
        if (cfg.hooks?.beforeCreate) data = await cfg.hooks.beforeCreate(data, req);
        data = applyCasts(data, cfg.casts);
        const now = nowDb();
        data.updated_at = now;
        data.created_at = now;
        const cols = Object.keys(data);
        const result = await exec(
          `INSERT INTO ${ident(cfg.table)} (${cols.map(ident).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => data[c]),
        );
        await cfg.hooks?.afterCreate?.(result.insertId, data, req);
        res.status(201).json({ id: result.insertId, message: 'The item has been added successfully.', ...(cfg.redirect?.create ? { redirect: cfg.redirect.create } : {}) });
      } catch (e) {
        next(e);
      }
    });
  }

  if (ops.has('update')) {
    r.put('/:id', async (req, res, next) => {
      try {
        const id = req.params.id!;
        const existing = await load(id);
        if (!existing) return void res.status(404).json({ message: 'Not Found' });
        const v = cfg.validation?.update;
        if (v) {
          const rules = typeof v.rules === 'function' ? await v.rules(req, id) : v.rules;
          const result = await validate(req.input, rules, v.messages);
          if (result.fails()) return void res.status(422).json({ message: result.first(), errors: result.all() });
        }
        let data = pick(req.input, cfg.fields.update);
        if (cfg.hooks?.beforeUpdate) data = await cfg.hooks.beforeUpdate(data, existing, req);
        data = applyCasts(data, cfg.casts);
        // Eloquent writes only dirty attributes, and touches updated_at only when something changed.
        const dirty = Object.keys(data).filter((k) => String(existing[k] ?? '\0') !== String(data[k] ?? '\0'));
        if (dirty.length) {
          const values = dirty.map((k) => data[k]);
          await exec(
            `UPDATE ${ident(cfg.table)} SET ${dirty.map((k) => `${ident(k)} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
            [...values, nowDb(), id],
          );
        }
        await cfg.hooks?.afterUpdate?.(Number(id), data, req);
        res.json({ id: Number(id), message: 'The item has been modified successfully.', ...(cfg.redirect?.update ? { redirect: cfg.redirect.update } : {}) });
      } catch (e) {
        next(e);
      }
    });
  }

  if (ops.has('delete')) {
    r.delete('/:id', async (req, res, next) => {
      try {
        const existing = await load(req.params.id!);
        if (!existing) return void res.status(404).json({ message: 'Not Found' });
        await cfg.hooks?.beforeDelete?.(existing, req);
        await exec(`DELETE FROM ${ident(cfg.table)} WHERE id = ?`, [req.params.id]);
        // Backpack DeleteOperation::destroy() returns the deleted row count as the body.
        res.json(1);
      } catch (e) {
        next(e);
      }
    });
  }

  return r;
}
