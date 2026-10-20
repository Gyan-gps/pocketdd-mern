// UI of App\Http\Controllers\Admin\DepartmentCrudController.
import type { EntityUi, FieldDef } from '../types';

const hindiStyle = { fontFamily: '"k010", sans-serif', fontSize: 25 };

const fields: FieldDef[] = [
  {
    name: 'department_name',
    label: 'Department Name',
    placeholder: 'Enter Department Name',
    size: 6,
    attributes: { autoComplete: 'off' },
    transform: 'titleCaseEnglish',
  },
  {
    name: 'department_name_hi',
    label: 'विभाग का नाम',
    placeholder: 'केवल हिंदी अक्षर',
    size: 6,
    attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' },
    // public/assets/js/getDepartmentTranslation.js → GET /api/translate-to-hindi/{department}
    autofill: {
      from: 'department_name',
      endpoint: (v) => `/api/translate-to-hindi/${encodeURIComponent(v)}`,
      pick: (json) => json?.data?.translated_text,
    },
  },
  {
    name: 'slug',
    label: 'Slug',
    type: 'slug',
    size: 6,
    slug: { target: 'department_name', separator: '', trim: true, lower: true, strict: true, remove: /[*+~()!:@]/g },
  },
  { name: 'status', label: 'Status', type: 'checkbox', size: 6 },
];

export const department: EntityUi = {
  route: 'department',
  singular: 'administrative department',
  plural: 'Administrative Departments',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'department_name', label: 'Department Name', limit: 5000 },
    { name: 'department_name_hi', label: 'विभाग का नाम', limit: 5000, style: hindiStyle },
    { name: 'status', label: 'Status', type: 'check' },
  ],
  createFields: fields,
};
