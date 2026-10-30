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
import type { PipelineStage } from 'mongoose';
import { nowDb } from '../core/time.js';
import { validate, type Messages, type Rules } from '../core/validation/validator.js';
import { escapeRegex, insertRow, intId, nextId, toRow, type EmbeddedTable, type Filter, type Row } from '../db/mongo.js';
import { EMBEDDED_TABLES, modelFor } from '../models/index.js';
import { adminAuth } from './auth.js';

export interface ListFilterResult {
  /** Extra AND conditions, as filters on the row shape (`id`, columns). */
  where?: Array<Filter<Row>>;
  orderBy?: Array<[string, 'asc' | 'desc']>;
}

export type Operation = 'list' | 'show' | 'create' | 'update' | 'delete';

export interface CrudConfig {
  /** Backpack route segment, e.g. `department` (→ /api/admin/department). */
  route: string;
  /** MongoDB collection (top-level entities). */
  collection?: string;
  /** Old child table now embedded in its parent document (see EMBEDDED_TABLES in models/index.ts). */
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
  routes?: (router: Router) => void;
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
  for (const [field, cast] of Object.entries(casts)) {
    if (!(field in out) || out[field] === null || out[field] === undefined) continue;
    if (cast === 'json' && typeof out[field] === 'string') {
      try {
        out[field] = JSON.parse(out[field] as string);
      } catch {
        // not JSON: stored as given
      }
    }
    if (cast === 'boolean') out[field] = ['1', 'true', 'on', 1, true].includes(out[field] as never) ? 1 : 0;
    if (cast === 'integer') out[field] = Math.trunc(Number(out[field]));
  }
  return out;
}

const pick = (input: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((name) => name in input).map((name) => [name, input[name]]));

/** MySQL compares/sorts case-insensitively and numeric strings by value ("9.00" < "10.00"). */
const COLLATION = { locale: 'en', strength: 2, numericOrdering: true } as const;

/** `col LIKE '%term%'` on any column type (MySQL casts numbers to text for LIKE). */
const likeExpr = (field: string, term: string) => ({
  $regexMatch: { input: { $toString: `$${field}` }, regex: escapeRegex(term), options: 'i' },
});

/** Storage adapter: rows always have the MySQL shape (`id` first). */
export function store(cfg: Pick<CrudConfig, 'collection' | 'embedded'>) {
  if (cfg.embedded) {
    const { parentModel, field, foreignKey } = EMBEDDED_TABLES[cfg.embedded]!;
    const parentCollection = parentModel.collection.collectionName;
    const counter = `${parentCollection}.${field}`;
    return {
      /** Unwind the parent array into child rows: { _id: child id, <fk>: parent id, ...child }. */
      base: (): Document[] => [
        { $unwind: `$${field}` },
        { $replaceRoot: { newRoot: { $mergeObjects: [{ _id: `$${field}.id`, [foreignKey]: '$_id' }, `$${field}`] } } },
        { $unset: 'id' },
      ],
      aggregate: (pipeline: Document[]): Promise<Document[]> => parentModel.aggregate(pipeline as PipelineStage[], { collation: COLLATION }),
      async load(id: number) {
        const parent = await parentModel.findOne({ [`${field}.id`]: id }, { [field]: 1 }).lean<Row>();
        const child = (parent?.[field] as Row[] | undefined)?.find((candidate) => candidate.id === id);
        if (!parent || !child) return null;
        const { id: childId, ...rest } = child;
        return { id: childId, [foreignKey]: parent._id, ...rest } as Row;
      },
      async insert(data: Row) {
        const { [foreignKey]: parentIdValue, ...rest } = data;
        const parentId = intId(parentIdValue);
        if (parentId === null || !(await parentModel.countDocuments({ _id: parentId }))) {
          throw Object.assign(new Error(`${foreignKey} must reference an existing ${parentCollection} record`), { status: 422 });
        }
        const id = await nextId(counter);
        await parentModel.updateOne({ _id: parentId }, { $push: { [field]: { id, ...rest } } });
        return id;
      },
      async update(existing: Row, changes: Row) {
        const { [foreignKey]: newParent, ...rest } = changes;
        const id = existing.id as number;
        if (newParent !== undefined && intId(newParent) !== existing[foreignKey]) {
          // Moving the child to another parent: pull it out and push the merged row there.
          const { id: _id, [foreignKey]: _parent, ...old } = existing;
          await this.remove(id);
          const parentId = intId(newParent);
          await parentModel.updateOne({ _id: parentId }, { $push: { [field]: { id, ...old, ...rest } } });
          return;
        }
        const set = Object.fromEntries(Object.entries(rest).map(([column, value]) => [`${field}.$.${column}`, value]));
        await parentModel.updateOne({ [`${field}.id`]: id }, { $set: set });
      },
      async remove(id: number) {
        await parentModel.updateOne({ [`${field}.id`]: id }, { $pull: { [field]: { id } } });
      },
    };
  }
  const model = modelFor(cfg.collection!);
  return {
    base: (): Document[] => [],
    aggregate: (pipeline: Document[]): Promise<Document[]> => model.aggregate(pipeline as PipelineStage[], { collation: COLLATION }),
    load: async (id: number) => toRow(await model.findOne({ _id: id }).lean<Row>()),
    insert: (data: Row) => insertRow(cfg.collection!, data),
    async update(existing: Row, changes: Row) {
      await model.updateOne({ _id: existing.id }, { $set: changes });
    },
    async remove(id: number) {
      await model.deleteOne({ _id: id });
    },
  };
}

/** Filters are written against the row shape; documents keep the id in `_id`. */
function rowFilter(filter: Filter<Row>): Document {
  if (Array.isArray(filter)) return filter.map((item) => rowFilter(item as Filter<Row>));
  if (!filter || typeof filter !== 'object' || filter instanceof RegExp) return filter;
  return Object.fromEntries(
    Object.entries(filter).map(([key, value]) => [key === 'id' ? '_id' : key, rowFilter(value as Filter<Row>)]),
  );
}

export function crudRouter(cfg: CrudConfig): Router {
  const router = Router();
  router.use(adminAuth);
  cfg.routes?.(router);
  const operations = new Set(cfg.operations);
  const storage = store(cfg);
  const serialize = async (row: Row, req: Request) => (cfg.serialize ? cfg.serialize(row, req) : { ...row });
  const load = (id: string) => {
    const numericId = intId(id);
    return numericId === null ? Promise.resolve(null) : storage.load(numericId);
  };

  if (operations.has('list')) {
    router.get('/', async (req, res, next) => {
      try {
        const input = req.input;
        const length = Math.min(Number(input.length ?? 25) || 25, 1000);
        const page = Math.max(Number(input.page ?? 1) || 1, 1);
        const match: Document[] = [];
        if (cfg.list.where) match.push(rowFilter(cfg.list.where));
        const search = input.search ? String(input.search) : '';
        const extra = search && cfg.list.searchExtra ? await cfg.list.searchExtra(search) : null;
        if (search && (cfg.list.searchable.length || extra)) {
          const ors: Document[] = cfg.list.searchable.map((column) => ({
            $expr: likeExpr(column === 'id' ? '_id' : column, search),
          }));
          if (extra) ors.push(rowFilter(extra));
          match.push({ $or: ors });
        }
        const filtered: ListFilterResult = cfg.list.filters ? await cfg.list.filters(input) : {};
        for (const condition of filtered.where ?? []) match.push(rowFilter(condition));
        const order: Array<[string, string]> = [];
        const sortBy = input.sort ? String(input.sort) : '';
        if (sortBy && (cfg.list.sortable ?? []).includes(sortBy)) order.push([sortBy, input.dir === 'desc' ? 'desc' : 'asc']);
        order.push(...(filtered.orderBy ?? cfg.list.orderBy ?? []));
        // Backpack always appends the primary key DESC (stable order for ties) unless already ordered by it.
        if (!order.some(([column]) => column === 'id')) order.push(['id', 'desc']);
        const sort: Record<string, 1 | -1> = {};
        for (const [column, direction] of order) {
          const key = column === 'id' ? '_id' : column;
          if (!(key in sort)) sort[key] = direction === 'desc' ? -1 : 1;
        }
        const pipeline = [...storage.base(), ...(match.length ? [{ $match: { $and: match } }] : [])];
        const [result] = await storage.aggregate([
          ...pipeline,
          {
            $facet: {
              total: [{ $count: 'c' }],
              rows: [
                { $sort: sort },
                { $skip: (page - 1) * length },
                { $limit: length },
                ...(cfg.list.select
                  ? [{ $project: Object.fromEntries(cfg.list.select.map((field) => [field === 'id' ? '_id' : field, 1])) }]
                  : []),
              ],
            },
          },
        ]);
        const total = Number(result?.total[0]?.c ?? 0);
        const data = await Promise.all((result?.rows ?? []).map((document: Document) => serialize(toRow(document)!, req)));
        // DataTables recordsTotal: the whole table, before clauses, filters and search
        // ("Showing 1 to 14 of 14 entries (filtered from 16 total entries)").
        const totalAll = match.length
          ? Number((await storage.aggregate([...storage.base(), { $count: 'c' }]))[0]?.c ?? 0)
          : total;
        const body = { data, total, totalAll, page, length };
        res.json(cfg.list.filterOptions ? { ...body, filters: await cfg.list.filterOptions() } : body);
      } catch (error) {
        next(error);
      }
    });
  }

  if (cfg.formOptions) {
    router.get('/form-options', async (req, res, next) => {
      try {
        res.json(await cfg.formOptions!(req, req.query.id ? String(req.query.id) : null));
      } catch (error) {
        next(error);
      }
    });
  }

  if (operations.has('show') || operations.has('update')) {
    router.get('/:id', async (req, res, next) => {
      try {
        const row = await load(req.params.id!);
        if (!row) return void res.status(404).json({ message: 'Not Found' });
        res.json(await serialize(row, req));
      } catch (error) {
        next(error);
      }
    });
  }

  if (operations.has('create')) {
    router.post('/', async (req, res, next) => {
      try {
        const validation = cfg.validation?.create;
        if (validation) {
          const rules = typeof validation.rules === 'function' ? await validation.rules(req) : validation.rules;
          const result = await validate(req.input, rules, validation.messages);
          if (result.fails()) return void res.status(422).json({ message: result.first(), errors: result.all() });
        }
        let data = pick(req.input, cfg.fields.create);
        if (cfg.hooks?.beforeCreate) data = await cfg.hooks.beforeCreate(data, req);
        data = applyCasts(data, cfg.casts);
        const now = nowDb();
        data.updated_at = now;
        data.created_at = now;
        const id = await storage.insert(data);
        await cfg.hooks?.afterCreate?.(id, data, req);
        res.status(201).json({ id, message: 'The item has been added successfully.', ...(cfg.redirect?.create ? { redirect: cfg.redirect.create } : {}) });
      } catch (error) {
        if ((error as { status?: number }).status === 422) return void res.status(422).json({ message: (error as Error).message });
        next(error);
      }
    });
  }

  if (operations.has('update')) {
    router.put('/:id', async (req, res, next) => {
      try {
        const id = req.params.id!;
        const existing = await load(id);
        if (!existing) return void res.status(404).json({ message: 'Not Found' });
        const validation = cfg.validation?.update;
        if (validation) {
          const rules = typeof validation.rules === 'function' ? await validation.rules(req, id) : validation.rules;
          const result = await validate(req.input, rules, validation.messages);
          if (result.fails()) return void res.status(422).json({ message: result.first(), errors: result.all() });
        }
        let data = pick(req.input, cfg.fields.update);
        if (cfg.hooks?.beforeUpdate) data = await cfg.hooks.beforeUpdate(data, existing, req);
        data = applyCasts(data, cfg.casts);
        // Eloquent writes only dirty attributes, and touches updated_at only when something changed.
        const same = (before: unknown, after: unknown) =>
          before !== null && typeof before === 'object'
            ? JSON.stringify(before) === JSON.stringify(after)
            : String(before ?? '\0') === String(after ?? '\0');
        const dirty = Object.keys(data).filter((field) => !same(existing[field], data[field]));
        if (dirty.length) {
          await storage.update(existing, { ...Object.fromEntries(dirty.map((field) => [field, data[field]])), updated_at: nowDb() });
        }
        await cfg.hooks?.afterUpdate?.(Number(id), data, req);
        res.json({ id: Number(id), message: 'The item has been modified successfully.', ...(cfg.redirect?.update ? { redirect: cfg.redirect.update } : {}) });
      } catch (error) {
        next(error);
      }
    });
  }

  if (operations.has('delete')) {
    router.delete('/:id', async (req, res, next) => {
      try {
        const existing = await load(req.params.id!);
        if (!existing) return void res.status(404).json({ message: 'Not Found' });
        await cfg.hooks?.beforeDelete?.(existing, req);
        await storage.remove(existing.id as number);
        // Backpack DeleteOperation::destroy() returns the deleted row count as the body.
        res.json(1);
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
