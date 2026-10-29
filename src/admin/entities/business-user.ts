// Port of App\Http\Controllers\Admin\BusinessUserCrudController ("Staff Management") + BusinessUserRequest /
// BusinessUserUpdateRequest. Operations: List, Create, Update, Fetch (no fetch* methods → no routes), Show.
// Model BusinessUser: $guarded ['id'] (unknown columns silently dropped), appends user_description.
// (BusinessUser1CrudController exists in the PHP but is not routed — not ported.)
import type { Request } from 'express';
import { hashMake } from '../../core/auth/hash.js';
import { PhpError } from '../../core/http/response.js';
import { nowDb } from '../../core/time.js';
import type { Document } from 'mongodb';
import { C, TABLE_COLLECTION, col, insertRow, toRow, type Filter, type Row } from '../../db/mongo.js';
import { coerceRow, fieldById, looseInt, modelSave, newRow, setColumns, tableRow } from './business-columns.js';
import type { CrudConfig, ListFilterResult } from '../crud.js';
import { applySingleUpload } from '../uploads.js';

const FIELDS = [
  'name',
  'phone',
  'email',
  'designation',
  'state',
  'district',
  'pincode_id',
  'tahsil',
  'address_line_1',
  'street_address',
  'profile_img',
  'aadhar_no',
  'description',
  'description_hi',
  'status',
];

const COMMON_MESSAGES = {
  'name.required': 'Name is required',
  'name.min': 'Name must be at least 1 character',
  'name.max': 'Name may not be greater than 255 characters',
  'phone.required': 'Phone is required',
  'phone.unique': 'Phone number must be unique',
  'email.email': 'Email must be a valid email address',
  'email.unique': 'Email must be unique',
  'address_line_1.required': 'Address Line is required',
  'street_address.required': 'Street Address is required',
  'aadhar_no.required': 'Aadhar Number is required',
  'aadhar_no.unique': 'Aadhar Number must be unique',
  'description_hi.required': 'Description in Hindi is required',
  'tahsil.required': 'Tahsil is required',
  'pincode_id.required': 'Pincode is required',
  'district.required': 'District is required',
  'state.required': 'State is required',
  'designation.required': 'Designation is required',
};

const UPLOAD_DIR = 'uploads/user_images';
const s = (v: unknown) => (v === undefined ? null : v);

/** `select <col> from business_users group by <col> having COUNT(<col>) >= 1` → pluck(col, col). */
export async function distinctValues(table: string, field: string) {
  return groupValues(TABLE_COLLECTION[table]!, field, { [field]: { $ne: null } }, { first: 1 });
}

/** The "Sort By" dropdown filter (both Staff and Event lists): resets orders; Backpack then appends `id DESC`. */
export function sortingFilter(input: Record<string, unknown>): ListFilterResult['orderBy'] | undefined {
  if (!('sorting' in input)) return undefined;
  const map: Record<string, [string, 'asc' | 'desc']> = {
    a_z: ['name', 'asc'],
    z_a: ['name', 'desc'],
    newest: ['created_at', 'desc'],
    oldest: ['created_at', 'asc'],
  };
  const o = map[String(input.sorting)];
  return o ? [o, ['id', 'desc']] : [['id', 'desc']];
}

/** `$this->crud->addClause('where', $col, $value)` — a NULL value becomes `IS NULL`. */
export const whereFilter = (field: string, v: unknown): Filter<Row> =>
  v === null || v === undefined ? { [field]: null } : { [field]: looseInt(v) };

/**
 * `GROUP BY <field>` (case-insensitive, one group per value; the first row's spelling) → pluck(field, field).
 * Ordered by first appearance (MySQL's temporary-table order) or by the value (`ORDER BY <field> ASC`).
 */
async function groupValues(collection: string, field: string, match: Document, order: { first: 1 } | { value: 1 }) {
  const rows = await col(collection)
    .aggregate(
      [
        { $match: match },
        { $sort: { _id: 1 } },
        { $group: { _id: `$${field}`, v: { $first: `$${field}` }, first: { $min: '$_id' } } },
        { $sort: 'first' in order ? { first: 1 } : { _id: 1 } },
      ],
      { collation: { locale: 'en', strength: 2 } },
    )
    .toArray();
  return rows.map((r) => ({ value: String(r.v), label: String(r.v) }));
}

const pinCode = async (id: unknown) =>
  id === null || id === undefined ? null : ((await fieldById(C.pincodes, id, 'pin_code'))?.v ?? null);

/** BusinessUser::getUserDescriptionAttribute (description is an uncast string column). */
const userDescription = (d: unknown) => (typeof d === 'string' ? d : '');

export const businessUser: CrudConfig = {
  route: 'business-user',
  collection: C.businessUsers,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Laravel quirk: Backpack appends `id DESC` after the default `name ASC`.
    orderBy: [
      ['name', 'asc'],
      ['id', 'desc'],
    ],
    // text/email columns (profile_img image + status closure are not searched)
    searchable: ['name', 'phone', 'district', 'state', 'email'],
    sortable: ['name', 'phone', 'district', 'state', 'email', 'profile_img'],
    filters: (q) => {
      const where: NonNullable<ListFilterResult['where']> = [];
      for (const col of ['name', 'state', 'district', 'status']) if (col in q) where.push(whereFilter(col, q[col]));
      return { where, orderBy: sortingFilter(q) };
    },
    filterOptions: async () => ({
      name: await distinctValues('business_users', 'name'),
      state: await distinctValues('business_users', 'state'),
      district: await distinctValues('business_users', 'district'),
      status: [
        { value: '1', label: 'Active ' },
        { value: '0', label: 'In-Active' },
      ],
      sorting: [
        { value: 'a_z', label: 'Name (A - Z)' },
        { value: 'z_a', label: 'Name (Z - A)' },
        { value: 'newest', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
      ],
    }),
  },
  // PinCode::groupBy('state')->orderBy('state','ASC')->pluck('state','state')
  formOptions: async () => ({
    state: await groupValues(C.pincodes, 'state', {}, { value: 1 }),
  }),
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: {
      rules: {
        name: 'required|min:1|max:255',
        phone: 'required|unique:business_users,phone',
        tahsil: 'required',
        pincode_id: 'required',
        district: 'required',
        state: 'required',
        designation: 'required',
        aadhar_no: 'nullable|unique:business_users,aadhar_no',
      },
      messages: { ...COMMON_MESSAGES, 'profile_img.image': 'Profile Picture must be an image', 'description.required': 'User description is required' },
    },
    update: {
      // $id = $this->get('id') ?? request()->route('id') — the Backpack edit form posts a hidden `id`.
      rules: (req: Request, id: string) => {
        const rid = req.input.id ?? id;
        return {
          name: 'required',
          phone: `required|digits:10|unique:business_users,phone,${rid}`,
          tahsil: 'required',
          district: 'required',
          state: 'required',
          designation: 'required',
          aadhar_no: `nullable|unique:business_users,aadhar_no,${rid}`,
        };
      },
      messages: { ...COMMON_MESSAGES, 'description.required': 'User details are mandatory.' },
    },
  },
  serialize: async (row: Row) => ({
    ...tableRow('business_users', row),
    pincode_pin_code: await pinCode(row.pincode_id),
    user_description: userDescription(row.description),
  }),
  hooks: {
    beforeCreate: (data, req) => {
      applySingleUpload(data, req.input, 'profile_img', UPLOAD_DIR);
      return newRow('business_users', data);
    },
    // store(): after the Backpack insert, create the login user and link it.
    afterCreate: async (id, _data, req) => {
      const r = req.input;
      // $req->merge(['pincode' => $pincode]) — only reaches users.pincode (not a Backpack field).
      const pincode = r.pincode_id ?? '';
      const now = nowDb();
      const userId = await insertRow(
        C.users,
        newRow('users', {
          name: s(r.name),
          email: s(r.email),
          phone: s(r.phone),
          status: s(r.status),
          state: s(r.state),
          district: s(r.district),
          pincode,
          tehsil: s(r.tehsil),
          address_line: s(r.address_line_1),
          street_address: s(r.street_address),
          password: await hashMake(String(r.phone ?? '')),
          created_at: now,
          updated_at: now,
        }),
      );
      const user = await userRow(userId);
      // BusinessUser::where('id', $id)->update([...]) — Eloquent builder adds updated_at.
      await setColumns('business_users', id, { user_id: userId, lft: id + 1, rgt: id + 1, depth: 1, password: user!.password, updated_at: nowDb() });
      const bu = await staffByUser(userId);
      // The withFiles uploader strips its path from profile_img on model retrieval (Uploader::retrieveFiles),
      // so user_icon = uploads/user_images/<file>; a missing image gives just "uploads/user_images/".
      await modelSave('users', user!, userFill({ user_icon: 'uploads/user_images/' + withoutPath(bu?.profile_img), updated_at: nowDb() }), { massAssign: false });
    },
    beforeUpdate: (data, existing, req) => {
      applySingleUpload(data, req.input, 'profile_img', UPLOAD_DIR, existing.profile_img);
      (req as Request & { p9cUserId?: unknown }).p9cUserId = existing.user_id;
      return coerceRow('business_users', data);
    },
    afterUpdate: async (_id, _data, req) => {
      const r = req.input;
      const userId = (req as Request & { p9cUserId?: unknown }).p9cUserId;
      const user = userId === null || userId === undefined ? undefined : await userRow(userId);
      // Laravel quirk: a staff row without a users row fails AFTER the business_users update was saved.
      if (!user) throw new PhpError('Call to a member function update() on null');
      const attrs: Record<string, unknown> = { name: s(r.name), phone: s(r.phone), email: s(r.email) };
      // `$request->password` is never sent by this form → always the first branch (no password change).
      if (r.password !== null && r.password !== undefined) attrs.password = await hashMake(String(r.password)); // 'hashed' cast
      Object.assign(attrs, {
        status: s(r.status),
        address_line: s(r.address_line_1),
        street_address: s(r.street_address),
        updated_at: nowDb(),
      });
      await modelSave('users', user, userFill(attrs), { massAssign: false });
      const bu = await staffByUser(userId);
      await modelSave('users', user, userFill({ user_icon: 'uploads/user_images/' + withoutPath(bu?.profile_img), updated_at: nowDb() }), { massAssign: false });
    },
  },
};

/** `select * from users where id = ? limit 1`. */
const userRow = async (id: unknown) => toRow(await col(C.users).findOne({ _id: id } as never)) ?? undefined;

/** `select * from business_users where user_id = ? limit 1`. */
const staffByUser = (userId: unknown) => col(C.businessUsers).findOne({ user_id: userId } as never, { sort: { _id: 1 } });

/** Uploader::getValueWithoutPath(): Str::after($value, 'uploads/user_images/'); null → ''. */
function withoutPath(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const str = String(v);
  const i = str.indexOf(UPLOAD_DIR + '/');
  return i === -1 ? str : str.slice(i + UPLOAD_DIR.length + 1);
}

/**
 * User::update() mass assignment: only User::$fillable (name, email, password, user_icon, address_line,
 * street_address) is written — Laravel quirk: phone, status and the explicit updated_at are silently dropped
 * (updated_at is still touched by the timestamps when something is dirty).
 */
const USER_FILLABLE = new Set(['name', 'email', 'password', 'user_icon', 'address_line', 'street_address']);
function userFill(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).filter(([k]) => USER_FILLABLE.has(k)));
}
