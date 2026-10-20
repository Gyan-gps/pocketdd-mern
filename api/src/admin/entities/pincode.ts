// Port of App\Http\Controllers\Admin\PinCodeCrudController ("pincode") (+ PinCodeRequest / PincodeUpdateRequest,
// public/assets/js/pincode.js). Operations: List, Create, Update, Show. Model: PinCode ($guarded = ['id']).
// The Excel import routes (import-pincode-data / insertPinCodeData) live in ../phase9d-routes.ts.
import type { Request } from 'express';
import { nowDb } from '../../core/time.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import { normalizeAdminHindiField } from '../../helpers/adminHindi.js';
import type { CrudConfig } from '../crud.js';
import { onlyColumns, pluckSame, type FormOpts } from '../phase9d-support.js';

const strOf = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** `PinCode::where(...)->update([...])` — Eloquent Builder::update() also sets updated_at. */
async function massUpdate(where: Array<[string, unknown]>, values: Record<string, unknown>) {
  const sets = { ...values, updated_at: nowDb() };
  const cond = where.map(([c, v]) => (v === null || v === undefined ? `\`${c}\` IS NULL` : `\`${c}\` = ?`));
  await exec(
    `UPDATE \`pincodes\` SET ${Object.keys(sets).map((k) => `\`${k}\` = ?`).join(', ')} WHERE ${cond.join(' AND ')}`,
    [...Object.values(sets), ...where.filter(([, v]) => v !== null && v !== undefined).map(([, v]) => v)],
  );
}

/** pincode_area column: first pincode row with this pin_code → its first Address → "tehsil (tehsil_hi)". */
async function pincodeArea(pinCode: unknown): Promise<string> {
  const p = await first(
    pinCode === null || pinCode === undefined
      ? 'SELECT id FROM pincodes WHERE pin_code IS NULL LIMIT 1'
      : 'SELECT id FROM pincodes WHERE pin_code = ? LIMIT 1',
    pinCode === null || pinCode === undefined ? [] : [pinCode],
  );
  if (!p) return '-';
  const a = await first('SELECT tehsil, tehsil_hi FROM addresses WHERE pincode_id = ? LIMIT 1', [p.id]);
  if (!a) return '-';
  const hi = a.tehsil_hi;
  return strOf(a.tehsil) + (hi !== null && hi !== undefined && hi !== '' && hi !== '0' ? ` (${hi})` : '');
}

export const pincode: CrudConfig = {
  route: 'pincode',
  table: 'pincodes',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // CRUD::addClause('whereNotNull', ['pin_code', 'city', 'state']) in setup()
    where: { sql: '`pin_code` IS NOT NULL AND `city` IS NOT NULL AND `state` IS NOT NULL' },
    searchable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    sortable: ['pin_code', 'city', 'city_hi', 'district_code', 'state', 'state_hi'],
    orderBy: [['id', 'desc']],
    filters: (q) => {
      const where: Array<{ sql: string; params: unknown[] }> = [];
      if (q.pin_code !== undefined && q.pin_code !== null && q.pin_code !== '') where.push({ sql: '`pin_code` LIKE ?', params: [`%${q.pin_code}%`] });
      if (q.state !== undefined && q.state !== null && q.state !== '') where.push({ sql: '`state` = ?', params: [q.state] });
      return { where };
    },
    // Pincode::select('state')->distinct()->pluck('state', 'state')
    filterOptions: async () => ({ state: pluckSame(await all('SELECT DISTINCT state FROM pincodes'), 'state') }),
  },
  formOptions: async (_req, id): Promise<FormOpts> =>
    id ? {} : { state: pluckSame(await all('SELECT state FROM pincodes GROUP BY state ORDER BY state ASC'), 'state') },
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
    beforeCreate: async (data) => onlyColumns('pincodes', data),
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
      const fresh = await first('SELECT * FROM pincodes WHERE id = ? LIMIT 1', [existing.id]);
      if (fresh) Object.assign(existing, fresh);
      return onlyColumns('pincodes', data);
    },
  },
};
