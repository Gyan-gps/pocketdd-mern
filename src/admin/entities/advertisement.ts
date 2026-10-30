// Port of App\Http\Controllers\Admin\AdvertismentCrudController (+ AdvertismentRequest / AdvertismentUpdateRequest).
// Operations: List, Create, Update, Show (Delete/Reorder commented out).
// Model Advertisment: $guarded ['id'], casts from_date/to_date `date`, sub_category_name `array`.
// Quirks kept:
//  - `vaild_till` and `ads_location_hidden` are form fields but not columns → dropped by mass assignment;
//  - `client_name` stores the business id; the list searches it with LIKE as text;
//  - store() dispatches SendAdvertisementNotification($id, $request->client_name) only when from_date == today.
import { CASE_INSENSITIVE } from '../../db/eloquent.js';
import { toRows, type Row } from '../../db/mongo.js';
import { dispatchJob } from '../../jobs/queue.js';
import { Advertisement, Business, BusinessSubCategory } from '../../models/index.js';
import {
  createAdvertisementValidation,
  updateAdvertisementValidation,
} from '../../validators/admin/advertisement.validator.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import {
  castDateTime,
  coerceRow,
  dateRange,
  dateSearch,
  eqFilter,
  findById,
  intIds,
  newRow,
  onlyColumns,
  setTreeColumns,
  storeCoerced,
  todayIst,
  withKeyDesc,
  ymd,
} from '../support/catalog-helpers.js';

const TABLE = 'advertisments';
const UPLOAD_DIR = 'uploads/adv_images';

const FIELDS = [
  'client_name',
  'ads_position',
  'ads_location',
  'sub_category_name',
  'from_date',
  'vaild_till',
  'to_date',
  'advt_img',
  'fees_type',
  'amount',
  'status',
  'ads_location_hidden',
];

/** Model casts on write: dates → `Y-m-d H:i:s`; the `array` cast value is stored natively. */
function castWrite(data: Record<string, unknown>) {
  const out = { ...data };
  // PHP request parsing: `x=` followed by `x[]=A` replaces the scalar with the array; multer's
  // append-field keeps the scalar as a leading element ('' → null after ConvertEmptyStringsToNull).
  if (Array.isArray(out.sub_category_name) && out.sub_category_name.length > 0 && (out.sub_category_name[0] ?? null) === null) {
    out.sub_category_name = out.sub_category_name.slice(1);
  }
  for (const field of ['from_date', 'to_date']) if (field in out) out[field] = castDateTime(out[field]);
  return out;
}

async function businessName(id: unknown): Promise<string | null> {
  const business = await findById('businesses', id, { business_name_en: 1 });
  return business ? (business.business_name_en as string | null) : null;
}

export const advertisement: CrudConfig = {
  route: 'advertisment', // URL kept as in Laravel (Route::crud('advertisment'))
  collection: 'advertisements',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    orderBy: withKeyDesc([['client_name', 'asc']]), // CRUD::addClause('orderBy', 'client_name', 'asc')
    searchable: ['client_name', 'fees_type', 'amount', 'ads_position', 'ads_location'],
    searchExtra: dateSearch(['from_date', 'to_date']),
    sortable: ['client_name', 'advt_img', 'from_date', 'to_date', 'fees_type', 'amount', 'ads_position', 'ads_location', 'status'],
    filters: (input) => {
      let orderBy: Array<[string, 'asc' | 'desc']> | undefined;
      if ('sorting' in input) {
        orderBy =
          input.sorting === 'newest' ? [['created_at', 'desc']] : input.sorting === 'oldest' ? [['created_at', 'asc']] : [];
      }
      return {
        where: [...eqFilter(input, 'client_name'), ...(input.from_date ? dateRange('from_date', input.from_date) : [])],
        orderBy: orderBy ? withKeyDesc(orderBy) : undefined,
      };
    },
    filterOptions: async () => {
      // Business::whereIn('id', Advertisment::pluck('client_name')->unique())->pluck('business_name_en', 'id')
      const names = await Advertisement.distinct('client_name', { client_name: { $ne: null } });
      const businesses = toRows(
        await Business.find({ _id: { $in: intIds(names) } }, { business_name_en: 1 }).sort({ _id: 1 }).lean<Row[]>(),
      );
      return {
        client_name: businesses.map((business) => ({
          value: String(business.id),
          label: business.business_name_en === null ? '' : String(business.business_name_en),
        })),
        sorting: [
          { value: 'newest', label: 'Newest First' },
          { value: 'oldest', label: 'Oldest First' },
        ],
      };
    },
  },
  formOptions: async (req, id) => {
    const clientId = id ? null : req.query.client_name;
    const ids = clientId ? intIds([clientId]) : null;
    const businesses = toRows(
      await Business.find({ status: 1, ...(ids ? { _id: { $in: ids } } : {}) }, { business_name_en: 1 })
        .sort({ _id: 1 })
        .lean<Row[]>(),
    );
    const subCategories = toRows(
      await BusinessSubCategory.find({ status: 1 }, { name: 1 })
        .collation(CASE_INSENSITIVE)
        .sort({ name: 1, _id: 1 })
        .lean<Row[]>(),
    );
    const seen = new Map<string, string>();
    for (const subCategory of subCategories) seen.set(String(subCategory.name ?? ''), String(subCategory.name ?? ''));
    return {
      client_name: businesses.map((business) => ({
        value: String(business.id),
        label: business.business_name_en === null ? '' : String(business.business_name_en),
      })),
      sub_category_name: [...seen].map(([value, label]) => ({ value, label })),
    };
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: createAdvertisementValidation, update: updateAdvertisementValidation },
  casts: { status: 'boolean' },
  serialize: async ({ subcategories: _embedded, ...row }: Row) => {
    let subCategoryNames: unknown = row.sub_category_name;
    if (typeof subCategoryNames === 'string') {
      try {
        subCategoryNames = JSON.parse(subCategoryNames);
      } catch {
        /* raw */
      }
    }
    return {
      ...row,
      from_date: ymd(row.from_date),
      to_date: ymd(row.to_date),
      sub_category_name: subCategoryNames,
      // list column value: Business::where('id', client_name)->first()->business_name_en ?? '-'
      business_name_en: await businessName(row.client_name),
      ads_location_hidden: row.ads_location,
    };
  },
  hooks: {
    beforeCreate: async (data, req) => {
      const out = castWrite(await onlyColumns(TABLE, data));
      applySingleUpload(out, req.input, 'advt_img', UPLOAD_DIR, null);
      return newRow(TABLE, out);
    },
    afterCreate: async (id, _data, req) => {
      await setTreeColumns(TABLE, id);
      const fromDate = req.input.from_date;
      if (fromDate !== null && fromDate !== undefined && String(fromDate) === todayIst()) {
        await dispatchJob('SendAdvertisementNotification', id, req.input.client_name ?? null);
      }
    },
    beforeUpdate: async (data, existing, req) => {
      const out = castWrite(await onlyColumns(TABLE, data));
      // `array` cast: originalIsEquivalent() compares the decoded values.
      if (JSON.stringify(out.sub_category_name) === JSON.stringify(existing.sub_category_name)) delete out.sub_category_name;
      applySingleUpload(out, req.input, 'advt_img', UPLOAD_DIR, existing.advt_img);
      coerceRow(TABLE, out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced(TABLE, id, data),
  },
};
