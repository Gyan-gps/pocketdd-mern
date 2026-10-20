// Port of App\Http\Controllers\Admin\AdvertismentCrudController (+ AdvertismentRequest / AdvertismentUpdateRequest).
// Operations: List, Create, Update, Show (Delete/Reorder commented out).
// Model Advertisment: $guarded ['id'], casts from_date/to_date `date`, sub_category_name `array`.
// Quirks kept:
//  - `vaild_till` and `ads_location_hidden` are form fields but not columns → dropped by mass assignment;
//  - `client_name` stores the business id; the list searches it with LIKE as text;
//  - store() dispatches SendAdvertisementNotification($id, $request->client_name) only when from_date == today.
import type { Row } from '../../db/pool.js';
import { phpJsonEncode } from '../../services/firebase.js';
import { dispatchJob } from '../../jobs/dispatch.js';
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import {
  all,
  castDateTime,
  dateRange,
  dateSearch,
  eqFilter,
  first,
  onlyColumns,
  setTreeColumns,
  todayIst,
  withKeyDesc,
  ymd,
} from '../support/catalog-helpers.js';

const TABLE = 'advertisments';
const UPLOAD_DIR = 'uploads/adv_images';

const MESSAGES = {
  'ads_position.required': 'Please select a banner type.',
  'client_name.required': 'Client name is required.',
  'client_name.min': 'Client name must be at least 2 characters.',
  'client_name.max': 'Client name may not exceed 255 characters.',
  'ads_location.required': 'Please select an ad location.',
  'advt_img.required': 'Advertisement image is required.',
  'advt_img.image': 'The uploaded file must be an image.',
  'advt_img.mimes': 'Only PNG, JPG, JPEG, and SVG images are allowed.',
  'advt_img.max': 'Image size must not exceed 2MB.',
  'from_date.required': 'From date is required.',
  'from_date.date': 'From date must be a valid date.',
  'vaild_till.required': 'Please select a valid duration.',
  'to_date.required': 'To date is required.',
  'to_date.date': 'To date must be a valid date.',
  'to_date.after_or_equal': 'To date must be after or equal to From date.',
  'url.url': 'Please enter a valid URL.',
};

const rules = (img: string) => ({
  ads_position: 'required',
  client_name: 'required',
  ads_location: 'required',
  advt_img: img,
  from_date: 'required|date',
  vaild_till: 'required',
  fees_type: 'required',
  to_date: 'required|date|after_or_equal:from_date',
  url: 'nullable|url',
});

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

/** Model casts on write: dates → `Y-m-d H:i:s`, `array` → json_encode (null stays null). */
function castWrite(data: Record<string, unknown>) {
  const out = { ...data };
  // PHP request parsing: `x=` followed by `x[]=A` replaces the scalar with the array; multer's
  // append-field keeps the scalar as a leading element ('' → null after ConvertEmptyStringsToNull).
  if (Array.isArray(out.sub_category_name) && out.sub_category_name.length > 0 && (out.sub_category_name[0] ?? null) === null) {
    out.sub_category_name = out.sub_category_name.slice(1);
  }
  for (const k of ['from_date', 'to_date']) if (k in out) out[k] = castDateTime(out[k]);
  if ('sub_category_name' in out && out.sub_category_name !== null && out.sub_category_name !== undefined) {
    out.sub_category_name = phpJsonEncode(out.sub_category_name);
  }
  return out;
}

async function businessName(id: unknown): Promise<string | null> {
  const b = await first('SELECT business_name_en FROM businesses WHERE id = ? LIMIT 1', [id]);
  return b ? (b.business_name_en as string | null) : null;
}

export const advertisment: CrudConfig = {
  route: 'advertisment',
  table: TABLE,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    orderBy: withKeyDesc([['client_name', 'asc']]), // CRUD::addClause('orderBy', 'client_name', 'asc')
    searchable: ['client_name', 'fees_type', 'amount', 'ads_position', 'ads_location'],
    searchExtra: dateSearch(['from_date', 'to_date']),
    sortable: ['client_name', 'advt_img', 'from_date', 'to_date', 'fees_type', 'amount', 'ads_position', 'ads_location', 'status'],
    filters: (q) => {
      let orderBy: Array<[string, 'asc' | 'desc']> | undefined;
      if ('sorting' in q) {
        orderBy = q.sorting === 'newest' ? [['created_at', 'desc']] : q.sorting === 'oldest' ? [['created_at', 'asc']] : [];
      }
      return {
        where: [...eqFilter(q, 'client_name'), ...(q.from_date ? dateRange('from_date', q.from_date) : [])],
        orderBy: orderBy ? withKeyDesc(orderBy) : undefined,
      };
    },
    filterOptions: async () => {
      // Business::whereIn('id', Advertisment::pluck('client_name')->unique())->pluck('business_name_en', 'id')
      const rows = await all(
        'SELECT id, business_name_en FROM businesses WHERE id IN (SELECT client_name FROM advertisments WHERE client_name IS NOT NULL)',
      );
      return {
        client_name: rows.map((r) => ({ value: String(r.id), label: r.business_name_en === null ? '' : String(r.business_name_en) })),
        sorting: [
          { value: 'newest', label: 'Newest First' },
          { value: 'oldest', label: 'Oldest First' },
        ],
      };
    },
  },
  formOptions: async (req, id) => {
    const clientId = id ? null : req.query.client_name;
    const businesses = clientId
      ? await all('SELECT id, business_name_en FROM businesses WHERE id = ? AND status = 1', [String(clientId)])
      : await all('SELECT id, business_name_en FROM businesses WHERE status = 1');
    const subs = await all('SELECT name FROM business_sub_categories WHERE status = 1 ORDER BY name ASC');
    const seen = new Map<string, string>();
    for (const s of subs) seen.set(String(s.name ?? ''), String(s.name ?? ''));
    return {
      client_name: businesses.map((b) => ({ value: String(b.id), label: b.business_name_en === null ? '' : String(b.business_name_en) })),
      sub_category_name: [...seen].map(([value, label]) => ({ value, label })),
    };
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: { rules: rules('required|image|mimes:png,jpg,jpeg,svg|max:2048'), messages: MESSAGES },
    update: { rules: rules('image|mimes:png,jpg,jpeg,svg|max:2048'), messages: MESSAGES },
  },
  casts: { status: 'boolean' },
  serialize: async (row: Row) => {
    let subs: unknown = row.sub_category_name;
    if (typeof subs === 'string') {
      try {
        subs = JSON.parse(subs);
      } catch {
        /* raw */
      }
    }
    return {
      ...row,
      from_date: ymd(row.from_date),
      to_date: ymd(row.to_date),
      sub_category_name: subs,
      // list column value: Business::where('id', client_name)->first()->business_name_en ?? '-'
      business_name_en: await businessName(row.client_name),
      ads_location_hidden: row.ads_location,
    };
  },
  hooks: {
    beforeCreate: async (data, req) => {
      const out = castWrite(await onlyColumns(TABLE, data));
      applySingleUpload(out, req.input, 'advt_img', UPLOAD_DIR, null);
      return out;
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
      // `array` cast: originalIsEquivalent() compares the decoded values (MySQL re-formats stored JSON).
      if (typeof out.sub_category_name === 'string' && typeof existing.sub_category_name === 'string') {
        try {
          if (JSON.stringify(JSON.parse(out.sub_category_name)) === JSON.stringify(JSON.parse(existing.sub_category_name))) {
            delete out.sub_category_name;
          }
        } catch {
          /* not comparable → dirty */
        }
      }
      applySingleUpload(out, req.input, 'advt_img', UPLOAD_DIR, existing.advt_img);
      return out;
    },
  },
};
