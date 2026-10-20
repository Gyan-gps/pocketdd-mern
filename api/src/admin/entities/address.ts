// Port of App\Http\Controllers\Admin\AddressCrudController ("Area & Local Area")
// (+ AddressRequest, public/assets/js/get_address_city.js + address_city_counter.js, views/address/*).
// Operations: List, Create, Update, Show. Model: Address ($casts area => array, getAreaDisplay(),
// getAreaHiDisplay()). setupUpdateOperation() sets no validation: updates are not validated.
import type { Row } from '../../db/pool.js';
import { first } from '../../db/pool.js';
import { phpJsonDecodeAssoc } from '../../helpers/business.js';
import type { CrudConfig } from '../crud.js';
import {
  decodeRepeatableInput,
  eqWhere,
  jsonCastWrite,
  keepIfJsonEquivalent,
  onlyColumns,
  stateOptions,
  type FormOpts,
} from '../phase9d-support.js';

const MESSAGES = {
  'state.required': 'Please select a state.',
  'city.required': 'Please select a city.',
  'pincode_id.required': 'Please select a pincode.',
  'tehsil.required': 'The tehsil field is required.',
  'tehsil_hi.required': 'तहसील फ़ील्ड आवश्यक है.',
  'area.*.area_name.required': 'Each area must have a name.',
  'area.*.area_name_hi.required': 'प्रत्येक क्षेत्र का एक नाम होना चाहिए.',
};

/** collect($area)->pluck($key)->implode(', ') — collect(null) is empty, a scalar is a one-item list. */
function pluckImplode(area: unknown, key: string): string {
  const items = area === null || area === undefined ? [] : typeof area === 'object' ? Object.values(area as object) : [area];
  return items
    .map((i) => (i && typeof i === 'object' && !Array.isArray(i) ? (i as Record<string, unknown>)[key] : null))
    .map((v) => (v === null || v === undefined || v === false ? '' : v === true ? '1' : String(v)))
    .join(', ');
}

/** `area` array cast read (json_decode($v, true)). */
const areaCast = (raw: unknown) => phpJsonDecodeAssoc(raw);

export const address: CrudConfig = {
  route: 'address',
  table: 'addresses',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // text columns state, city, tehsil, tehsil_hi; the pincode closure column's searchLogic → orWhereHas.
    searchable: ['state', 'city', 'tehsil', 'tehsil_hi'],
    searchExtra: (term) => ({
      sql: 'EXISTS (SELECT * FROM `pincodes` WHERE `addresses`.`pincode_id` = `pincodes`.`id` AND `pin_code` LIKE ?)',
      params: [`%${term}%`],
    }),
    sortable: ['state', 'city', 'tehsil', 'tehsil_hi'],
    orderBy: [['id', 'desc']],
    filters: (q) => {
      const where = [...eqWhere(q, 'state')];
      const pin = q.pincode_id;
      if (pin !== undefined && pin !== null && pin !== '') {
        where.unshift({
          sql: 'EXISTS (SELECT * FROM `pincodes` WHERE `addresses`.`pincode_id` = `pincodes`.`id` AND `pin_code` LIKE ?)',
          params: [`%${pin}%`],
        });
      }
      return { where };
    },
    filterOptions: async () => ({ state: await stateOptions() }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => {
    if (!id) return { state: await stateOptions() };
    const entry = await first('SELECT pincode_id FROM addresses WHERE id = ? LIMIT 1', [id]);
    const pin = entry?.pincode_id ? await first('SELECT id, pin_code FROM pincodes WHERE id = ? LIMIT 1', [entry.pincode_id]) : null;
    return { pincode_id: pin ? [{ value: String(pin.id), label: String(pin.pin_code ?? '') }] : [] };
  },
  fields: {
    create: ['state', 'city', 'pincode_id', 'tehsil', 'tehsil_hi', 'area'],
    // the update form's pincode_id relationship field is `disabled` (never submitted by browsers).
    update: ['state', 'city', 'pincode_id', 'tehsil', 'tehsil_hi', 'area'],
  },
  validation: {
    create: {
      rules: (req) => {
        decodeRepeatableInput(req, 'area');
        return {
          state: 'required',
          city: 'required',
          pincode_id: 'required',
          tehsil: 'required',
          tehsil_hi: 'required',
          'area.*.area_name': 'required',
          'area.*.area_name_hi': 'required',
        };
      },
      messages: MESSAGES,
    },
    update: {
      // no CRUD::setValidation() in setupUpdateOperation(): nothing is validated.
      rules: (req) => {
        decodeRepeatableInput(req, 'area');
        return {};
      },
    },
  },
  serialize: async (row: Row) => {
    const area = areaCast(row.area);
    const pin = row.pincode_id ? await first('SELECT pin_code FROM pincodes WHERE id = ? LIMIT 1', [row.pincode_id]) : null;
    return {
      ...row,
      area,
      // optional(PinCode::find($entry->pincode_id))->pin_code ?? '-'
      pincode: pin?.pin_code ?? '-',
      // show view: optional($entry->pinCode)->pin_code
      pin_code: pin ? (pin.pin_code ?? null) : null,
      area_display: pluckImplode(area, 'area_name'),
      area_hi_display: area !== null && typeof area === 'object' ? pluckImplode(area, 'area_name_hi') : 'N/A',
    };
  },
  hooks: {
    beforeCreate: async (data) => {
      if ('area' in data) data.area = jsonCastWrite(data.area);
      return onlyColumns('addresses', data);
    },
    beforeUpdate: async (data, existing) => {
      if ('area' in data) data.area = keepIfJsonEquivalent(existing, 'area', jsonCastWrite(data.area));
      return onlyColumns('addresses', data);
    },
  },
};
