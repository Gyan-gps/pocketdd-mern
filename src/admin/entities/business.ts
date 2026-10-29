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
import type { Document } from 'mongodb';
import { C, col, insertRow, intId, toRow, type Filter, type Row } from '../../db/mongo.js';
import { generateSeriesFromId } from '../../utils/general.js';
import { strSlug } from '../../utils/php/values.js';
import { dispatchJob } from '../../jobs/queue.js';
import { applySingleUpload } from '../uploads.js';
import { fetchPincodes, only, validated } from '../support/business-helpers.js';
import {
  childCreate,
  deleteBusinesses,
  fieldById,
  idOptions,
  looseInt,
  modelCreate,
  modelSave,
  newRow,
  setColumns,
  tableRow,
  toOptions,
} from './business-columns.js';

/** `SELECT * FROM businesses WHERE id = ? LIMIT 1` (table columns only). */
async function findBusiness(id: unknown): Promise<Row | null> {
  const n = intId(id);
  const doc = n === null ? null : await col(C.businesses).findOne({ _id: n } as never, { projection: { details: 0, images: 0, locations: 0, owners: 0, geo: 0 } });
  return toRow(doc);
}

/** `GROUP BY <field> HAVING COUNT(<field>) >= 1` on businesses: non-null values, first spelling, first-appearance order. */
async function groupedBusinessValues(field: string) {
  const rows = await col(C.businesses)
    .aggregate(
      [
        { $match: { [field]: { $ne: null } } },
        { $sort: { _id: 1 } },
        { $group: { _id: `$${field}`, v: { $first: `$${field}` }, first: { $min: '$_id' } } },
        { $sort: { first: 1 } },
      ],
      { collation: { locale: 'en', strength: 2 } },
    )
    .toArray();
  return toOptions(rows, 'v', 'v');
}

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

/** Backpack decodeJsonCastedAttributes() + the model's `social_media_url => array` cast (stored as a native value). */
function castSocial(data: Record<string, unknown>) {
  if (!('social_media_url' in data) || data.social_media_url === null || data.social_media_url === undefined) return;
  const v = data.social_media_url;
  if (typeof v === 'string') {
    try {
      data.social_media_url = JSON.parse(v);
    } catch {
      /* not JSON: Backpack leaves the string, the array cast json_encodes it (a JSON string value) */
      data.social_media_url = v;
    }
  }
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
  const pinDoc = await col(C.pincodes).findOne(
    { state: request.state_en ?? null, city: request.dist_en ?? null },
    { projection: { state_code: 1, district_code: 1 }, sort: { _id: 1 }, collation: { locale: 'en', strength: 2 } },
  );
  // `WHERE state = NULL` matches nothing in MySQL.
  const pin = request.state_en === null || request.state_en === undefined || request.dist_en === null || request.dist_en === undefined ? null : pinDoc;
  if (!pin) return void res.status(400).json({ message: 'Invalid State/District' });
  const receipt = `${pin.state_code ?? ''}${pin.district_code ?? ''}${nowDb().slice(2, 4)}${series}`;
  const created = (await findBusiness(id))!;
  await builderUpdate(id, { receipt_number: receipt, slug: `${strSlug(created.business_name_en)}-${id}` });

  const business = (await findBusiness(id))!;
  await modelSave('businesses', business, { lft: id + 1, rgt: id + 1, depth: 1, is_business_approved: 1 }, { massAssign: true });

  const now = nowDb();
  const userId = await insertRow(
    C.users,
    newRow('users', {
      name: request.owner_name_en ?? null,
      email: request.owner_email ?? null,
      phone: request.owner_number_1 ?? null,
      status: '1',
      is_business_owner: '1',
      address_line: request.address_line_1_en ?? null,
      // Hash::make($request->phone): the form has no `phone` field → hash of ''.
      password: await hashMake(String(request.phone ?? '')),
      created_at: now,
      updated_at: now,
    }),
  );
  await childCreate('business_owners', {
    name: request.owner_name_en ?? null,
    phone: request.owner_number_1 ?? null,
    business_id: id,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  await modelSave('businesses', (await findBusiness(id))!, { user_id: userId }, { massAssign: true });

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
  const existing = await findBusiness(id);
  if (!existing) return void res.status(404).json({ message: 'Not Found' });
  const ruleId = String(req.input.id ?? id);
  if (!(await validated(req, res, updateRules(ruleId), UPDATE_MESSAGES))) return;
  const request = mergeRequest(req.input);
  const businessId = Number(existing.id);

  const data = only(request, UPDATE_FIELDS);
  applyUploads(data, req.input, existing);
  castSocial(data);
  const entry = { ...existing };
  await modelSave('businesses', entry, data, { massAssign: true });

  const business = (await findBusiness(businessId))!;
  const fromIsToday = String(request.from_date).slice(0, 10) === todayDb();
  const created = () =>
    dispatchJob(
      'SendBusinessCreatedNotification',
      businessId,
      { state_en: business.state_en, dist_en: business.dist_en, business_name_en: business.business_name_en },
      business.user_id,
    );
  if (Number(business.is_business_approved) === 0) {
    await modelSave('businesses', business, { is_business_approved: 1 }, { massAssign: true });
    await col(C.businessRequests).updateMany({ business_id: businessId }, { $set: { is_business_approved: 1, updated_at: nowDb() } });
    await dispatchJob('SendBusinessApproveNotification', businessId);
    if (fromIsToday) await created();
  } else if (fromIsToday) {
    await created();
  }

  await builderUpdate(businessId, {
    status: request.status ?? null,
    slug: `${strSlug(business.business_name_en)}-${businessId}`,
  });

  const owners = ((await col(C.businesses).findOne({ _id: businessId } as never, { projection: { owners: 1 } }))?.owners ?? []) as Row[];
  const uid = entry.user_id ?? null;
  const ownerChild = [...owners].sort((a, b) => a.id - b.id).find((o) => (uid === null ? o.user_id === null : o.user_id !== null && Number(o.user_id) === Number(uid)));
  const now = nowDb();
  if (ownerChild) {
    const { id: oid, ...rest } = ownerChild;
    const owner: Row = { id: oid, business_id: businessId, ...rest };
    await modelSave('business_owners', owner, { name: request.owner_name_en ?? null, phone: request.owner_number_1 ?? null, updated_at: now }, { massAssign: true });
  } else {
    await childCreate('business_owners', {
      name: request.owner_name_en ?? null,
      phone: request.owner_number_1 ?? null,
      business_id: businessId,
      user_id: entry.user_id,
      created_at: now,
      updated_at: now,
    });
  }
  res.json({ id: businessId, message: 'The item has been modified successfully.', redirect: redirectFor(request.business_payment_mode, businessId) });
}


/** `Business::where('id', $id)->update($attrs)` — Eloquent builder update: always sets updated_at = now(). */
const builderUpdate = (id: number, attrs: Record<string, unknown>) => setColumns('businesses', id, { ...attrs, updated_at: nowDb() });

/** `SELECT DISTINCT name FROM business_owners` (case-insensitive, first-appearance order). */
async function ownerNames() {
  const rows = await col(C.businesses)
    .aggregate(
      [
        { $unwind: '$owners' },
        { $sort: { 'owners.id': 1 } },
        { $group: { _id: '$owners.name', v: { $first: '$owners.name' }, first: { $min: '$owners.id' } } },
        { $sort: { first: 1 } },
      ],
      { collation: { locale: 'en', strength: 2 } },
    )
    .toArray();
  return toOptions(rows, 'v', 'v');
}

/** `SELECT state FROM pincodes GROUP BY state ORDER BY state ASC`. */
async function pincodeStates() {
  const rows = await col(C.pincodes)
    .aggregate([{ $sort: { _id: 1 } }, { $group: { _id: '$state', v: { $first: '$state' } } }, { $sort: { _id: 1 } }], {
      collation: { locale: 'en', strength: 2 },
    })
    .toArray();
  return toOptions(rows, 'v', 'v');
}

/** `SELECT p.id, p.pin_code FROM businesses b JOIN pincodes p ON p.id = b.pincode_id WHERE b.id = ?`. */
async function pincodeOf(id: string) {
  const b = await findBusiness(id);
  if (!b || b.pincode_id === null || b.pincode_id === undefined) return [];
  const p = await col(C.pincodes).findOne({ _id: b.pincode_id } as never, { projection: { pin_code: 1 } });
  return p ? toOptions([p] as Document[], '_id', 'pin_code') : [];
}

const SMART_SEARCH = [
  'owner_number_1', 'state_en', 'dist_en', 'tehsil_en', 'area_en', 'receipt_number', 'mediator', 'owner_name_en',
  'business_name_en', 'business_contact_1', 'business_email', 'owner_email', 'pan', 'aadhaar', 'gst', 'keywords', 'slug',
  'business_contact_2', 'business_contact_3', 'business_contact_4', 'business_payment_mode', 'address_line_1_en',
];

export const business: CrudConfig = {
  route: 'business',
  collection: C.businesses,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    where: { is_business_approved: 1 },
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
      const where: Array<Filter<Row>> = [];
      if (input.owner_name_en) where.push({ owner_name_en: input.owner_name_en });
      if (input.business_category_id) where.push({ business_category_id: looseInt(input.business_category_id) });
      if (input.status !== undefined && input.status !== null) where.push({ status: looseInt(input.status) });
      if (input.state) where.push({ state_en: input.state });
      if (input.district) where.push({ dist_en: input.district });
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
      owner_name_en: await ownerNames(),
      business_category_id: await idOptions(C.businessCategories, { status: 1 }, 'name'),
      status: [
        { value: '0', label: 'Not Active' },
        { value: '1', label: 'Active' },
      ],
      state: await groupedBusinessValues('state_en'),
      district: await groupedBusinessValues('dist_en'),
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
    mediator: await idOptions(C.businessUsers, { status: 1, designation: 'mediator' }, 'name'),
    business_category_id: await idOptions(C.businessCategories, { status: 1 }, 'name'),
    state_en: await pincodeStates(),
    ...(id ? { _pincode_code: await pincodeOf(id) } : {}),
  }),
  hooks: {
    // No DeleteOperation in the controller; the old ON DELETE CASCADE (business requests), should one be enabled.
    beforeDelete: (existing) => deleteBusinesses({ _id: existing.id }),
  },
  routes: (r) => {
    r.post('/', (req, res, next) => store(req, res).catch(next));
    r.put('/:id', (req, res, next) => update(req, res).catch(next));
    r.post('/fetch/pincode', (req, res, next) => fetchPincodes(req, res).catch(next));
  },
  serialize: async (row) => {
    const mediator = await fieldById(C.businessUsers, row.mediator, 'name');
    const cat = await fieldById(C.businessCategories, row.business_category_id, 'name');
    const sub = await fieldById(C.businessSubCategories, row.business_sub_category_id, 'name');
    const pin = await fieldById(C.pincodes, row.pincode_id, 'pin_code');
    // Native JSON value; a string is a value that was not valid JSON (json_decode → null).
    let social: unknown = row.social_media_url ?? null;
    if (typeof social === 'string') {
      try {
        social = JSON.parse(social);
      } catch {
        social = null;
      }
    }
    return {
      ...tableRow('businesses', row),
      social_media_url: social,
      mediator_found: !!mediator,
      mediator_name: mediator ? mediator.v : null,
      business_category_name: cat ? cat.v : null,
      business_sub_category_name: sub ? sub.v : null,
      pin_code: pin ? pin.v : null,
    };
  },
};

