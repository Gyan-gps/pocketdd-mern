// UI of App\Http\Controllers\Admin\BusinessCategoryCrudController.
import type { EntityUi, FieldDef } from '../types';
import { hindiAutofill, hindiStyle, slugField, statusClosure } from './shared-columns';

const fields = (statusLabel: string): FieldDef[] => [
  {
    name: 'name',
    label: 'Business Category Name',
    placeholder: 'Enter Business Category Name',
    size: 6,
    attributes: { autoComplete: 'off', title: 'Please enter only alphabets and spaces' },
    transform: 'titleCaseEnglish',
  },
  {
    name: 'name_hi',
    label: 'Business Category Name (Hindi)',
    placeholder: 'केवल हिंदी अक्षर',
    size: 6,
    attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' },
    autofill: hindiAutofill,
  },
  { name: 'img', label: 'Img', type: 'upload', size: 6 },
  slugField('name'),
  { name: 'status', label: statusLabel, type: 'checkbox', size: 6 },
];

export const businessCategory: EntityUi = {
  route: 'business-category',
  singular: 'Business Category',
  plural: 'Business Categories',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'name', label: 'Category Name (English)' },
    { name: 'name_hi', label: 'Category Name (Hindi)', limit: 100, style: hindiStyle },
    { name: 'img', label: 'Img', type: 'image' },
    statusClosure,
  ],
  showColumns: [
    { name: 'name', label: 'Business Category Name' },
    { name: 'name_hi', label: 'व्यवसाय श्रेणी का नाम', limit: 100, style: hindiStyle },
    { name: 'sub_category', label: 'Business Subcategories', limit: 1000 },
    { name: 'sub_category_hindi', label: 'व्यावसायिक उपश्रेणियाँ', limit: 1000 },
    { name: 'img', label: 'Img', type: 'image' },
    { name: 'status', label: 'Status', type: 'check' },
  ],
  createFields: fields('Status'),
  updateFields: fields('Category Status'),
  filters: [
    { name: 'name', label: 'Business Category', type: 'select' },
    { name: 'name_hi', label: 'व्यवसाय श्रेणी', type: 'select' },
    { name: 'status', label: 'Status', type: 'select' },
    { name: 'sorting', label: 'Sort By', type: 'select' },
  ],
  topButtons: () => [{ label: '☁ Import Category Data', href: '/pocketddadmin/import-category-data' }],
  lineButtons: (row) => [
    { label: '+ Add Sub Categories', href: `/pocketddadmin/business-sub-category/create?parent_id=${row.id}` },
    ...(row.has_sub_categories ? [{ label: '👁 View Sub Categories', href: `/pocketddadmin/business-sub-category?parent_id=${row.id}` }] : []),
  ],
};
