// Port of App\Http\Controllers\Admin\SliderCrudController (+ SliderRequest / SliderUpdateRequest).
// Operations: List, Create, Update, Show, Reorder (reorder routes in ../catalog-imports.ts).
// Model Slider: $guarded ['id'], no casts (dates written as sent; MySQL pads `Y-m-d` to midnight).
// Quirks kept:
//  - SliderUpdateRequest requires `slider_img` too, and Backpack's upload input is disabled while a file
//    exists, so an edit only validates when a new image is uploaded;
//  - `page_location` offers options outside the column's ENUM (all-business, business-details, sub-categories)
//    → MySQL rejects them (QueryException, 500);
//  - no custom messages → raw `validation.*` keys (the app has no lang files).
import { C, type Row } from '../../db/mongo.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { coerceRow, dateRange, dateSearch, eqFilter, groupValues, newRow, setTreeColumns, storeCoerced, ymd } from '../support/catalog-helpers.js';

const TABLE = 'sliders';
const UPLOAD_DIR = 'uploads/user_images';
const FIELDS = ['client_name', 'slider_img', 'from_date', 'to_date', 'amount', 'page_location', 'url', 'status'];
const RULES = {
  client_name: 'required|min:5|max:255',
  slider_img: 'required||image|mimes:png,jpg,jpeg,svg',
  from_date: 'required',
  to_date: 'required',
  page_location: 'required',
};

export const slider: CrudConfig = {
  route: 'slider',
  collection: C.sliders,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // no order clause → Backpack's `ORDER BY id DESC`
    searchable: ['client_name', 'amount'], // text columns; page_location (enum) / slider_img / status not searched
    searchExtra: dateSearch(['from_date', 'to_date']),
    sortable: ['client_name', 'slider_img', 'from_date', 'to_date', 'amount', 'page_location', 'status'],
    filters: (q) => ({
      where: [...eqFilter(q, 'client_name'), ...(q.from_date ? dateRange('from_date', q.from_date) : [])],
    }),
    filterOptions: async () => ({
      // Slider::select('client_name')->groupBy('client_name')->havingRaw('COUNT(client_name) >= 1')->pluck(…)
      client_name: (
        await groupValues(C.sliders, 'client_name', { match: { client_name: { $ne: null } } })
      ).map((r) => ({ value: String(r.client_name), label: String(r.client_name) })),
    }),
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: { rules: RULES }, update: { rules: RULES } },
  casts: { status: 'boolean' },
  serialize: (row: Row) => ({ ...row, from_date: ymd(row.from_date), to_date: ymd(row.to_date) }),
  hooks: {
    beforeCreate: (data, req) => {
      const out = { ...data };
      applySingleUpload(out, req.input, 'slider_img', UPLOAD_DIR, null);
      return newRow(TABLE, out);
    },
    afterCreate: (id) => setTreeColumns(TABLE, id),
    beforeUpdate: (data, existing, req) => {
      // No date cast: '2026-01-05' vs stored '2026-01-05 00:00:00' is dirty for Eloquent too (updated_at touched).
      const out = { ...data };
      applySingleUpload(out, req.input, 'slider_img', UPLOAD_DIR, existing.slider_img);
      coerceRow(TABLE, out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced(TABLE, id, data),
  },
};
