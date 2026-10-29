// Port of App\Http\Controllers\Admin\PinCodeCrudController ("pincode") (+ PinCodeRequest / PincodeUpdateRequest,
// public/assets/js/pincode.js). Operations: List, Create, Update, Show. Model: PinCode ($guarded = ['id']).
// The Excel import routes (import-pincode-data / insertPinCodeData) live in ../dashboard.ts.
import type { Request } from 'express';
import { nowDb } from '../../core/time.js';
import { C, col, like, toRow, type Filter, type Row } from '../../db/mongo.js';
import { normalizeAdminHindiField } from '../../utils/hindi/admin-hindi.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, eqValue, groupValues, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { onlyColumns, pluckSame, type FormOpts } from '../support/directory-helpers.js';

const strOf = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** `PinCode::where(...)->update([...])` — Eloquent Builder::update() also sets updated_at. */
async function massUpdate(where: Array<[string, unknown]>, values: Record<string, unknown>) {
  const filter = Object.fromEntries(where.map(([c, v]) => [c, v === null || v === undefined ? null : eqValue(v)]));
  await col(C.pincodes).updateMany(filter, { $set: { ...values, updated_at: nowDb() } }, { collation: { locale: 'en', strength: 2 } });
}

/** pincode_area column: first pincode row with this pin_code → its first Address → "tehsil (tehsil_hi)". */
async function pincodeArea(pinCode: unknown): Promise<string> {
  const p = await col(C.pincodes).findOne(
    { pin_code: pinCode === null || pinCode === undefined ? null : eqValue(pinCode) } as never,
    { projection: { _id: 1 }, sort: { _id: 1 }, collation: { locale: 'en', strength: 2 } },
  );
  if (!p) return '-';
  const a = await col(C.addresses).findOne({ pincode_id: p._id } as never, { projection: { tehsil: 1, tehsil_hi: 1 }, sort: { _id: 1 } });
  if (!a) return '-';
  const hi = a.tehsil_hi;
  return strOf(a.tehsil) + (hi !== null && hi !== undefined && hi !== '' && hi !== '0' ? ` (${hi})` : '');
}

export const pincode: CrudConfig = {
  route: 'pincode',
  collection: C.pincodes,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // CRUD::addClause('whereNotNull', ['pin_code', 'city', 'state']) in setup()
    where: { pin_code: { $ne: null }, city: { $ne: null }, state: { $ne: null } },
    searchable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    sortable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    orderBy: [['id', 'desc']],
    filters: (q) => {
      const where: Array<Filter<Row>> = [];
      if (q.pin_code !== undefined && q.pin_code !== null && q.pin_code !== '') where.push({ pin_code: like(String(q.pin_code)) });
      if (q.state !== undefined && q.state !== null && q.state !== '') where.push({ state: eqValue(q.state) });
      return { where };
    },
    // Pincode::select('state')->distinct()->pluck('state', 'state')
    filterOptions: async () => ({ state: pluckSame(await groupValues(C.pincodes, 'state'), 'state') }),
  },
  formOptions: async (_req, id): Promise<FormOpts> =>
    id ? {} : { state: pluckSame(await groupValues(C.pincodes, 'state', { order: 'asc' }), 'state') },
  fields: {
    create: ['state', 'city', 'pin_code', 'state_code', 'district_code'],
    update: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi', 'state_code'],
  },
  validation: {
    create: {
      rules: {
        pin_code: 'required|unique:pincodes,pin_code',
        city: 'required',
        district_code: 'required',
        state: 'required',
        state_code: 'required',
      },
      messages: {
        'pin_code.required': 'PinCode is required.',
        'pin_code.unique': 'This PinCode already exists.',
        'city.required': 'District is required.',
        'district_code.required': 'District Code is required.',
        'state.required': 'State is required.',
        'state_code.required': 'State Code is required.',
      },
    },
    update: {
      rules: {
        pin_code: 'required',
        city: 'required',
        city_hi: 'required',
        district_code: 'required',
        state: 'required',
        state_hi: 'required',
        state_code: 'required',
      },
      // PincodeUpdateRequest::messages() only has (copy-pasted) business-category keys → raw `validation.required`.
    },
  },
  serialize: async (row: Row) => ({ ...row, pincode_area: await pincodeArea(row.pin_code) }),
  hooks: {
    beforeCreate: async (data) => newRow('pincodes', await onlyColumns('pincodes', data)),
    // store(): after the trait store, codes + Hindi names are spread over the state / state+city rows.
    afterCreate: async (_id, _data, req: Request) => {
      const q = req.input;
      const stateHi = await normalizeAdminHindiField(strOf(q.state));
      const cityHi = await normalizeAdminHindiField(strOf(q.city));
      await massUpdate(
        [
          ['state', q.state],
          ['city', q.city],
        ],
        { district_code: q.district_code ?? null, city_hi: cityHi },
      );
      await massUpdate([['state', q.state]], { state_code: q.state_code ?? null, state_hi: stateHi });
    },
    // update(): the mass updates run BEFORE the trait update, which then re-reads the entry (findOrFail).
    beforeUpdate: async (data, existing, req: Request) => {
      const q = req.input;
      await massUpdate(
        [
          ['state', q.state],
          ['city', q.city],
        ],
        { district_code: q.district_code ?? null },
      );
      await massUpdate([['state', q.state]], { state_code: q.state_code ?? null });
      const fresh = toRow(await col(C.pincodes).findOne({ _id: existing.id } as never));
      if (fresh) Object.assign(existing, fresh);
      const out = await onlyColumns('pincodes', data);
      coerceRow('pincodes', out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced('pincodes', id, data),
  },
};
