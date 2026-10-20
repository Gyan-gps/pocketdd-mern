// Port of App\Http\Controllers\Admin\BusinessCategoryCrudController (+ BusinessCategoryRequest /
// BusinessCategoryUpdateRequest). Operations: List, Create, Update, Show (Delete/Reorder commented out).
// Model BusinessCategory: $guarded ['id'], Sluggable source `slug_or_name` (no accessor → blank slug stays NULL).
// The import routes (import-category-data / insertCategoryData) live in ../catalog-imports.ts.
import type { Row } from '../../db/pool.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import {
  all,
  eqFilter,
  first,
  pluckOptions,
  setTreeColumns,
  slugOrNull,
  sortingFilter,
  STATUS_FILTER,
  withKeyDesc,
} from '../support/catalog-helpers.js';

const MESSAGES = {
  'name.required': 'Business Category Name is required.',
  'name.string': 'Business Category Name must be a valid string.',
  'name.max': 'Business Category Name must not exceed 255 characters.',
  'name.unique': 'This Business Category Name already exists.',
  'name_hi.required': 'Business Category Name (Hindi) is required.',
  'name_hi.string': 'Business Category Name (Hindi) must be a valid string.',
  'name_hi.max': 'Business Category Name (Hindi) must not exceed 255 characters.',
  'img.required': 'Category image is required.',
  'img.image': 'The uploaded file must be an image.',
  'img.mimes': 'Only PNG, JPG, JPEG, and SVG formats are allowed.',
  'img.max': 'Image size must not exceed 2MB.',
};

const FIELDS = ['name', 'name_hi', 'img', 'slug', 'status'];
const UPLOAD_DIR = 'uploads/category_images';

/** `BusinessSubCategory::where('parent_id', $id)->pluck($col)` → implode(', ') or 'NA'. */
async function subCategoryList(id: unknown, col: 'name' | 'name_hi'): Promise<string> {
  const rows = await all(`SELECT \`${col}\` AS v FROM business_sub_categories WHERE parent_id = ?`, [id]);
  return rows.length ? rows.map((r) => (r.v === null ? '' : String(r.v))).join(', ') : 'NA';
}

export const businessCategory: CrudConfig = {
  route: 'business-category',
  table: 'business_categories',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    where: { sql: '`parent_id` IS NULL' }, // CRUD::addClause('whereNull', 'parent_id')
    // `if (!request()->has('sorting')) orderBy('name', 'asc')`, then Backpack's key DESC tie-breaker.
    orderBy: withKeyDesc([['name', 'asc']]),
    searchable: ['name', 'name_hi'], // text columns; img (image) and status (closure) are not searched
    sortable: ['name', 'name_hi', 'img', 'status'],
    filters: (q) => ({
      where: [...eqFilter(q, 'name'), ...eqFilter(q, 'name_hi'), ...eqFilter(q, 'status')],
      orderBy: withKeyDesc(sortingFilter(q, [['name', 'asc']])),
    }),
    filterOptions: async () => ({
      name: pluckOptions(await all('SELECT name FROM business_categories ORDER BY name ASC'), 'name', 'name'),
      name_hi: pluckOptions(await all('SELECT name_hi FROM business_categories ORDER BY name ASC'), 'name_hi', 'name_hi'),
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
  validation: {
    create: {
      rules: {
        name: 'required|string|max:255|unique:business_categories,name',
        name_hi: 'required|string|max:255',
        img: 'required|image|mimes:png,jpg,jpeg,svg|max:2048',
      },
      messages: MESSAGES,
    },
    update: {
      rules: {
        name: 'required|string|max:255',
        name_hi: 'required|string|max:255',
        img: 'nullable|image|mimes:png,jpg,jpeg,svg|max:2048',
      },
      messages: MESSAGES,
    },
  },
  casts: { status: 'boolean' },
  serialize: async (row: Row) => ({
    ...row,
    // addSubCategory / showSubCategory line buttons (showSubCategory only when sub-categories exist).
    has_sub_categories: !!(await first('SELECT 1 AS x FROM business_sub_categories WHERE parent_id = ? LIMIT 1', [row.id])),
    // setupShowOperation computed columns.
    sub_category: await subCategoryList(row.id, 'name'),
    sub_category_hindi: await subCategoryList(row.id, 'name_hi'),
  }),
  hooks: {
    beforeCreate: (data, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, null);
      return out;
    },
    // store(): BusinessCategory::find($id)->update(['lft' => $id + 1, 'rgt' => $id + 1, 'depth' => 1]).
    afterCreate: (id) => setTreeColumns('business_categories', id),
    beforeUpdate: (data, existing, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, existing.img);
      return out;
    },
  },
};
