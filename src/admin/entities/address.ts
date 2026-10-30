// Port of App\Http\Controllers\Admin\AddressCrudController ("Area & Local Area")
// (+ AddressRequest, public/assets/js/get_address_city.js + address_city_counter.js, views/address/*).
// Operations: List, Create, Update, Show. Model: Address ($casts area => array, getAreaDisplay(),
// getAreaHiDisplay()). setupUpdateOperation() sets no validation: updates are not validated.
import type { Row } from '../../db/mongo.js';
import { Address, Pincode } from '../../models/index.js';
import { createAddressValidation, updateAddressValidation } from '../../validators/admin/address.validator.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, findById, newRow, storeCoerced, eqFilter } from '../support/catalog-helpers.js';
import {
  decodeAssoc,
  decodeRepeatableInput,
  jsonCastWrite,
  keepIfJsonEquivalent,
  onlyColumns,
  pinCodeIdsLike,
  rawJson,
  stateOptions,
  type FormOpts,
} from '../support/directory-helpers.js';

/** collect($area)->pluck($key)->implode(', ') — collect(null) is empty, a scalar is a one-item list. */
function pluckImplode(area: unknown, key: string): string {
  const items = area === null || area === undefined ? [] : typeof area === 'object' ? Object.values(area as object) : [area];
  return items
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>)[key] : null))
    .map((value) => (value === null || value === undefined || value === false ? '' : value === true ? '1' : String(value)))
    .join(', ');
}

/** `area` array cast read (json_decode($v, true)). */
const areaCast = (raw: unknown) => decodeAssoc(raw);

export const address: CrudConfig = {
  route: 'address',
  collection: 'addresses',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // text columns state, city, tehsil, tehsil_hi; the pincode closure column's searchLogic → orWhereHas.
    searchable: ['state', 'city', 'tehsil', 'tehsil_hi'],
    searchExtra: (term) => pinCodeIdsLike(term),
    sortable: ['state', 'city', 'tehsil', 'tehsil_hi'],
    orderBy: [['id', 'desc']],
    filters: async (input) => {
      const where = [...eqFilter(input, 'state')];
      const pinCode = input.pincode_id;
      if (pinCode !== undefined && pinCode !== null && pinCode !== '') where.unshift(await pinCodeIdsLike(String(pinCode)));
      return { where };
    },
    filterOptions: async () => ({ state: await stateOptions() }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => {
    if (!id) return { state: await stateOptions() };
    const entry = await findById(Address.collection.collectionName, id, { pincode_id: 1 });
    const pincode = entry?.pincode_id ? await findById(Pincode.collection.collectionName, entry.pincode_id, { pin_code: 1 }) : null;
    return { pincode_id: pincode ? [{ value: String(pincode.id), label: String(pincode.pin_code ?? '') }] : [] };
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
        return { ...createAddressValidation.rules };
      },
      messages: createAddressValidation.messages,
    },
    update: {
      // no CRUD::setValidation() in setupUpdateOperation(): nothing is validated.
      rules: (req) => {
        decodeRepeatableInput(req, 'area');
        return { ...updateAddressValidation.rules };
      },
    },
  },
  serialize: async (row: Row) => {
    const area = areaCast(row.area);
    const pincode = row.pincode_id ? await findById(Pincode.collection.collectionName, row.pincode_id, { pin_code: 1 }) : null;
    return {
      ...row,
      area,
      area_hi: rawJson(row.area_hi),
      // optional(PinCode::find($entry->pincode_id))->pin_code ?? '-'
      pincode: pincode?.pin_code ?? '-',
      // show view: optional($entry->pinCode)->pin_code
      pin_code: pincode ? (pincode.pin_code ?? null) : null,
      area_display: pluckImplode(area, 'area_name'),
      area_hi_display: area !== null && typeof area === 'object' ? pluckImplode(area, 'area_name_hi') : 'N/A',
    };
  },
  hooks: {
    beforeCreate: async (data) => {
      if ('area' in data) data.area = jsonCastWrite(data.area);
      return newRow('addresses', await onlyColumns('addresses', data));
    },
    beforeUpdate: async (data, existing) => {
      if ('area' in data) data.area = keepIfJsonEquivalent(existing, 'area', jsonCastWrite(data.area));
      const row = await onlyColumns('addresses', data);
      coerceRow('addresses', row);
      return row;

    },
    afterUpdate: (id, data) => storeCoerced('addresses', id, data),
  },
};
