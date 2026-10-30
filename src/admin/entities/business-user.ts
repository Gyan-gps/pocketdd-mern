// Port of App\Http\Controllers\Admin\BusinessUserCrudController ("Staff Management") + BusinessUserRequest /
// BusinessUserUpdateRequest. Operations: List, Create, Update, Fetch (no fetch* methods → no routes), Show.
// Model BusinessUser: $guarded ['id'] (unknown columns silently dropped), appends user_description.
// (BusinessUser1CrudController exists in the PHP but is not routed — not ported.)
import type { Request } from 'express';
import { hashMake } from '../../core/auth/hash.js';
import { PhpError } from '../../core/http/response.js';
import { nowDb } from '../../core/time.js';
import type { Document } from 'mongodb';
import { insertRow, toRow, type Filter, type Row } from '../../db/mongo.js';
import { CASE_INSENSITIVE } from '../../db/eloquent.js';
import { BusinessUser, Pincode, User, modelFor, type AnyModel } from '../../models/index.js';
import {
  UPDATE_BUSINESS_USER_MESSAGES,
  createBusinessUserValidation,
  updateBusinessUserRules,
} from '../../validators/admin/business-user.validator.js';
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

const UPLOAD_DIR = 'uploads/user_images';
const nullIfMissing = (value: unknown) => (value === undefined ? null : value);

/** Request property carrying the staff row's user_id from beforeUpdate to afterUpdate. */
type StaffUpdateRequest = Request & { staffUserId?: unknown };

/** `select <col> from business_users group by <col> having COUNT(<col>) >= 1` → pluck(col, col). */
export async function distinctValues(table: string, field: string) {
  return groupValues(modelFor(table), field, { [field]: { $ne: null } }, { first: 1 });
}

/** The "Sort By" dropdown filter (both Staff and Event lists): resets orders; Backpack then appends `id DESC`. */
export function sortingFilter(input: Record<string, unknown>): ListFilterResult['orderBy'] | undefined {
  if (!('sorting' in input)) return undefined;
  const orderBySorting: Record<string, [string, 'asc' | 'desc']> = {
    a_z: ['name', 'asc'],
    z_a: ['name', 'desc'],
    newest: ['created_at', 'desc'],
    oldest: ['created_at', 'asc'],
  };
  const order = orderBySorting[String(input.sorting)];
  return order ? [order, ['id', 'desc']] : [['id', 'desc']];
}

/** `$this->crud->addClause('where', $col, $value)` — a NULL value becomes `IS NULL`. */
export const whereFilter = (field: string, value: unknown): Filter<Row> =>
  value === null || value === undefined ? { [field]: null } : { [field]: looseInt(value) };

/**
 * `GROUP BY <field>` (case-insensitive, one group per value; the first row's spelling) → pluck(field, field).
 * Ordered by first appearance (MySQL's temporary-table order) or by the value (`ORDER BY <field> ASC`).
 */
async function groupValues(model: AnyModel, field: string, match: Document, order: { first: 1 } | { value: 1 }) {
  const rows = await model
    .aggregate<Document>([
      { $match: match },
      { $sort: { _id: 1 } },
      { $group: { _id: `$${field}`, value: { $first: `$${field}` }, first: { $min: '$_id' } } },
      { $sort: 'first' in order ? { first: 1 } : { _id: 1 } },
    ])
    .option({ collation: CASE_INSENSITIVE });
  return rows.map((row) => ({ value: String(row.value), label: String(row.value) }));
}

const pinCode = async (id: unknown) =>
  id === null || id === undefined ? null : ((await fieldById(Pincode, id, 'pin_code'))?.value ?? null);

/** BusinessUser::getUserDescriptionAttribute (description is an uncast string column). */
const userDescription = (description: unknown) => (typeof description === 'string' ? description : '');

export const businessUser: CrudConfig = {
  route: 'business-user',
  collection: BusinessUser.collection.collectionName,
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
    filters: (input) => {
      const where: NonNullable<ListFilterResult['where']> = [];
      for (const column of ['name', 'state', 'district', 'status']) if (column in input) where.push(whereFilter(column, input[column]));
      return { where, orderBy: sortingFilter(input) };
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
    state: await groupValues(Pincode, 'state', {}, { value: 1 }),
  }),
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: createBusinessUserValidation,
    update: {
      // $id = $this->get('id') ?? request()->route('id') — the Backpack edit form posts a hidden `id`.
      rules: (req: Request, id: string) => updateBusinessUserRules(req.input.id ?? id),
      messages: UPDATE_BUSINESS_USER_MESSAGES,
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
      const input = req.input;
      // $req->merge(['pincode' => $pincode]) — only reaches users.pincode (not a Backpack field).
      const pincode = input.pincode_id ?? '';
      const now = nowDb();
      const userId = await insertRow(
        User.collection.collectionName,
        newRow('users', {
          name: nullIfMissing(input.name),
          email: nullIfMissing(input.email),
          phone: nullIfMissing(input.phone),
          status: nullIfMissing(input.status),
          state: nullIfMissing(input.state),
          district: nullIfMissing(input.district),
          pincode,
          tehsil: nullIfMissing(input.tehsil),
          address_line: nullIfMissing(input.address_line_1),
          street_address: nullIfMissing(input.street_address),
          password: await hashMake(String(input.phone ?? '')),
          created_at: now,
          updated_at: now,
        }),
      );
      const user = await userRow(userId);
      // BusinessUser::where('id', $id)->update([...]) — Eloquent builder adds updated_at.
      await setColumns('business_users', id, {
        user_id: userId,
        lft: id + 1,
        rgt: id + 1,
        depth: 1,
        password: user!.password,
        updated_at: nowDb(),
      });
      const staff = await staffByUser(userId);
      // The withFiles uploader strips its path from profile_img on model retrieval (Uploader::retrieveFiles),
      // so user_icon = uploads/user_images/<file>; a missing image gives just "uploads/user_images/".
      await modelSave(
        'users',
        user!,
        userFill({ user_icon: 'uploads/user_images/' + withoutPath(staff?.profile_img), updated_at: nowDb() }),
        { massAssign: false },
      );
    },
    beforeUpdate: (data, existing, req) => {
      applySingleUpload(data, req.input, 'profile_img', UPLOAD_DIR, existing.profile_img);
      (req as StaffUpdateRequest).staffUserId = existing.user_id;
      return coerceRow('business_users', data);
    },
    afterUpdate: async (_id, _data, req) => {
      const input = req.input;
      const userId = (req as StaffUpdateRequest).staffUserId;
      const user = userId === null || userId === undefined ? undefined : await userRow(userId);
      // Laravel quirk: a staff row without a users row fails AFTER the business_users update was saved.
      if (!user) throw new PhpError('Call to a member function update() on null');
      const attrs: Record<string, unknown> = {
        name: nullIfMissing(input.name),
        phone: nullIfMissing(input.phone),
        email: nullIfMissing(input.email),
      };
      // `$request->password` is never sent by this form → always the first branch (no password change).
      if (input.password !== null && input.password !== undefined) attrs.password = await hashMake(String(input.password)); // 'hashed' cast
      Object.assign(attrs, {
        status: nullIfMissing(input.status),
        address_line: nullIfMissing(input.address_line_1),
        street_address: nullIfMissing(input.street_address),
        updated_at: nowDb(),
      });
      await modelSave('users', user, userFill(attrs), { massAssign: false });
      const staff = await staffByUser(userId);
      await modelSave(
        'users',
        user,
        userFill({ user_icon: 'uploads/user_images/' + withoutPath(staff?.profile_img), updated_at: nowDb() }),
        { massAssign: false },
      );
    },
  },
};

/** `select * from users where id = ? limit 1`. */
const userRow = async (id: unknown) => toRow(await User.findOne({ _id: id } as never).lean<Row>()) ?? undefined;

/** `select * from business_users where user_id = ? limit 1`. */
const staffByUser = (userId: unknown) => BusinessUser.findOne({ user_id: userId } as never, null, { sort: { _id: 1 } }).lean<Row>();

/** Uploader::getValueWithoutPath(): Str::after($value, 'uploads/user_images/'); null → ''. */
function withoutPath(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const path = String(value);
  const prefixIndex = path.indexOf(UPLOAD_DIR + '/');
  return prefixIndex === -1 ? path : path.slice(prefixIndex + UPLOAD_DIR.length + 1);
}

/**
 * User::update() mass assignment: only User::$fillable (name, email, password, user_icon, address_line,
 * street_address) is written — Laravel quirk: phone, status and the explicit updated_at are silently dropped
 * (updated_at is still touched by the timestamps when something is dirty).
 */
const USER_FILLABLE = new Set(['name', 'email', 'password', 'user_icon', 'address_line', 'street_address']);
function userFill(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => USER_FILLABLE.has(key)));

}
