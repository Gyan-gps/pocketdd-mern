// Port of App\Http\Controllers\Admin\BusinessSubCategoryCrudController (+ BusinessSubCategoryRequest /
// BusinessSubCategoryUpdateRequest). Operations: List, Create, Update (ShowOperation is commented out).
// Model BusinessSubCategory: $guarded ['id'], Sluggable `slug_or_name` (blank slug stays NULL).
// Quirks kept:
//  - update validates `parent_id_display` (an editable select) but saves the hidden `parent_id` field,
//    so changing the category on the edit form has no effect;
//  - the list `parent_id` relationship column is not searched (column type `relationship` has no search logic);
//  - `parent_id` falls back to url()->previous()'s query string in Laravel (session state) — not reproducible
//    over a stateless API; the UI always passes ?parent_id explicitly.
import { intId, type Row } from '../../db/mongo.js';
import { BusinessCategory, BusinessSubCategory } from '../../models/index.js';
import {
  createBusinessSubCategoryValidation,
  updateBusinessSubCategoryValidation,
} from '../../validators/admin/business-sub-category.validator.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { slugOrNull, sortingFilter, withKeyDesc } from '../support/catalog-helpers.js';
import { cascadeSubCategories, coerceRow, eqFilter, newRow, onlyColumns, selectSorted, setTreeColumns, sqlId } from './business-columns.js';

const TABLE = 'business_sub_categories';
const UPLOAD_DIR = 'uploads/sub-category_images';

/** `SELECT id, name FROM business_categories WHERE id = ?`. */
async function category(id: unknown) {
  const categoryId = sqlId(id);
  const found = categoryId === null ? null : await BusinessCategory.findOne({ _id: categoryId }, { name: 1 }).lean<Row>();
  return found ? { id: found._id, name: found.name ?? null } : null;
}

export const businessSubCategory: CrudConfig = {
  route: 'business-sub-category',
  collection: TABLE,
  operations: ['list', 'create', 'update'],
  list: {
    where: { parent_id: { $ne: null } }, // CRUD::addClause('whereNotNull', 'parent_id')
    orderBy: withKeyDesc([['name', 'asc']]),
    searchable: ['name', 'name_hi'],
    sortable: ['parent_id', 'name', 'name_hi', 'img', 'status'],
    filters: (input) => ({
      where: [...eqFilter(input, 'parent_id'), ...eqFilter(input, 'status')],
      orderBy: withKeyDesc(sortingFilter(input, [['name', 'asc']])),
    }),
    filterOptions: async () => ({
      // BusinessCategory::whereNull('parent_id')->orWhere('parent_id', 0)->pluck('name', 'id')
      parent_id: (await selectSorted('business_categories', ['name'], { parent_id: { $in: [null, 0] } })).map((category) => ({
        value: String(category.id),
        label: category.name === null ? '' : String(category.name),
      })),
      status: [
        { value: '0', label: 'InActive' },
        { value: '1', label: 'Active' },
      ],
      sorting: [
        { value: 'a_z', label: 'Name (A - Z)' },
        { value: 'z_a', label: 'Name (Z - A)' },
        { value: 'newest', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
      ],
    }),
  },
  // create: select_from_array options = only the category given by ?parent_id; update: parent_id_display = current parent.
  formOptions: async (req, id): Promise<Record<string, Array<{ value: string; label: string }>>> => {
    if (id) {
      const subCategoryId = intId(id);
      const row =
        subCategoryId === null ? null : await BusinessSubCategory.findOne({ _id: subCategoryId }, { parent_id: 1 }).lean<Row>();
      const parent = row?.parent_id ? await category(row.parent_id) : null;
      return { parent_id_display: parent ? [{ value: String(parent.id), label: String(parent.name ?? '') }] : [] };
    }
    const parentId = req.query.parent_id;
    const parent = parentId && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(parentId)) ? await category(String(parentId)) : null;
    return { parent_id: parent ? [{ value: String(parent.id), label: String(parent.name ?? '') }] : [] };
  },
  fields: {
    create: ['parent_id', 'name', 'name_hi', 'img', 'slug', 'status'],
    update: ['parent_id_display', 'name', 'name_hi', 'img', 'slug', 'status', 'parent_id'],
  },
  validation: { create: createBusinessSubCategoryValidation, update: updateBusinessSubCategoryValidation },
  casts: { status: 'boolean' },
  serialize: async (row: Row) => {
    const parent = row.parent_id ? await category(row.parent_id) : null;
    return { ...row, parent_name: parent ? parent.name : null, parent_id_display: row.parent_id };
  },
  hooks: {
    beforeCreate: async (data, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, null);
      return newRow(TABLE, out);
    },
    afterCreate: (id) => setTreeColumns(TABLE, id),
    beforeUpdate: async (data, existing, req) => {
      // parent_id_display is not a column → dropped by Eloquent mass assignment.
      const out = onlyColumns(TABLE, slugOrNull(data));
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, existing.img);
      return coerceRow(TABLE, out);
    },
    // No DeleteOperation in the controller; the old ON DELETE CASCADE, should one be enabled.
    beforeDelete: (existing) => cascadeSubCategories([existing.id as number]),
  },
};
