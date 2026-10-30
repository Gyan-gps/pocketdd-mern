// Port of App\Http\Controllers\Admin\PinCodeCrudController ("pincode") (+ PinCodeRequest / PincodeUpdateRequest,
// public/assets/js/pincode.js). Operations: List, Create, Update, Show. Model: PinCode ($guarded = ['id']).
// The Excel import routes (import-pincode-data / insertPinCodeData) live in ../dashboard.ts.
import type { Request } from 'express';
import { nowDb } from '../../core/time.js';
import { like, toRow, type Filter, type Row } from '../../db/mongo.js';
import { CASE_INSENSITIVE } from '../../db/eloquent.js';
import { Address, Pincode } from '../../models/index.js';
import { createPincodeValidation, updatePincodeValidation } from '../../validators/admin/pincode.validator.js';
import { normalizeAdminHindiField } from '../../utils/hindi/admin-hindi.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, eqValue, groupValues, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { onlyColumns, pluckSame, type FormOpts } from '../support/directory-helpers.js';

const stringOf = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** `PinCode::where(...)->update([...])` — Eloquent Builder::update() also sets updated_at. */
async function massUpdate(where: Array<[string, unknown]>, values: Record<string, unknown>) {
  const filter = Object.fromEntries(
    where.map(([column, value]) => [column, value === null || value === undefined ? null : eqValue(value)]),
  );
  await Pincode.updateMany(filter, { $set: { ...values, updated_at: nowDb() } }, { collation: CASE_INSENSITIVE });
}

/** pincode_area column: first pincode row with this pin_code → its first Address → "tehsil (tehsil_hi)". */
async function pincodeArea(pinCode: unknown): Promise<string> {
  const pincode = await Pincode.findOne(
    { pin_code: pinCode === null || pinCode === undefined ? null : eqValue(pinCode) } as never,
    { _id: 1 },
    { sort: { _id: 1 }, collation: CASE_INSENSITIVE },
  ).lean<Row>();
  if (!pincode) return '-';
  const address = await Address.findOne({ pincode_id: pincode._id } as never, { tehsil: 1, tehsil_hi: 1 }, { sort: { _id: 1 } }).lean<Row>();
  if (!address) return '-';
  const tehsilHindi = address.tehsil_hi;
  return (
    stringOf(address.tehsil) +
    (tehsilHindi !== null && tehsilHindi !== undefined && tehsilHindi !== '' && tehsilHindi !== '0' ? ` (${tehsilHindi})` : '')
  );
}

export const pincode: CrudConfig = {
  route: 'pincode',
  collection: Pincode.collection.collectionName,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // CRUD::addClause('whereNotNull', ['pin_code', 'city', 'state']) in setup()
    where: { pin_code: { $ne: null }, city: { $ne: null }, state: { $ne: null } },
    searchable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    sortable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    orderBy: [['id', 'desc']],
    filters: (input) => {
      const where: Array<Filter<Row>> = [];
      if (input.pin_code !== undefined && input.pin_code !== null && input.pin_code !== '') {
        where.push({ pin_code: like(String(input.pin_code)) });
      }
      if (input.state !== undefined && input.state !== null && input.state !== '') where.push({ state: eqValue(input.state) });
      return { where };
    },
    // Pincode::select('state')->distinct()->pluck('state', 'state')
    filterOptions: async () => ({ state: pluckSame(await groupValues(Pincode.collection.collectionName, 'state'), 'state') }),
  },
  formOptions: async (_req, id): Promise<FormOpts> =>
    id ? {} : { state: pluckSame(await groupValues(Pincode.collection.collectionName, 'state', { order: 'asc' }), 'state') },
  fields: {
    create: ['state', 'city', 'pin_code', 'state_code', 'district_code'],
    update: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi', 'state_code'],
  },
  validation: { create: createPincodeValidation, update: updatePincodeValidation },
  serialize: async (row: Row) => ({ ...row, pincode_area: await pincodeArea(row.pin_code) }),
  hooks: {
    beforeCreate: async (data) => newRow('pincodes', await onlyColumns('pincodes', data)),
    // store(): after the trait store, codes + Hindi names are spread over the state / state+city rows.
    afterCreate: async (_id, _data, req: Request) => {
      const input = req.input;
      const stateHindi = await normalizeAdminHindiField(stringOf(input.state));
      const cityHindi = await normalizeAdminHindiField(stringOf(input.city));
      await massUpdate(
        [
          ['state', input.state],
          ['city', input.city],
        ],
        { district_code: input.district_code ?? null, city_hi: cityHindi },
      );
      await massUpdate([['state', input.state]], { state_code: input.state_code ?? null, state_hi: stateHindi });
    },
    // update(): the mass updates run BEFORE the trait update, which then re-reads the entry (findOrFail).
    beforeUpdate: async (data, existing, req: Request) => {
      const input = req.input;
      await massUpdate(
        [
          ['state', input.state],
          ['city', input.city],
        ],
        { district_code: input.district_code ?? null },
      );
      await massUpdate([['state', input.state]], { state_code: input.state_code ?? null });
      const fresh = toRow(await Pincode.findOne({ _id: existing.id } as never).lean<Row>());
      if (fresh) Object.assign(existing, fresh);
      const row = await onlyColumns('pincodes', data);
      coerceRow('pincodes', row);
      return row;

    },
    afterUpdate: (id, data) => storeCoerced('pincodes', id, data),
  },
};
