// Port of App\Http\Controllers\Admin\BusinessCrudController (+ BusinessRequest / BusinessUpdateRequest, model Business).
// Operations: List, Create, Update, Show, Fetch (POST business/fetch/pincode).
// `Route::get('business/{businessId}/edit', 'BusinessCrudController@updateOperation')` is registered after
// Route::crud('business') whose `business/{id}/edit` matches first, so it is dead (the normal edit page is used;
// BusinessRequestManagment's "Approve" button links there and update() approves the business).
//
// store():  validate → merge (int) category ids + from_date (YYYY → YYYY-<today m-d>) → Model::create (guarded:
//           unknown columns dropped; uploads; social_media_url array cast) → receipt_number + slug (builder update)
//           → lft/rgt/depth/is_business_approved (model update) → User + BusinessOwner rows → user_id
//           → SendBusinessCreatedNotification when from_date is today → redirect by payment mode.
// update(): validate → same merges → Model update (uploads) → approve if pending (+ requests, notifications)
//           → status + slug (builder update) → BusinessOwner upsert → redirect by payment mode.
import type { Request, Response } from 'express';
import type { CrudConfig } from '../crud.js';
import { hashMake } from '../../core/auth/hash.js';
import { nowDb } from '../../core/time.js';
import { exec, first, type Row } from '../../db/pool.js';
import { generateSeriesFromId, strSlug } from '../../helpers/business.js';
import { dispatchJob } from '../../jobs/dispatch.js';
import { phpJsonEncode } from '../../services/firebase.js';
import { applySingleUpload } from '../uploads.js';
import {
  builderUpdate,
  fetchPincodes,
  findRow,
  modelCreate,
  modelUpdate,
  only,
  pluckOptions,
  validated,
} from '../support/business-helpers.js';

const UPLOADS: Array<[string, string]> = [
  ['logo', 'uploads/business_logo'],
  ['image_1', 'uploads/business_images'],
  ['image_2', 'uploads/business_images'],
  ['image_3', 'uploads/business_images'],
  ['image_4', 'uploads/business_images'],
];

// Field names in definition order (getAllFieldNames()); custom_html headers are never submitted.
const COMMON_FIELDS = [
  'mediator', 'owner_number_1', 'business_contact_1', 'business_contact_2', 'business_contact_3', 'business_contact_4',
  'pan', 'aadhaar', 'gst', 'from_date', 'valid_till', 'exp_date', 'business_email', 'owner_email', 'business_payment_mode',
  'fees_type', 'business_fess', 'contact_info_header', 'contact_info_header_hi', 'owner_name_en', 'owner_name_hi',
  'business_name_en', 'business_name_hi', 'address_line_1_en', 'address_line_1_hi', 'state_en', 'state_hi', 'dist_en',
  'dist_hi', 'pincode_id', 'pincode_hi', 'tehsil_en', 'tehsil_hi', 'area_en', 'area_hi', 'business_category_id',
  'category_hi', 'business_sub_category_id', 'sub_category_hi', 'about_en', 'about_hi', 'logo', 'image_1', 'image_2',
  'image_3', 'image_4', 'keywords', 'keywords_hi', 'social_media_url', 'slug', 'status', 'business_sub_category_id_hidden',
  'dist_en_hidden', 'tehsil_en_hidden', 'area_en_hidden', 'pincode_id_hidden',
];
const CREATE_FIELDS = [...COMMON_FIELDS, 'is_business_approved'];
const UPDATE_FIELDS = COMMON_FIELDS;

const CREATE_MESSAGES: Record<string, string> = {
  'business_category_id.required': 'Business Category is required.',
  'owner_number_1.required': 'Owner Number 1 is required.',
  'owner_number_1.unique': 'This Contact number is already registered in the System.',
  'mediator.required': 'Mediator is required.',
  'business_contact_1.required': 'Business Contact 1 is required.',
  'business_contact_1.unique': 'This Contact number is already registered in the System.',
  'pan.required': 'PAN is required.',
  'pan.unique': 'This PAN is already taken.',
  'business_contact_2.required': 'Business Contact 2 is required.',
  'business_contact_2.unique': 'This Contact number is already registered in the System.',
  'business_contact_3.unique': 'This Contact number is already registered in the System.',
  'business_contact_4.unique': 'This Contact number is already registered in the System.',
  'aadhaar.required': 'Aadhaar is required.',
  'aadhaar.unique': 'This Aadhaar is already taken.',
  'gst.required': 'GST is required.',
  'gst.unique': 'This GST is already taken.',
  'from_date.required': 'From Date is required.',
  'business_email.required': 'Business Email is required.',
  'business_email.unique': 'Business Email must be Unique.',
  'valid_till.required': 'Valid Till is required.',
  'owner_email.required': 'Owner Email is required.',
  'owner_email.unique': 'This Owner Email is already taken.',
  'exp_date.required': 'Expiry Date is required.',
  'business_payment_mode.required': 'Payment Mode is required.',
  'business_fess.required': 'Business Fees is required.',
  'business_name_en.required': 'Business Name (English) is required.',
  'owner_name_en.required': 'Owner name should be filled.',
  // Laravel: an attribute-only key matches any rule of that attribute.
  address_line_1_en: 'Address line must be filled.',
  'state_en.required': 'State is required',
  'pincode_id.required': 'Pincode is required',
  'dist_en.required': 'district is required',
  'tehsil_en.required': 'Tehsil is required',
  'about_hi.required': 'About(Hindi) is required',
  'logo.required': 'Please upload a logo. This field is required.',
  'image_1.required': 'Please upload the first image. This field is required.',
  'image_2.required': 'Please upload the second image. This field is required.',
};

const UPDATE_MESSAGES: Record<string, string> = {
  'business_category_id.required': 'Business Category is required.',
  'owner_number_1.required': 'Owner Number 1 must be unique and required.',
  'mediator.required': 'Mediator is required.',
  'business_contact_1.required': 'Business Contact 1 is required.',
  'pan.required': 'PAN is required.',
  'pan.unique': 'This PAN is already taken.',
  'business_contact_2.required': 'Business Contact 2 is required.',
  'aadhaar.required': 'Aadhaar is required.',
  'aadhaar.unique': 'This Aadhaar is already taken.',
  'gst.required': 'GST is required.',
  'gst.unique': 'This GST is already taken.',
  'from_date.required': 'From Date is required.',
  'business_email.required': 'Business Email is required.',
  'valid_till.required': 'Valid Till is required.',
  'owner_email.required': 'Owner Email is required.',
  'owner_email.unique': 'This Owner Email is already taken.',
  'exp_date.required': 'Expiry Date is required.',
  'business_payment_mode.required': 'Payment Mode is required.',
  'business_fess.required': 'Business Fees is required.',
  'business_name_en.required': 'Business Name (English) is required.',
  'owner_name_en.required': 'Owner name should be filled.',
  address_line_1_en: 'Address line must be filled.',
  'state_en.required': 'State is required',
  'pincode_id.required': 'Pincode is required',
  'area_en.required': 'Area is required',
  'about_hi.required': 'About(Hindi) is required',
  'dist_en.required': 'district is required',
  'tehsil_en.required': 'Tehsil is required',
  'fees_type.required_if': 'Fees Type is required',
};

const PAN_RE = 'regex:/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/';
const GST_RE = 'regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/';

const createRules = () => ({
  business_category_id: 'nullable|required',
  owner_number_1: 'required|string',
  mediator: 'required',
  business_contact_1: 'required|string',
  pan: `nullable|${PAN_RE}|unique:businesses,pan`,
  // Laravel quirk: size:12 + a 13-digit regex — no non-empty Aadhaar can pass.
  aadhaar: 'nullable|size:12|regex:/^[2-9][0-9]{12}$/|unique:businesses,aadhaar',
  gst: `nullable|size:15|${GST_RE}|unique:businesses,gst`,
  from_date: 'required',
  business_email: 'nullable|unique:businesses,business_email',
  valid_till: 'required',
  owner_email: 'nullable|unique:businesses,owner_email',
  exp_date: 'required',
  business_payment_mode: 'required',
  business_fess: 'required_if:business_payment_mode,Fees',
  fees_type: 'required_if:business_payment_mode,Fees',
  business_name_en: 'required',
  owner_name_en: 'required',
  address_line_1_en: 'required',
  state_en: 'required',
  pincode_id: 'required',
  dist_en: 'required',
});

// BusinessUpdateRequest: `'business_contact_2' => 'nullable', [Rule::unique(...)]` — the unique rules land on
// numeric keys 0/1 (attributes that never exist), so business_contact_2 / business_email are only nullable.
const updateRules = (id: string) => ({
  business_category_id: 'nullable|required',
  owner_number_1: 'required',
  mediator: 'required',
  business_contact_1: 'required',
  pan: `nullable|${PAN_RE}|unique:businesses,pan,${id}`,
  business_contact_2: 'nullable',
  aadhaar: `nullable|digits:12|unique:businesses,aadhaar,${id}`,
  gst: `nullable|size:15|${GST_RE}|unique:businesses,gst,${id}`,
  from_date: 'required',
  business_email: 'nullable',
  valid_till: 'required',
  owner_email: 'nullable',
  exp_date: 'required',
  business_payment_mode: 'required',
  business_fess: 'required_if:business_payment_mode,Fees',
  fees_type: 'required_if:business_payment_mode,Fees',
  business_name_en: 'required',
  owner_name_en: 'required',
  address_line_1_en: 'required',
  state_en: 'required',
  pincode_id: 'required',
  dist_en: 'required',
});

/** Today (app timezone) as Y-m-d. */
const todayDb = () => nowDb().slice(0, 10);

/** PHP `(int)` of a request value. */
function phpInt(v: unknown): number {
  if (v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  const m = /^\s*[+-]?\d+/.exec(String(v));
  return m ? parseInt(m[0], 10) : 0;
}

/** The store()/update() request merge. */
function mergeRequest(input: Record<string, unknown>): Record<string, unknown> {
  const from = input.from_date === null || input.from_date === undefined ? '' : String(input.from_date);
  const monthDay = [...from].length === 4 ? nowDb().slice(4, 10) : '';
  return {
    ...input,
    business_category_id: phpInt(input.business_category_id),
    business_sub_category_id: phpInt(input.business_sub_category_id),
    from_date: from + monthDay,
  };
}

/** Backpack decodeJsonCastedAttributes() + the model's `social_media_url => array` cast (json_encode on write). */
function castSocial(data: Record<string, unknown>) {
  if (!('social_media_url' in data) || data.social_media_url === null || data.social_media_url === undefined) return;
  const v = data.social_media_url;
  if (typeof v === 'string') {
    try {
      data.social_media_url = phpJsonEncode(JSON.parse(v));
    } catch {
      /* not JSON: Backpack leaves the string, the array cast json_encodes it */
      data.social_media_url = phpJsonEncode(v);
    }
  } else data.social_media_url = phpJsonEncode(v);
}

/** Uploads; on update the Backpack form always posts every file input (empty → null → file deleted). */
function applyUploads(data: Record<string, unknown>, input: Record<string, unknown>, existing: Row | null) {
  for (const [field, dir] of UPLOADS) {
    const src = existing && !(field in input) ? { ...input, [field]: null } : input;
    applySingleUpload(data, src, field, dir, existing ? existing[field] : null);
  }
}

function redirectFor(mode: unknown, id: number): string | null {
  if (mode === 'Fees' || mode === 'Free') return 'business';
  if (mode === 'Advertisement') return `advertisment/create?client_name=${id}`;
  return null; // the PHP returns nothing → empty 200 response
}

async function store(req: Request, res: Response) {
  if (!(await validated(req, res, createRules(), CREATE_MESSAGES))) return;
  const request = mergeRequest(req.input);
  const data = only(request, CREATE_FIELDS);
  applyUploads(data, req.input, null);
  castSocial(data);
  // Sluggable: the (readonly, JS-filled) slug is kept on create; it is overwritten just below anyway.
  const id = await modelCreate('businesses', data);

  const series = generateSeriesFromId(id);
  const pin = await first('SELECT state_code, district_code FROM pincodes WHERE state = ? AND city = ? LIMIT 1', [
    request.state_en,
    request.dist_en,
  ]);
  if (!pin) return void res.status(400).json({ message: 'Invalid State/District' });
  const receipt = `${pin.state_code ?? ''}${pin.district_code ?? ''}${nowDb().slice(2, 4)}${series}`;
  const created = (await findRow('businesses', id))!;
  await builderUpdate('businesses', 'id = ?', [id], { receipt_number: receipt, slug: `${strSlug(created.business_name_en)}-${id}` });

  const business = (await findRow('businesses', id))!;
  await modelUpdate('businesses', business, { lft: id + 1, rgt: id + 1, depth: 1, is_business_approved: 1 });

  const now = nowDb();
  const user = await exec(
    'INSERT INTO `users` (`name`, `email`, `phone`, `status`, `is_business_owner`, `address_line`, `password`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    // Hash::make($request->phone): the form has no `phone` field → hash of ''.
    [request.owner_name_en ?? null, request.owner_email ?? null, request.owner_number_1 ?? null, '1', '1', request.address_line_1_en ?? null, await hashMake(String(request.phone ?? '')), now, now],
  );
  const userId = user.insertId;
  await exec('INSERT INTO `business_owners` (`name`, `phone`, `business_id`, `user_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?)', [
    request.owner_name_en ?? null,
    request.owner_number_1 ?? null,
    id,
    userId,
    now,
    now,
  ]);
  await modelUpdate('businesses', (await findRow('businesses', id))!, { user_id: userId });

  if (request.from_date === todayDb()) {
    await dispatchJob('SendBusinessCreatedNotification', id, {
      state_en: request.state_en ?? null,
      dist_en: request.dist_en ?? null,
      business_name_en: request.business_name_en ?? null,
      name: request.name ?? null,
    });
  }
  res.status(201).json({ id, message: 'The item has been added successfully.', redirect: redirectFor(request.business_payment_mode, id) });
}

async function update(req: Request, res: Response) {
  const id = req.params.id!;
  const existing = await findRow('businesses', id);
  if (!existing) return void res.status(404).json({ message: 'Not Found' });
  const ruleId = String(req.input.id ?? id);
  if (!(await validated(req, res, updateRules(ruleId), UPDATE_MESSAGES))) return;
  const request = mergeRequest(req.input);
  const businessId = Number(existing.id);

  const data = only(request, UPDATE_FIELDS);
  applyUploads(data, req.input, existing);
  castSocial(data);
  const entry = { ...existing };
  await modelUpdate('businesses', entry, data);

  const business = (await findRow('businesses', businessId))!;
  const fromIsToday = String(request.from_date).slice(0, 10) === todayDb();
  const created = () =>
    dispatchJob(
      'SendBusinessCreatedNotification',
      businessId,
      { state_en: business.state_en, dist_en: business.dist_en, business_name_en: business.business_name_en },
      business.user_id,
    );
  if (Number(business.is_business_approved) === 0) {
    await modelUpdate('businesses', business, { is_business_approved: 1 });
    await builderUpdate('businesse_requests', 'business_id = ?', [businessId], { is_business_approved: 1 });
    await dispatchJob('SendBusinessApproveNotification', businessId);
    if (fromIsToday) await created();
  } else if (fromIsToday) {
    await created();
  }

  await builderUpdate('businesses', 'id = ?', [businessId], {
    status: request.status ?? null,
    slug: `${strSlug(business.business_name_en)}-${businessId}`,
  });

  const owner = await first(
    `SELECT * FROM business_owners WHERE ${entry.user_id === null ? 'user_id IS NULL' : 'user_id = ?'} AND business_id = ? LIMIT 1`,
    entry.user_id === null ? [businessId] : [entry.user_id, businessId],
  );
  const now = nowDb();
  if (owner) {
    await modelUpdate('business_owners', owner, { name: request.owner_name_en ?? null, phone: request.owner_number_1 ?? null, updated_at: now });
  } else {
    await exec('INSERT INTO `business_owners` (`name`, `phone`, `business_id`, `user_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?)', [
      request.owner_name_en ?? null,
      request.owner_number_1 ?? null,
      businessId,
      entry.user_id,
      now,
      now,
    ]);
  }
  res.json({ id: businessId, message: 'The item has been modified successfully.', redirect: redirectFor(request.business_payment_mode, businessId) });
}


const SMART_SEARCH = [
  'owner_number_1', 'state_en', 'dist_en', 'tehsil_en', 'area_en', 'receipt_number', 'mediator', 'owner_name_en',
  'business_name_en', 'business_contact_1', 'business_email', 'owner_email', 'pan', 'aadhaar', 'gst', 'keywords', 'slug',
  'business_contact_2', 'business_contact_3', 'business_contact_4', 'business_payment_mode', 'address_line_1_en',
];

export const business: CrudConfig = {
  route: 'business',
  table: 'businesses',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    where: { sql: "`is_business_approved` = '1'" },
    // text columns (with tableColumn) + the smart_search closure (same LIKE semantics, OR'ed together).
    searchable: [
      ...new Set([
        'state_en', 'dist_en', 'receipt_number', 'mediator', 'owner_name_en', 'business_name_en', 'address_line_1_en',
        'business_payment_mode', 'business_fess', 'fees_type', ...SMART_SEARCH,
      ]),
    ],
    sortable: [
      'state_en', 'dist_en', 'receipt_number', 'mediator', 'status', 'owner_name_en', 'business_name_en', 'address_line_1_en',
      'business_contact_1', 'business_category_id', 'business_sub_category_id', 'business_payment_mode', 'business_fess', 'fees_type',
    ],
    filters: (input) => {
      const where: Array<{ sql: string; params: unknown[] }> = [];
      if (input.owner_name_en) where.push({ sql: '`owner_name_en` = ?', params: [input.owner_name_en] });
      if (input.business_category_id) where.push({ sql: '`business_category_id` = ?', params: [input.business_category_id] });
      if (input.status !== undefined && input.status !== null) where.push({ sql: '`status` = ?', params: [input.status] });
      if (input.state) where.push({ sql: '`state_en` = ?', params: [input.state] });
      if (input.district) where.push({ sql: '`dist_en` = ?', params: [input.district] });
      // `sorting` dropdown clears the orders; without it the list is ordered by business_name_en asc.
      const sorting = input.sorting;
      let orderBy: Array<[string, 'asc' | 'desc']> | undefined;
      if (sorting === undefined) orderBy = [['business_name_en', 'asc']];
      else if (sorting === 'a_z') orderBy = [['business_name_en', 'asc']];
      else if (sorting === 'z_a') orderBy = [['business_name_en', 'desc']];
      else if (sorting === 'newest') orderBy = [['created_at', 'desc']];
      else if (sorting === 'oldest') orderBy = [['created_at', 'asc']];
      else orderBy = [];
      return { where, orderBy };
    },
    filterOptions: async () => ({
      owner_name_en: await pluckOptions('SELECT DISTINCT name AS v, name AS l FROM business_owners'),
      business_category_id: await pluckOptions("SELECT DISTINCT name AS l, id AS v FROM business_categories WHERE status = '1'"),
      status: [
        { value: '0', label: 'Not Active' },
        { value: '1', label: 'Active' },
      ],
      state: await pluckOptions('SELECT state_en AS v, state_en AS l FROM businesses GROUP BY state_en HAVING COUNT(state_en) >= 1'),
      district: await pluckOptions('SELECT dist_en AS v, dist_en AS l FROM businesses GROUP BY dist_en HAVING COUNT(dist_en) >= 1'),
      sorting: [
        { value: 'a_z', label: 'Name (A - Z)' },
        { value: 'z_a', label: 'Name (Z - A)' },
        { value: 'newest', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
      ],
    }),
  },
  fields: { create: CREATE_FIELDS, update: UPDATE_FIELDS },
  formOptions: async (_req, id) => ({
    mediator: await pluckOptions("SELECT id AS v, name AS l FROM business_users WHERE status = 1 AND designation = 'mediator'"),
    business_category_id: await pluckOptions('SELECT id AS v, name AS l FROM business_categories WHERE status = 1'),
    state_en: await pluckOptions('SELECT state AS v, state AS l FROM pincodes GROUP BY state ORDER BY state ASC'),
    ...(id ? { _pincode_code: await pluckOptions('SELECT p.id AS v, p.pin_code AS l FROM businesses b JOIN pincodes p ON p.id = b.pincode_id WHERE b.id = ?', [id]) } : {}),
  }),
  routes: (r) => {
    r.post('/', (req, res, next) => store(req, res).catch(next));
    r.put('/:id', (req, res, next) => update(req, res).catch(next));
    r.post('/fetch/pincode', (req, res, next) => fetchPincodes(req, res).catch(next));
  },
  serialize: async (row) => {
    const mediator = await first('SELECT name FROM business_users WHERE id = ? LIMIT 1', [row.mediator]);
    const cat = row.business_category_id === null ? null : await first('SELECT name FROM business_categories WHERE id = ?', [row.business_category_id]);
    const sub =
      row.business_sub_category_id === null ? null : await first('SELECT name FROM business_sub_categories WHERE id = ?', [row.business_sub_category_id]);
    const pin = row.pincode_id === null ? null : await first('SELECT pin_code FROM pincodes WHERE id = ?', [row.pincode_id]);
    let social: unknown = null;
    if (typeof row.social_media_url === 'string') {
      try {
        social = JSON.parse(row.social_media_url);
      } catch {
        social = null;
      }
    }
    return {
      ...row,
      social_media_url: social,
      mediator_found: !!mediator,
      mediator_name: mediator ? mediator.name : null,
      business_category_name: cat ? cat.name : null,
      business_sub_category_name: sub ? sub.name : null,
      pin_code: pin ? pin.pin_code : null,
    };
  },
};

