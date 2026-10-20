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
import { fetchPincodes, namesById, pluckOptions } from '../phase9a-support.js';

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
const RULES = { business_id: 'required', business_email: 'required|email', business_mobile_number: 'required|digits:10' };
const TRANSLATABLE = ['description', 'summaries'];

/** Spatie HasTranslations::setTranslation($key, 'en', $value) → json_encode(..., UNESCAPED_UNICODE|SLASHES). */
function translate(data: Record<string, unknown>, existing: Record<string, unknown> | null) {
  const out = { ...data };
  for (const key of TRANSLATABLE) {
    if (!(key in out)) continue;
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
    translations.en = out[key] ?? null;
    out[key] = JSON.stringify(translations);
  }
  return out;
}

export const businessDetail: CrudConfig = {
  route: 'business-detail',
  table: 'business_details',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // business_id is select2 (not searched); email + inferred `text` columns are.
    searchable: ['business_email', 'business_mobile_number', 'pincode', 'district', 'state'],
    sortable: ['business_id', 'business_email', 'business_mobile_number', 'pincode', 'district', 'state'],
    filters: (input) => {
      const where: Array<{ sql: string; params: unknown[] }> = [];
      if (input.business_id) where.push({ sql: '`business_id` = ?', params: [input.business_id] });
      // Laravel quirk: columns that do not exist on business_details.
      if (input.business_category__id) where.push({ sql: '`business_category_id` = ?', params: [input.business_category__id] });
      if (input.business_sub_category_id) where.push({ sql: '`business_sub_category_id` = ?', params: [input.business_sub_category_id] });
      return { where };
    },
    filterOptions: async () => ({
      business_id: await pluckOptions("SELECT DISTINCT name AS l, id AS v FROM businesses WHERE status = '1'"),
      business_category__id: await pluckOptions("SELECT DISTINCT name AS l, id AS v FROM business_categories WHERE status = '1'"),
      business_sub_category_id: await pluckOptions("SELECT DISTINCT name AS l, id AS v FROM business_sub_categories WHERE status = '1'"),
    }),
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: { rules: RULES }, update: { rules: RULES } },
  redirect: { create: 'business', update: 'business' },
  formOptions: async (_req, id) => {
    if (!id) {
      return {
        business_id: await pluckOptions(
          'SELECT id AS v, name AS l FROM businesses WHERE id NOT IN (SELECT business_id FROM business_details) ORDER BY id DESC',
        ),
      };
    }
    return {
      business_id: await pluckOptions(
        'SELECT id AS v, name AS l FROM businesses WHERE id NOT IN (SELECT business_id FROM business_details WHERE business_id <> (SELECT business_id FROM business_details WHERE id = ?))',
        [id],
      ),
    };
  },
  routes: (r) => {
    r.post('/fetch/pincode', (req, res, next) => fetchPincodes(req, res).catch(next));
  },
  serialize: async (row) => {
    const names = await namesById('businesses', 'name', [row.business_id]);
    // Translatable attributes read in the current locale (en, falling back to the raw value), like the edit form.
    const en = (v: unknown) => {
      if (typeof v !== 'string') return v ?? null;
      try {
        const p = JSON.parse(v);
        return p && typeof p === 'object' && !Array.isArray(p) ? (p.en ?? null) : v;
      } catch {
        return v;
      }
    };
    return { ...row, description: en(row.description), summaries: en(row.summaries), business_name: names.get(String(row.business_id)) ?? null };
  },
  hooks: {
    beforeCreate: (data) => translate(data, null),
    beforeUpdate: (data, existing) => translate(data, existing),
  },
};

/** `Route::get('admin/business-detail/fetch/pincode', [BusinessDetailCrudController::class, 'fetchPincode'])`. */
export const businessDetailExtraRoutes = Router();
businessDetailExtraRoutes.get('/admin/business-detail/fetch/pincode', adminAuth, (req, res, next) => fetchPincodes(req, res).catch(next));
