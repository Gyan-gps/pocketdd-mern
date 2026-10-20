// Port of App\Http\Controllers\Admin\BusinessUserCrudController ("Staff Management") + BusinessUserRequest /
// BusinessUserUpdateRequest. Operations: List, Create, Update, Fetch (no fetch* methods → no routes), Show.
// Model BusinessUser: $guarded ['id'] (unknown columns silently dropped), appends user_description.
// (BusinessUser1CrudController exists in the PHP but is not routed — not ported.)
import type { Request } from 'express';
import { hashMake } from '../../core/auth/hash.js';
import { PhpError } from '../../core/http/respond.js';
import { nowDb } from '../../core/time.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import { eloquentSave, poolDb } from '../../helpers/business.js';
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
export async function distinctValues(table: string, col: string) {
  const rows = await all(`select \`${col}\` from \`${table}\` group by \`${col}\` having COUNT(\`${col}\`) >= 1`);
  return rows.map((r) => ({ value: String(r[col]), label: String(r[col]) }));
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
export const whereFilter = (col: string, v: unknown) =>
  v === null || v === undefined ? { sql: `\`${col}\` IS NULL` } : { sql: `\`${col}\` = ?`, params: [v] };

const pinCode = async (id: unknown) =>
  id === null || id === undefined ? null : ((await first('select pin_code from pincodes where id = ? limit 1', [id]))?.pin_code ?? null);

/** BusinessUser::getUserDescriptionAttribute (description is an uncast string column). */
const userDescription = (d: unknown) => (typeof d === 'string' ? d : '');

export const businessUser: CrudConfig = {
  route: 'business-user',
  table: 'business_users',
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
    state: (await all('select `state` from `pincodes` group by `state` order by `state` asc')).map((r) => ({
      value: String(r.state),
      label: String(r.state),
    })),
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
    ...row,
    pincode_pin_code: await pinCode(row.pincode_id),
    user_description: userDescription(row.description),
  }),
  hooks: {
    beforeCreate: (data, req) => {
      applySingleUpload(data, req.input, 'profile_img', UPLOAD_DIR);
      return data;
    },
    // store(): after the Backpack insert, create the login user and link it.
    afterCreate: async (id, _data, req) => {
      const r = req.input;
      // $req->merge(['pincode' => $pincode]) — only reaches users.pincode (not a Backpack field).
      const pincode = r.pincode_id ?? '';
      const now = nowDb();
      const ins = await exec(
        'insert into `users` (`name`, `email`, `phone`, `status`, `state`, `district`, `pincode`, `tehsil`, `address_line`, `street_address`, `password`, `created_at`, `updated_at`) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          s(r.name),
          s(r.email),
          s(r.phone),
          s(r.status),
          s(r.state),
          s(r.district),
          pincode,
          s(r.tahsil),
          s(r.address_line_1),
          s(r.street_address),
          await hashMake(String(r.phone ?? '')),
          now,
          now,
        ],
      );
      const userId = ins.insertId;
      const user = (await first('select * from `users` where `id` = ? limit 1', [userId]))!;
      // BusinessUser::where('id', $id)->update([...]) — Eloquent builder adds updated_at.
      await exec(
        'update `business_users` set `user_id` = ?, `lft` = ?, `rgt` = ?, `depth` = ?, `password` = ?, `business_users`.`updated_at` = ? where `id` = ?',
        [userId, id + 1, id + 1, 1, user.password, nowDb(), id],
      );
      const bu = await first('select * from `business_users` where `user_id` = ? limit 1', [userId]);
      // The withFiles uploader strips its path from profile_img on model retrieval (Uploader::retrieveFiles),
      // so user_icon = uploads/user_images/<file>; a missing image gives just "uploads/user_images/".
      await eloquentSave(poolDb, 'users', user, userFill({ user_icon: 'uploads/user_images/' + withoutPath(bu?.profile_img), updated_at: nowDb() }), { massAssign: false });
    },
    beforeUpdate: (data, existing, req) => {
      applySingleUpload(data, req.input, 'profile_img', UPLOAD_DIR, existing.profile_img);
      (req as Request & { p9cUserId?: unknown }).p9cUserId = existing.user_id;
      return data;
    },
    afterUpdate: async (_id, _data, req) => {
      const r = req.input;
      const userId = (req as Request & { p9cUserId?: unknown }).p9cUserId;
      const user = userId === null || userId === undefined ? undefined : await first('select * from `users` where `id` = ? limit 1', [userId]);
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
      await eloquentSave(poolDb, 'users', user, userFill(attrs), { massAssign: false });
      const bu = await first('select * from `business_users` where `user_id` = ? limit 1', [userId]);
      await eloquentSave(poolDb, 'users', user, userFill({ user_icon: 'uploads/user_images/' + withoutPath(bu?.profile_img), updated_at: nowDb() }), { massAssign: false });
    },
  },
};

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
