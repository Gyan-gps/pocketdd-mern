// UI of App\Http\Controllers\Admin\BusinessSubCategoryCrudController (List, Create, Update — no Show).
import type { EntityUi, FieldDef } from '../types';
import { hindiAutofill, hindiStyle, slugField, statusClosure } from './shared-columns';

const common: FieldDef[] = [
  {
    name: 'name',
    label: 'Sub-Category Name',
    placeholder: 'Enter Sub-Category Name',
    size: 6,
    attributes: { autoComplete: 'off', title: 'Only alphabets and numbers allowed' },
    transform: 'titleCaseEnglish',
  },
  {
    name: 'name_hi',
    label: 'Sub-Category Name (Hindi)',
    size: 6,
    attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला की अनुमति है' },
    autofill: hindiAutofill,
  },
  { name: 'img', label: 'Img', type: 'upload', size: 6 },
  slugField('name'),
  { name: 'status', label: 'Status', type: 'checkbox', size: 6 },
];

export const businessSubCategory: EntityUi = {
  route: 'business-sub-category',
  singular: 'Business Sub Category',
  plural: 'Business Sub Categories',
  operations: ['list', 'create', 'update'],
  columns: [
    { name: 'parent_id', label: 'Category', render: (row) => <span>{row.parent_name ? String(row.parent_name) : '-'}</span> },
    { name: 'name', label: 'Sub-Category Name (English)' },
    { name: 'name_hi', label: 'Sub-Category Name (Hindi)', style: hindiStyle },
    { name: 'img', label: 'Img', type: 'image' },
    statusClosure,
  ],
  // select_from_array with only the ?parent_id category (allows_null false)
  createFields: [{ name: 'parent_id', label: 'Category', type: 'select', size: 6 }, ...common],
  // editable parent_id_display select (validated, not saved) + hidden parent_id (saved)
  updateFields: [
    { name: 'parent_id_display', label: 'Category', type: 'select', size: 6 },
    ...common,
    { name: 'parent_id', type: 'hidden' },
  ],
  formOptions: true,
  createDefaultsFromQuery: ['parent_id'],
  filters: [
    { name: 'parent_id', label: 'Business Category', type: 'select' },
    { name: 'status', label: 'Sub-Category Status', type: 'select' },
    { name: 'sorting', label: 'Sort By', type: 'select' },
  ],
  topButtons: (q) => [
    { label: '☁ Import Sub-Category Data', href: '/pocketddadmin/import-sub-category-data' },
    ...(q.parent_id ? [{ label: '+ Add Sub-Category', href: `/pocketddadmin/business-sub-category/create?parent_id=${q.parent_id}` }] : []),
  ],
  // redirect(backpack_url('business-sub-category?parent_id=' . request('parent_id')))
  saveRedirect: (v) => `business-sub-category?parent_id=${encodeURIComponent(v.parent_id ?? '')}`,
};
