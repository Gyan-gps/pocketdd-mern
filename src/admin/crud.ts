// Generic Backpack-style CRUD for the admin panel. Each Admin\XCrudController becomes one CrudConfig
// (api/src/admin/entities/<name>.ts). Semantics mirrored from Backpack 7:
//  - list: default order clauses, DataTables search (LIKE %term% on searchable columns),
//    pageLength 25 (config/backpack/operations/list.php), ordering by clicked column.
//  - create/update: FormRequest validation → `$request->only(field names)` (getStrippedSaveRequest)
//    → Model::create / ->update (timestamps set; only declared fields written).
//  - only the operations the PHP controller `use`s are exposed.
// Storage is MongoDB. An `embedded` entity (old child table, e.g. business_iamges) lives in an array of its
// parent document; the engine exposes it with the old row shape (`id`, `<parent fk>`, …columns).
import { Router, type Request } from 'express';
import type { Document } from 'mongodb';
import { nowDb } from '../core/time.js';
import { validate, type Messages, type Rules } from '../core/validation/validator.js';
import { EMBEDDED, col, escapeRegex, insertRow, intId, nextId, toRow, type EmbeddedTable, type Filter, type Row } from '../db/mongo.js';
import { adminAuth } from './auth.js';

export interface ListFilterResult {
  /** Extra AND conditions, as filters on the row shape (`id`, columns). */
  where?: Array<Filter<Row>>;
  orderBy?: Array<[string, 'asc' | 'desc']>;
}

export type Operation ='list' | 'show' | 'create' | 'update' | 'delete';

export interface CrudConfig {
  /** Backpack route segment, e.g. `department` (→ /api/admin/department). */
  route: string;
  /** MongoDB collection (top-level entities). */
  collection?: string;
  /** Old child table now embedded in its parent document (see EMBEDDED in db/mongo.ts). */
  embedded?: EmbeddedTable;
  operations: Operation[];
  list: {
    /** Fields returned to the list view (default: all). */
    select?: string[];
    /** `CRUD::addClause('orderBy', …)` / default ordering. */
    orderBy?: Array<[string, 'asc' | 'desc']>;
    /** Columns the DataTables search box matches with LIKE. */
    searchable: string[];
    /** Columns the user may sort by. */
    sortable?: string[];
    /** Extra fixed condition (e.g. `CRUD::addClause('where', …)`), on the row shape. */
    where?: Filter<Row>;
    /** Extra OR'ed search condition (e.g. Backpack's `orWhereDate` for date columns); null = none. */
    searchExtra?: (term: string) => Filter<Row> | null | Promise<Filter<Row> | null>;
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
  /** Model casts applied on write (json → stored as a native value; boolean → 0/1; integer). */
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

function applyCasts(data: Record<string, unknown>, casts: CrudConfig['casts'] = {}) {
  const out = { ...data };
  for (const [k, cast] of Object.entries(casts)) {
    if (!(k in out) || out[k] === null || out[k] === undefined) continue;
    if (cast === 'json' && typeof out[k] === 'string') {
      try {
        out[k] = JSON.parse(out[k] as string);
      } catch {
        // not JSON: stored as given
      }
    }
    if (cast === 'boolean') out[k] = ['1', 'true', 'on', 1, true].includes(out[k] as never) ? 1 : 0;
    if (cast === 'integer') out[k] = Math.trunc(Number(out[k]));
  }
  return out;
}

const pick = (input: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((n) => n in input).map((n) => [n, input[n]]));

/** MySQL compares/sorts case-insensitively and numeric strings by value ("9.00" < "10.00"). */
const COLLATION = { locale: 'en', strength: 2, numericOrdering: true } as const;

/** `col LIKE '%term%'` on any column type (MySQL casts numbers to text for LIKE). */
const likeExpr = (field: string, term: string) => ({
  $regexMatch: { input: { $toString: `$${field}` }, regex: escapeRegex(term), options: 'i' },
});

/** Storage adapter: rows always have the MySQL shape (`id` first). */
export function store(cfg: Pick<CrudConfig, 'collection' | 'embedded'>) {
  if (cfg.embedded) {
    const e = EMBEDDED[cfg.embedded];
    const parent = col(e.parent);
    const counter = `${e.parent}.${e.field}`;
    return {
      /** Unwind the parent array into child rows: { _id: child id, <fk>: parent id, ...child }. */
      base: (): Document[] => [
        { $unwind: `$${e.field}` },
        { $replaceRoot: { newRoot: { $mergeObjects: [{ _id: `$${e.field}.id`, [e.fk]: '$_id' }, `$${e.field}`] } } },
        { $unset: 'id' },
      ],
      aggregate: (pipeline: Document[]) => parent.aggregate(pipeline, { collation: COLLATION }),
      async load(id: number) {
        const p = await parent.findOne({ [`${e.field}.id`]: id }, { projection: { [e.field]: 1 } });
        const child = (p?.[e.field] as Row[] | undefined)?.find((c) => c.id === id);
        if (!p || !child) return null;
        const { id: cid, ...rest } = child;
        return { id: cid, [e.fk]: p._id, ...rest } as Row;
      },
      async insert(data: Row) {
        const { [e.fk]: parentId, ...rest } = data;
        const pid = intId(parentId);
        if (pid === null || !(await parent.countDocuments({ _id: pid } as never))) {
          throw Object.assign(new Error(`${e.fk} must reference an existing ${e.parent} record`), { status: 422 });
        }
        const id = await nextId(counter);
        await parent.updateOne({ _id: pid } as never, { $push: { [e.field]: { id, ...rest } } } as never);
        return id;
      },
      async update(existing: Row, changes: Row) {
        const { [e.fk]: newParent, ...rest } = changes;
        const id = existing.id as number;
        if (newParent !== undefined && intId(newParent) !== existing[e.fk]) {
          // Moving the child to another parent: pull it out and push the merged row there.
          const { id: _i, [e.fk]: _p, ...old } = existing;
          await this.remove(id);
          const pid = intId(newParent);
          await parent.updateOne({ _id: pid } as never, { $push: { [e.field]: { id, ...old, ...rest } } } as never);
          return;
        }
        const set = Object.fromEntries(Object.entries(rest).map(([k, v]) => [`${e.field}.$.${k}`, v]));
        await parent.updateOne({ [`${e.field}.id`]: id }, { $set: set });
      },
      async remove(id: number) {
        await parent.updateOne({ [`${e.field}.id`]: id }, { $pull: { [e.field]: { id } } } as never);
      },
    };
  }
  const c = col(cfg.collection!);
  return {
    base: (): Document[] => [],
    aggregate: (pipeline: Document[]) => c.aggregate(pipeline, { collation: COLLATION }),
    load: async (id: number) => toRow(await c.findOne({ _id: id } as never)),
    insert: (data: Row) => insertRow(cfg.collection!, data),
    async update(existing: Row, changes: Row) {
      await c.updateOne({ _id: existing.id } as never, { $set: changes });
    },
    async remove(id: number) {
      await c.deleteOne({ _id: id } as never);
    },
  };
}

/** Filters are written against the row shape; documents keep the id in `_id`. */
function rowFilter(f: Filter<Row>): Document {
  if (Array.isArray(f)) return f.map((x) => rowFilter(x as Filter<Row>));
  if (!f || typeof f !== 'object' || f instanceof RegExp) return f;
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k === 'id' ? '_id' : k, rowFilter(v as Filter<Row>)]));
}

export function crudRouter(cfg: CrudConfig): Router {
  const r = Router();
  r.use(adminAuth);
  cfg.routes?.(r);
  const ops = new Set(cfg.operations);
  const db = store(cfg);
  const serialize = async (row: Row, req: Request) => (cfg.serialize ? cfg.serialize(row, req) : { ...row });
  const load = (id: string) => {
    const n = intId(id);
    return n === null ? Promise.resolve(null) : db.load(n);
  };

  if (ops.has('list')) {
    r.get('/', async (req, res, next) => {
      try {
        const q = req.input;
        const length = Math.min(Number(q.length ?? 25) || 25, 1000);
        const page = Math.max(Number(q.page ?? 1) || 1, 1);
        const match: Document[] = [];
        if (cfg.list.where) match.push(rowFilter(cfg.list.where));
        const search = q.search ? String(q.search) : '';
        const extra = search && cfg.list.searchExtra ? await cfg.list.searchExtra(search) : null;
        if (search && (cfg.list.searchable.length || extra)) {
          const ors: Document[] = cfg.list.searchable.map((c) => ({ $expr: likeExpr(c === 'id' ? '_id' : c, search) }));
          if (extra) ors.push(rowFilter(extra));
          match.push({ $or: ors });
        }
        const filtered: ListFilterResult = cfg.list.filters ? await cfg.list.filters(q) : {};
        for (const w of filtered.where ?? []) match.push(rowFilter(w));
        const order: Array<[string, string]> = [];
        const sortBy = q.sort ? String(q.sort) : '';
        if (sortBy && (cfg.list.sortable ?? []).includes(sortBy)) order.push([sortBy, q.dir === 'desc' ? 'desc' : 'asc']);
        order.push(...(filtered.orderBy ?? cfg.list.orderBy ?? []));
        // Backpack always appends the primary key DESC (stable order for ties) unless already ordered by it.
        if (!order.some(([c]) => c === 'id')) order.push(['id', 'desc']);
        const sort: Record<string, 1 | -1> = {};
        for (const [c, d] of order) {
          const key = c === 'id' ? '_id' : c;
          if (!(key in sort)) sort[key] = d === 'desc' ? -1 : 1;
        }
        const pipeline = [...db.base(), ...(match.length ? [{ $match: { $and: match } }] : [])];
        const [result] = await db
          .aggregate([
            ...pipeline,
            {
              $facet: {
                total: [{ $count: 'c' }],
                rows: [
                  { $sort: sort },
                  { $skip: (page - 1) * length },
                  { $limit: length },
                  ...(cfg.list.select ? [{ $project: Object.fromEntries(cfg.list.select.map((f) => [f === 'id' ? '_id' : f, 1])) }] : []),
                ],
              },
            },
          ])
          .toArray();
        const total = Number(result?.total[0]?.c ?? 0);
        const data = await Promise.all((result?.rows ?? []).map((doc: Document) => serialize(toRow(doc)!, req)));
        // DataTables recordsTotal: the whole table, before clauses, filters and search
        // ("Showing 1 to 14 of 14 entries (filtered from 16 total entries)").
        const totalAll = match.length
          ? Number((await db.aggregate([...db.base(), { $count: 'c' }]).toArray())[0]?.c ?? 0)
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
        const id = await db.insert(data);
        await cfg.hooks?.afterCreate?.(id, data, req);
        res.status(201).json({ id, message: 'The item has been added successfully.', ...(cfg.redirect?.create ? { redirect: cfg.redirect.create } : {}) });
      } catch (e) {
        if ((e as { status?: number }).status === 422) return void res.status(422).json({ message: (e as Error).message });
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
        const same = (a: unknown, b: unknown) =>
          a !== null && typeof a === 'object' ? JSON.stringify(a) === JSON.stringify(b) : String(a ?? '\0') === String(b ?? '\0');
        const dirty = Object.keys(data).filter((k) => !same(existing[k], data[k]));
        if (dirty.length) {
          await db.update(existing, { ...Object.fromEntries(dirty.map((k) => [k, data[k]])), updated_at: nowDb() });
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
        await db.remove(existing.id as number);
        // Backpack DeleteOperation::destroy() returns the deleted row count as the body.
        res.json(1);
      } catch (e) {
        next(e);
      }
    });
  }

  return r;
}
