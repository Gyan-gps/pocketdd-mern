// Port of App\Http\Controllers\Admin\BusinessDetailCrudController (+ BusinessDetailRequest / BusinessDetailUpdateRequest).
// Operations: List, Create, Update, Show, Fetch (POST business-detail/fetch/pincode, plus the custom
// GET admin/business-detail/fetch/pincode route). store()/update() redirect to `business`.
// Model BusinessDetail: HasTranslations on description + summaries → stored as {"en": value} (app locale en),
// other locales already in the column are kept.
// Laravel quirks kept:
//  - filters business_category__id / business_sub_category_id add `where business_category_id|business_sub_category_id`
//    on business_details, which has no such columns → QueryException (500) when used;
//  - the update form's business_id options exclude businesses that already have a detail, except the current one.
// Not replicated: the edit page 500s ("Call to a member function getKey() on string") when the row's `pincode`
// column is non-empty (rows created by the mobile API) — the API GET is shared with the show page.
import { Router } from 'express';
import type { CrudConfig } from '../crud.js';
import { adminAuth } from '../auth.js';
import { intId, type Row } from '../../db/mongo.js';
import { Business, BusinessCategory, BusinessSubCategory } from '../../models/index.js';
import { businessDetailValidation } from '../../validators/admin/business-detail.validator.js';
import { fetchPincodes } from '../support/business-helpers.js';
import { coerceRow, fieldById, idOptions, looseInt, newRow } from './business-columns.js';

const FIELDS = [
  'business_id',
  'pincode_id',
  'state',
  'district',
  'business_mobile_number',
  'business_email',
  'other_partner_name',
  'address_line',
  'street_address',
  'post',
  'tahsil',
  'description',
  'summaries',
];
const TRANSLATABLE = ['description', 'summaries'];

/** Spatie HasTranslations::setTranslation($key, 'en', $value) → json_encode(..., UNESCAPED_UNICODE|SLASHES). */
function translate(data: Record<string, unknown>, existing: Record<string, unknown> | null) {
  const translated = { ...data };
  for (const key of TRANSLATABLE) {
    if (!(key in translated)) continue;
    let translations: Record<string, unknown> = {};
    const raw = existing?.[key];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) translations = parsed;
      } catch {
        /* non-JSON legacy value → replaced */
      }
    }
    translations.en = translated[key] ?? null;
    translated[key] = JSON.stringify(translations);
  }
  return translated;
}

export const businessDetail: CrudConfig = {
  route: 'business-detail',
  embedded: 'business_details',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // business_id is select2 (not searched); email + inferred `text` columns are.
    searchable: ['business_email', 'business_mobile_number', 'pincode', 'district', 'state'],
    sortable: ['business_id', 'business_email', 'business_mobile_number', 'pincode', 'district', 'state'],
    filters: (input) => {
      // Laravel quirk: columns that do not exist on business_details (MySQL: SQLSTATE[42S22] → 500).
      for (const [key, column] of [['business_category__id', 'business_category_id'], ['business_sub_category_id', 'business_sub_category_id']]) {
        if (input[key!]) throw new Error(`SQLSTATE[42S22]: Column not found: 1054 Unknown column '${column}' in 'where clause'`);
      }
      return { where: input.business_id ? [{ business_id: looseInt(input.business_id) }] : [] };
    },
    filterOptions: async () => ({
      business_id: await idOptions(Business, { status: 1 }, 'name'),
      business_category__id: await idOptions(BusinessCategory, { status: 1 }, 'name'),
      business_sub_category_id: await idOptions(BusinessSubCategory, { status: 1 }, 'name'),
    }),
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: businessDetailValidation, update: businessDetailValidation },
  redirect: { create: 'business', update: 'business' },
  formOptions: async (_req, id) => {
    if (!id) {
      return { business_id: await idOptions(Business, { 'details.0': { $exists: false } }, 'name', { _id: -1 }) };
    }
    // `business_id <> NULL` (unknown detail id) matches nothing → every business.
    const detailId = intId(id);
    const owner = detailId === null ? null : await Business.findOne({ 'details.id': detailId }, { _id: 1 }).lean<Row>();
    return {
      business_id: await idOptions(Business, owner ? { $or: [{ 'details.0': { $exists: false } }, { _id: owner._id }] } : {}, 'name'),
    };
  },
  routes: (router) => {
    router.post('/fetch/pincode', (req, res, next) => fetchPincodes(req, res).catch(next));
  },
  serialize: async (row) => {
    const business = await fieldById(Business, row.business_id, 'name');
    // Translatable attributes read in the current locale (en, falling back to the raw value), like the edit form.
    const english = (value: unknown) => {
      if (typeof value !== 'string') return value ?? null;
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed.en ?? null) : value;
      } catch {
        return value;
      }
    };
    return {
      ...row,
      description: english(row.description),
      summaries: english(row.summaries),
      business_name: business ? business.value : null,
    };

  },
  hooks: {
    beforeCreate: (data) => newRow('business_details', translate(data, null)),
    beforeUpdate: (data, existing) => coerceRow('business_details', translate(data, existing)),
  },
};

/** `Route::get('admin/business-detail/fetch/pincode', [BusinessDetailCrudController::class, 'fetchPincode'])`. */
export const businessDetailExtraRoutes = Router();
businessDetailExtraRoutes.get('/admin/business-detail/fetch/pincode', adminAuth, (req, res, next) => fetchPincodes(req, res).catch(next));
