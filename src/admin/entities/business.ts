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
import { insertRow, intId, toRow, type Filter, type Row } from '../../db/mongo.js';
import { CASE_INSENSITIVE } from '../../db/eloquent.js';
import { Business, BusinessCategory, BusinessRequest, BusinessSubCategory, BusinessUser, Pincode, User } from '../../models/index.js';
import { createBusinessValidation, updateBusinessValidation } from '../../validators/admin/business.validator.js';
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
  const businessId = intId(id);
  const business =
    businessId === null
      ? null
      : await Business.findOne({ _id: businessId } as never, { details: 0, images: 0, locations: 0, owners: 0, geo: 0 }).lean<Row>();
  return toRow(business);
}

/** `GROUP BY <field> HAVING COUNT(<field>) >= 1` on businesses: non-null values, first spelling, first-appearance order. */
async function groupedBusinessValues(field: string) {
  const rows = await Business.aggregate<Document>([
    { $match: { [field]: { $ne: null } } },
    { $sort: { _id: 1 } },
    { $group: { _id: `$${field}`, value: { $first: `$${field}` }, first: { $min: '$_id' } } },
    { $sort: { first: 1 } },
  ]).option({ collation: CASE_INSENSITIVE });
  return toOptions(rows, 'value', 'value');
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

/** Today (app timezone) as Y-m-d. */
const todayDb = () => nowDb().slice(0, 10);

/** PHP `(int)` of a request value. */
function phpInt(value: unknown): number {
  if (value === null || value === undefined || value === false) return 0;
  if (value === true) return 1;
  const match = /^\s*[+-]?\d+/.exec(String(value));
  return match ? parseInt(match[0], 10) : 0;
}

/** The store()/update() request merge. */
function mergeRequest(input: Record<string, unknown>): Record<string, unknown> {
  const fromDate = input.from_date === null || input.from_date === undefined ? '' : String(input.from_date);
  const monthDay = [...fromDate].length === 4 ? nowDb().slice(4, 10) : '';
  return {
    ...input,
    business_category_id: phpInt(input.business_category_id),
    business_sub_category_id: phpInt(input.business_sub_category_id),
    from_date: fromDate + monthDay,
  };
}

/** Backpack decodeJsonCastedAttributes() + the model's `social_media_url => array` cast (stored as a native value). */
function castSocial(data: Record<string, unknown>) {
  if (!('social_media_url' in data) || data.social_media_url === null || data.social_media_url === undefined) return;
  const socialMediaUrl = data.social_media_url;
  if (typeof socialMediaUrl === 'string') {
    try {
      data.social_media_url = JSON.parse(socialMediaUrl);
    } catch {
      /* not JSON: Backpack leaves the string, the array cast json_encodes it (a JSON string value) */
      data.social_media_url = socialMediaUrl;
    }
  }
}

/** Uploads; on update the Backpack form always posts every file input (empty → null → file deleted). */
function applyUploads(data: Record<string, unknown>, input: Record<string, unknown>, existing: Row | null) {
  for (const [field, directory] of UPLOADS) {
    const source = existing && !(field in input) ? { ...input, [field]: null } : input;
    applySingleUpload(data, source, field, directory, existing ? existing[field] : null);
  }
}

function redirectFor(mode: unknown, id: number): string | null {
  if (mode === 'Fees' || mode === 'Free') return 'business';
  if (mode === 'Advertisement') return `advertisment/create?client_name=${id}`;
  return null; // the PHP returns nothing → empty 200 response
}

async function store(req: Request, res: Response) {
  if (!(await validated(req, res, createBusinessValidation))) return;
  const request = mergeRequest(req.input);
  const data = only(request, CREATE_FIELDS);
  applyUploads(data, req.input, null);
  castSocial(data);
  // Sluggable: the (readonly, JS-filled) slug is kept on create; it is overwritten just below anyway.
  const id = await modelCreate('businesses', data);

  const series = generateSeriesFromId(id);
  const statePincode = await Pincode.findOne(
    { state: request.state_en ?? null, city: request.dist_en ?? null },
    { state_code: 1, district_code: 1 },
    { sort: { _id: 1 }, collation: CASE_INSENSITIVE },
  ).lean<Row>();
  // `WHERE state = NULL` matches nothing in MySQL.
  const pincode =
    request.state_en === null || request.state_en === undefined || request.dist_en === null || request.dist_en === undefined
      ? null
      : statePincode;
  if (!pincode) return void res.status(400).json({ message: 'Invalid State/District' });
  const receiptNumber = `${pincode.state_code ?? ''}${pincode.district_code ?? ''}${nowDb().slice(2, 4)}${series}`;
  const created = (await findBusiness(id))!;
  await builderUpdate(id, { receipt_number: receiptNumber, slug: `${strSlug(created.business_name_en)}-${id}` });

  const business = (await findBusiness(id))!;
  await modelSave('businesses', business, { lft: id + 1, rgt: id + 1, depth: 1, is_business_approved: 1 }, { massAssign: true });

  const now = nowDb();
  const userId = await insertRow(
    User.collection.collectionName,
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
  if (!(await validated(req, res, updateBusinessValidation(ruleId)))) return;
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
    await BusinessRequest.updateMany({ business_id: businessId }, { $set: { is_business_approved: 1, updated_at: nowDb() } });
    await dispatchJob('SendBusinessApproveNotification', businessId);
    if (fromIsToday) await created();
  } else if (fromIsToday) {
    await created();
  }

  await builderUpdate(businessId, {
    status: request.status ?? null,
    slug: `${strSlug(business.business_name_en)}-${businessId}`,
  });

  const owners = ((await Business.findOne({ _id: businessId } as never, { owners: 1 }).lean<Row>())?.owners ?? []) as Row[];
  const ownerUserId = entry.user_id ?? null;
  const ownerChild = [...owners]
    .sort((first, second) => first.id - second.id)
    .find((candidate) =>
      ownerUserId === null
        ? candidate.user_id === null
        : candidate.user_id !== null && Number(candidate.user_id) === Number(ownerUserId),
    );
  const now = nowDb();
  if (ownerChild) {
    const { id: ownerId, ...rest } = ownerChild;
    const owner: Row = { id: ownerId, business_id: businessId, ...rest };
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
  const rows = await Business.aggregate<Document>([
    { $unwind: '$owners' },
    { $sort: { 'owners.id': 1 } },
    { $group: { _id: '$owners.name', value: { $first: '$owners.name' }, first: { $min: '$owners.id' } } },
    { $sort: { first: 1 } },
  ]).option({ collation: CASE_INSENSITIVE });
  return toOptions(rows, 'value', 'value');
}

/** `SELECT state FROM pincodes GROUP BY state ORDER BY state ASC`. */
async function pincodeStates() {
  const rows = await Pincode.aggregate<Document>([
    { $sort: { _id: 1 } },
    { $group: { _id: '$state', value: { $first: '$state' } } },
    { $sort: { _id: 1 } },
  ]).option({ collation: CASE_INSENSITIVE });
  return toOptions(rows, 'value', 'value');
}

/** `SELECT p.id, p.pin_code FROM businesses b JOIN pincodes p ON p.id = b.pincode_id WHERE b.id = ?`. */
async function pincodeOf(id: string) {
  const business = await findBusiness(id);
  if (!business || business.pincode_id === null || business.pincode_id === undefined) return [];
  const pincode = await Pincode.findOne({ _id: business.pincode_id } as never, { pin_code: 1 }).lean<Row>();
  return pincode ? toOptions([pincode] as Document[], '_id', 'pin_code') : [];
}

const SMART_SEARCH = [
  'owner_number_1', 'state_en', 'dist_en', 'tehsil_en', 'area_en', 'receipt_number', 'mediator', 'owner_name_en',
  'business_name_en', 'business_contact_1', 'business_email', 'owner_email', 'pan', 'aadhaar', 'gst', 'keywords', 'slug',
  'business_contact_2', 'business_contact_3', 'business_contact_4', 'business_payment_mode', 'address_line_1_en',
];

export const business: CrudConfig = {
  route: 'business',
  collection: Business.collection.collectionName,
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
      business_category_id: await idOptions(BusinessCategory, { status: 1 }, 'name'),
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
    mediator: await idOptions(BusinessUser, { status: 1, designation: 'mediator' }, 'name'),
    business_category_id: await idOptions(BusinessCategory, { status: 1 }, 'name'),
    state_en: await pincodeStates(),
    ...(id ? { _pincode_code: await pincodeOf(id) } : {}),
  }),
  hooks: {
    // No DeleteOperation in the controller; the old ON DELETE CASCADE (business requests), should one be enabled.
    beforeDelete: (existing) => deleteBusinesses({ _id: existing.id }),
  },
  routes: (router) => {
    router.post('/', (req, res, next) => store(req, res).catch(next));
    router.put('/:id', (req, res, next) => update(req, res).catch(next));
    router.post('/fetch/pincode', (req, res, next) => fetchPincodes(req, res).catch(next));
  },
  serialize: async (row) => {
    const mediator = await fieldById(BusinessUser, row.mediator, 'name');
    const category = await fieldById(BusinessCategory, row.business_category_id, 'name');
    const subCategory = await fieldById(BusinessSubCategory, row.business_sub_category_id, 'name');
    const pincode = await fieldById(Pincode, row.pincode_id, 'pin_code');
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
      mediator_name: mediator ? mediator.value : null,
      business_category_name: category ? category.value : null,
      business_sub_category_name: subCategory ? subCategory.value : null,
      pin_code: pincode ? pincode.value : null,

    };
  },
};

