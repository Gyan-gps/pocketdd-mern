// Port of App\Http\Controllers\Admin\BusinessSubCategoryCrudController (+ BusinessSubCategoryRequest /
// BusinessSubCategoryUpdateRequest). Operations: List, Create, Update (ShowOperation is commented out).
// Model BusinessSubCategory: $guarded ['id'], Sluggable `slug_or_name` (blank slug stays NULL).
// Quirks kept:
//  - update validates `parent_id_display` (an editable select) but saves the hidden `parent_id` field,
//    so changing the category on the edit form has no effect;
//  - the list `parent_id` relationship column is not searched (column type `relationship` has no search logic);
//  - `parent_id` falls back to url()->previous()'s query string in Laravel (session state) — not reproducible
//    over a stateless API; the UI always passes ?parent_id explicitly.
import type { Row } from '../../db/pool.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import {
  all,
  eqFilter,
  first,
  onlyColumns,
  setTreeColumns,
  slugOrNull,
  sortingFilter,
  withKeyDesc,
} from '../support/catalog-helpers.js';

const MESSAGES_CREATE = {
  'parent_id.required': 'Please select a category.',
  'parent_id.exists': 'Selected category does not exist.',
  'name.required': 'Sub-category name is required.',
  'name.string': 'Sub-category name must be a valid string.',
  'name.unique': 'This sub-category name already exists.',
  'name_hi.required': 'Sub-category name (Hindi) is required.',
  'img.required': 'Sub-category image is required.',
  'img.image': 'Image must be a valid image format.',
  'img.mimes': 'Allowed image types: png, jpg, jpeg, svg.',
  'img.max': 'Image size must be less than 2MB.',
};

const MESSAGES_UPDATE = {
  'parent_id_display.required': 'Please select a category.',
  'parent_id_display.exists': 'Selected category does not exist.',
  'name.required': 'Sub-category name is required.',
  'name.string': 'Sub-category name must be a valid string.',
  'name_hi.required': 'Sub-category name (Hindi) is required.',
  'img.image': 'Image must be a valid image format.',
  'img.mimes': 'Allowed image types: png, jpg, jpeg, svg.',
  'img.max': 'Image size must be less than 2MB.',
};

const TABLE = 'business_sub_categories';
const UPLOAD_DIR = 'uploads/sub-category_images';

export const businessSubCategory: CrudConfig = {
  route: 'business-sub-category',
  table: TABLE,
  operations: ['list', 'create', 'update'],
  list: {
    where: { sql: '`parent_id` IS NOT NULL' }, // CRUD::addClause('whereNotNull', 'parent_id')
    orderBy: withKeyDesc([['name', 'asc']]),
    searchable: ['name', 'name_hi'],
    sortable: ['parent_id', 'name', 'name_hi', 'img', 'status'],
    filters: (q) => ({
      where: [...eqFilter(q, 'parent_id'), ...eqFilter(q, 'status')],
      orderBy: withKeyDesc(sortingFilter(q, [['name', 'asc']])),
    }),
    filterOptions: async () => ({
      // BusinessCategory::whereNull('parent_id')->orWhere('parent_id', 0)->pluck('name', 'id')
      parent_id: (await all('SELECT id, name FROM business_categories WHERE parent_id IS NULL OR parent_id = 0')).map((r) => ({
        value: String(r.id),
        label: r.name === null ? '' : String(r.name),
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
      const row = await first(`SELECT parent_id FROM ${TABLE} WHERE id = ?`, [id]);
      const cat = row?.parent_id ? await first('SELECT id, name FROM business_categories WHERE id = ?', [row.parent_id]) : null;
      return { parent_id_display: cat ? [{ value: String(cat.id), label: String(cat.name ?? '') }] : [] };
    }
    const parentId = req.query.parent_id;
    const cat =
      parentId && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(parentId))
        ? await first('SELECT id, name FROM business_categories WHERE id = ?', [String(parentId)])
        : null;
    return { parent_id: cat ? [{ value: String(cat.id), label: String(cat.name ?? '') }] : [] };
  },
  fields: {
    create: ['parent_id', 'name', 'name_hi', 'img', 'slug', 'status'],
    update: ['parent_id_display', 'name', 'name_hi', 'img', 'slug', 'status', 'parent_id'],
  },
  validation: {
    create: {
      rules: {
        name: 'required|string|max:255|unique:business_sub_categories,name',
        name_hi: 'required|string|max:255',
        img: 'required|image|mimes:png,jpg,jpeg,svg|max:2048',
        parent_id: 'required|exists:business_categories,id',
      },
      messages: MESSAGES_CREATE,
    },
    update: {
      rules: {
        name: 'required|string|max:255',
        name_hi: 'required|string|max:255',
        img: 'nullable|image|mimes:png,jpg,jpeg,svg|max:2048',
        parent_id_display: 'required|exists:business_categories,id',
      },
      messages: MESSAGES_UPDATE,
    },
  },
  casts: { status: 'boolean' },
  serialize: async (row: Row) => {
    const parent = row.parent_id ? await first('SELECT name FROM business_categories WHERE id = ?', [row.parent_id]) : null;
    return { ...row, parent_name: parent ? parent.name : null, parent_id_display: row.parent_id };
  },
  hooks: {
    beforeCreate: async (data, req) => {
      const out = slugOrNull(data);
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, null);
      return out;
    },
    afterCreate: (id) => setTreeColumns(TABLE, id),
    beforeUpdate: async (data, existing, req) => {
      // parent_id_display is not a column → dropped by Eloquent mass assignment.
      const out = await onlyColumns(TABLE, slugOrNull(data));
      applySingleUpload(out, req.input, 'img', UPLOAD_DIR, existing.img);
      return out;
    },
  },
};
