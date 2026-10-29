// Port of App\Http\Controllers\Admin\DepartmentCrudController (+ DepartmentRequest / DepartmentUpdateRequest).
// Operations: List, Create, Update, Show (no Delete). Model: Department ($casts department_mobile_number json,
// Sluggable source `slug_or_department_name` — no such accessor exists, so an empty slug stays NULL).
import type { Row } from '../../db/mongo.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { rawJson } from '../support/directory-helpers.js';

const MESSAGES = {
  'department_name.required': 'Please enter the department name (English)',
  'department_name_hi.required': 'कृपया विभाग का नाम (हिंदी) दर्ज करें।',
  'department_name.unique': 'The department name (English) already exists',
  'department_name_hi.unique': 'विभाग का नाम (हिंदी) पहले से मौजूद है।',
};

const FIELDS = ['department_name', 'department_name_hi', 'slug', 'status'];

/** cviebrock/eloquent-sluggable: a blank slug is (re)generated from the source, which is always empty here. */
const slugOrNull = (data: Record<string, unknown>) => ({
  ...data,
  slug: data.slug === undefined || data.slug === null || String(data.slug).trim() === '' ? null : data.slug,
});

export const department: CrudConfig = {
  route: 'department',
  collection: 'departments',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    orderBy: [['department_name', 'asc']],
    searchable: ['department_name', 'department_name_hi'],
    sortable: ['department_name', 'department_name_hi', 'status'],
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: {
      rules: {
        department_name: 'required|max:255|unique:departments,department_name',
        department_name_hi: 'required|max:255|unique:departments,department_name_hi',
      },
      messages: MESSAGES,
    },
    update: {
      rules: { department_name: 'required|min:5|max:255', department_name_hi: 'required|min:5|max:255' },
      messages: MESSAGES,
    },
  },
  casts: { status: 'boolean' },
  // JSON columns are native values now; the API returned their stored text.
  serialize: (row: Row) => ({
    ...row,
    designation_id: rawJson(row.designation_id),
    department_mobile_number: rawJson(row.department_mobile_number),
  }),
  hooks: {
    beforeCreate: (data) => newRow('departments', slugOrNull(data)),
    // Sluggable `onUpdate` is false: an existing non-empty slug is kept unless the form changes it.
    beforeUpdate: (data) => {
      const out = slugOrNull(data);
      coerceRow('departments', out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced('departments', id, data),
  },
};
