// Port of App\Http\Controllers\Admin\DesignationCrudController (+ DesignationRequest / DesignationUpdateRequest).
// Operations: List, Create, Update, Show (no Delete). Model: Designation — Backpack SpatieTranslatable
// `$translatable = ['name']`, `$guarded = ['id']` (officer_mobile_number is a form field but not a column:
// Eloquent drops it silently).
import type { Row } from '../../db/mongo.js';
import { translatedAttr } from '../../utils/php/compat.js';
import { phpJsonDecodeAssoc } from '../../utils/php/values.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { keepIfJsonEquivalent, onlyColumns } from '../support/directory-helpers.js';

const FIELDS = ['name', 'officer_mobile_number', 'status'];
const RULES = { name: 'required|min:5|max:255' };

/**
 * spatie getTranslations(): json_decode of the raw column (non-JSON → []), null/'' entries dropped;
 * setTranslation(): `$translations[$locale] = $value` → json_encode(UNESCAPED_UNICODE | UNESCAPED_SLASHES).
 */
function setTranslation(raw: unknown, value: unknown, locale = 'en'): string {
  const decoded = phpJsonDecodeAssoc(raw);
  const t: Record<string, unknown> = {};
  if (decoded && typeof decoded === 'object') {
    for (const [k, v] of Object.entries(decoded)) if (v !== null && v !== '') t[k] = v;
  }
  t[locale] = value;
  return JSON.stringify(t);
}

export const designation: CrudConfig = {
  route: 'designation',
  collection: 'designations',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Backpack text column on a varchar → LIKE on the raw JSON; officer_mobile_number is no table column.
    searchable: ['name'],
    sortable: ['name', 'status'],
    orderBy: [['id', 'desc']],
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: { rules: RULES }, update: { rules: RULES } },
  casts: { status: 'integer' },
  serialize: (row: Row) => ({ ...row, name_raw: row.name, name: translatedAttr(row.name) }),
  hooks: {
    beforeCreate: async (data) => {
      // Backpack HasTranslations::create(): `name` set as the 'en' translation, the rest fill()ed.
      if ('name' in data) data.name = setTranslation(null, data.name);
      return newRow('designations', await onlyColumns('designations', data));
    },
    beforeUpdate: async (data, existing) => {
      if ('name' in data) data.name = keepIfJsonEquivalent(existing, 'name', setTranslation(existing.name, data.name));
      const out = await onlyColumns('designations', data);
      coerceRow('designations', out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced('designations', id, data),
  },
};
