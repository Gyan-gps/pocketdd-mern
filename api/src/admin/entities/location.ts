// Port of App\Http\Controllers\Admin\LocationCrudController (+ LocationRequest / LocationUpdateRequest).
// Operations: List, Create, Update, Show (Delete commented out). The importPinCodeMaster button links to
// routes that are commented out in routes/backpack/custom.php (404 in Laravel too).
// Model Location: Backpack SpatieTranslatable HasTranslations, $translatable ['location_name'].
// Quirks kept:
//  - create/update write `{"<app locale>": value}` JSON (merged into existing translations on update);
//  - `unique:locations,location_name` compares the plain value with the stored JSON, so it never matches JSON rows;
//  - messages() uses the bare attribute key → every location_name failure shows the same text;
//  - store()/update() redirect to business-user (UI: saveRedirect).
import type { Row } from '../../db/pool.js';
import { translatedAttr } from '../../helpers/php-compat.js';
import type { CrudConfig } from '../crud.js';
import { all, eqFilter } from '../support/catalog-helpers.js';

const APP_LOCALE = 'en';
const MESSAGES = { location_name: 'City name should be unique and required.' };

/** Spatie getTranslations(): JSON object entries, minus null / '' values; anything else → {}. */
function translations(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return {};
  return Object.fromEntries(Object.entries(decoded as Record<string, unknown>).filter(([, v]) => v !== null && v !== ''));
}

/** setTranslation(): json_encode(..., JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES). */
function setTranslation(raw: unknown, value: unknown): string {
  const t = translations(raw);
  t[APP_LOCALE] = value;
  return JSON.stringify(t);
}

export const location: CrudConfig = {
  route: 'location',
  table: 'locations',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    searchable: ['location_name'], // LIKE on the raw JSON column
    sortable: ['location_name', 'status'],
    filters: (q) => ({ where: [...eqFilter(q, 'id'), ...eqFilter(q, 'status')] }),
    filterOptions: async () => ({
      // Location::where('status', 1)->pluck('location_name', 'id') — pluck returns the raw JSON column
      id: (await all('SELECT id, location_name FROM locations WHERE status = 1')).map((r) => ({
        value: String(r.id),
        label: r.location_name === null ? '' : String(r.location_name),
      })),
      status: [
        { value: '1', label: 'Active City' },
        { value: '0', label: 'In-Active City' },
      ],
    }),
  },
  fields: { create: ['location_name', 'status'], update: ['location_name', 'status'] },
  validation: {
    create: { rules: { location_name: 'required|unique:locations,location_name' }, messages: MESSAGES },
    update: { rules: { location_name: 'required' }, messages: MESSAGES },
  },
  casts: { status: 'boolean' },
  serialize: (row: Row) => ({
    ...row,
    // getTranslation('location_name', 'hi_IN', true) → falls back to 'en'; form/show use the 'en' translation.
    location_name: translatedAttr(row.location_name, APP_LOCALE),
    location_name_raw: row.location_name,
  }),
  hooks: {
    beforeCreate: (data) =>
      'location_name' in data ? { ...data, location_name: setTranslation(null, data.location_name) } : data,
    beforeUpdate: (data, existing) =>
      'location_name' in data ? { ...data, location_name: setTranslation(existing.location_name, data.location_name) } : data,
  },
};
