// Port of App\Http\Controllers\Admin\BusinessCategoryCrudController (+ BusinessCategoryRequest /
// BusinessCategoryUpdateRequest). Operations: List, Create, Update, Show (Delete/Reorder commented out).
// Model BusinessCategory: $guarded ['id'], Sluggable source `slug_or_name` (no accessor → blank slug stays NULL).
// The import routes (import-category-data / insertCategoryData) live in ../catalog-imports.ts.
import type { Row } from '../../db/mongo.js';
import { BusinessSubCategory } from '../../models/index.js';
import {
  createBusinessCategoryValidation,
  updateBusinessCategoryValidation,
} from '../../validators/admin/business-category.validator.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { pluckOptions, slugOrNull, sortingFilter, STATUS_FILTER, withKeyDesc } from '../support/catalog-helpers.js';
import { cascadeCategory, coerceRow, eqFilter, newRow, selectSorted, setTreeColumns } from './business-columns.js';

const FIELDS = ['name', 'name_hi', 'img', 'slug', 'status'];
const UPLOAD_DIR = 'uploads/category_images';

/** `BusinessSubCategory::where('parent_id', $id)->pluck($col)` → implode(', ') or 'NA'. */
async function subCategoryList(id: unknown, field: 'name' | 'name_hi'): Promise<string> {
  const rows = await selectSorted('business_sub_categories', [field], { parent_id: id });
  return rows.length
    ? rows.map((row) => (row[field] === null || row[field] === undefined ? '' : String(row[field]))).join(', ')
    : 'NA';
}

export const businessCategory: CrudConfig = {
  route: 'business-category',
  collection: 'business_categories',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    where: { parent_id: null }, // CRUD::addClause('whereNull', 'parent_id')
    // `if (!request()->has('sorting')) orderBy('name', 'asc')`, then Backpack's key DESC tie-breaker.
    orderBy: withKeyDesc([['name', 'asc']]),
    searchable: ['name', 'name_hi'], // text columns; img (image) and status (closure) are not searched
    sortable: ['name', 'name_hi', 'img', 'status'],
    filters: (input) => ({
      where: [...eqFilter(input, 'name'), ...eqFilter(input, 'name_hi'), ...eqFilter(input, 'status')],
      orderBy: withKeyDesc(sortingFilter(input, [['name', 'asc']])),
    }),
    filterOptions: async () => ({
      name: pluckOptions(await selectSorted('business_categories', ['name'], {}, { name: 1 }), 'name', 'name'),
      name_hi: pluckOptions(await selectSorted('business_categories', ['name_hi', 'name'], {}, { name: 1 }), 'name_hi', 'name_hi'),
      status: STATUS_FILTER,
      sorting: [
        { value: 'a_z', label: 'Name (A - Z)' },
        { value: 'z_a', label: 'Name (Z - A)' },
        { value: 'newest', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
      ],
    }),
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: createBusinessCategoryValidation, update: updateBusinessCategoryValidation },
  casts: { status: 'boolean' },
  serialize: async (row: Row) => ({
    ...row,
    // addSubCategory / showSubCategory line buttons (showSubCategory only when sub-categories exist).
    has_sub_categories: !!(await BusinessSubCategory.findOne({ parent_id: row.id }, { _id: 1 }).lean()),
    // setupShowOperation computed columns.
    sub_category: await subCategoryList(row.id, 'name'),
    sub_category_hindi: await subCategoryList(row.id, 'name_hi'),
  }),
  hooks: {
    beforeCreate: (data, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, null);
      return newRow('business_categories', out);
    },
    // store(): BusinessCategory::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1]).
    afterCreate: (id) => setTreeColumns('business_categories', id),
    beforeUpdate: (data, existing, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, existing.img);
      return coerceRow('business_categories', out);
    },
    // No DeleteOperation in the controller; the old ON DELETE CASCADE, should one be enabled.
    beforeDelete: (existing) => cascadeCategory(existing.id as number),
  },
};
