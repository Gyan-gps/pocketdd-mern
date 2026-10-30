// Port of App\Http\Controllers\Admin\CityHelplineNumberCrudController ("helpline number")
// (+ CityHelplineNumberRequest / CityHelplineNumberUpdateRequest, public/assets/js/city_helpline_number.js).
// Operations: List, Create, Update, Show. Model: CityHelplineNumber ($casts city_helpline => array, plus a
// getCityHelplineAttribute() accessor that json_decodes the raw value and foreach()es it).
import type { Row } from '../../db/mongo.js';
import { CityHelplineNumber } from '../../models/index.js';
import {
  createCityHelplineNumberValidation,
  updateCityHelplineNumberValidation,
} from '../../validators/admin/city-helpline-number.validator.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, groupValues, newRow, storeCoerced, eqFilter } from '../support/catalog-helpers.js';
import {
  decodeAssoc,
  decodeRepeatableInput,
  jsonCastWrite,
  keepIfJsonEquivalent,
  onlyColumns,
  phpEmpty,
  pinCodeColumn,
  pluckSame,
  stateOptions,
  type FormOpts,
} from '../support/directory-helpers.js';

const LABELS: Record<string, string> = {
  ambulance_no: 'Ambulance Number',
  fire_safety: 'Fire Safety',
  women_helpline: 'Women Helpline',
  police_headquarters: 'Police Headquarters',
};

const phpType = (value: unknown) =>
  value === null || value === undefined
    ? 'null'
    : typeof value === 'boolean'
      ? 'bool'
      : typeof value === 'number'
        ? Number.isInteger(value)
          ? 'int'
          : 'float'
        : typeof value;

/**
 * CityHelplineNumber::getCityHelplineAttribute($raw).
 * Laravel quirk: a NULL / non-JSON / scalar value makes `foreach` emit "foreach() argument must be of type
 * array|object, null given", which Laravel turns into an ErrorException — the whole list page answers 500.
 */
export function cityHelplineAccessor(raw: unknown): unknown {
  const data = decodeAssoc(raw);
  if (data === null || data === undefined || typeof data !== 'object') {
    throw new Error(`foreach() argument must be of type array|object, ${phpType(data)} given`);
  }
  const items = Array.isArray(data) ? data : Object.values(data as object);
  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const helpline = item as Record<string, unknown>;
      if (helpline.name !== undefined && helpline.name !== null && typeof helpline.name === 'string' && LABELS[helpline.name]) {
        helpline.name = LABELS[helpline.name];
      }
    }
  }
  return data;
}

/** `$data[0]['key'] ?? '-'` rendered by a closure column (empty → '-'). */
function firstRowValue(data: unknown, key: string): unknown {
  const firstRow = Array.isArray(data) ? data[0] : data && typeof data === 'object' ? (data as Record<string, unknown>)['0'] : undefined;
  const value = firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow) ? (firstRow as Record<string, unknown>)[key] : undefined;
  const display = value === undefined || value === null ? '-' : value;
  return phpEmpty(display) ? '-' : display;
}

export const cityHelplineNumber: CrudConfig = {
  route: 'city-helpline-number',
  collection: CityHelplineNumber.collection.collectionName,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // closure columns are not searchable; state/city and `pincode_id` (->type('text')) are.
    searchable: ['state', 'city', 'pincode_id'],
    sortable: ['state', 'city', 'pincode_id'],
    orderBy: [['id', 'desc']],
    filters: (input) => ({ where: [...eqFilter(input, 'state'), ...eqFilter(input, 'district', 'city')] }),
    filterOptions: async () => ({
      state: pluckSame(
        await groupValues(CityHelplineNumber.collection.collectionName, 'state', { match: { state: { $ne: null } } }),
        'state',
      ),
      district: pluckSame(
        await groupValues(CityHelplineNumber.collection.collectionName, 'city', { match: { city: { $ne: null } } }),
        'city',
      ),
    }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => (id ? {} : { state: await stateOptions() }),
  fields: {
    create: ['state', 'city', 'pincode_id', 'city_helpline'],
    // the update form's pincode_id relationship field is `disabled`, so browsers never submit it.
    update: ['state', 'city', 'pincode_id', 'city_helpline'],
  },
  validation: {
    create: {
      rules: (req) => {
        decodeRepeatableInput(req, 'city_helpline');
        return { ...createCityHelplineNumberValidation.rules };
      },
      messages: createCityHelplineNumberValidation.messages,
    },
    update: {
      rules: (req) => {
        decodeRepeatableInput(req, 'city_helpline');
        return { ...updateCityHelplineNumberValidation.rules };
      },
      messages: updateCityHelplineNumberValidation.messages,
    },
  },
  serialize: async (row: Row) => {
    const data = cityHelplineAccessor(row.city_helpline);
    return {
      ...row,
      city_helpline: data,
      ambulance_number: firstRowValue(data, 'ambulance_number'),
      fire_safety_number: firstRowValue(data, 'fire_safety_number'),
      women_helpline: firstRowValue(data, 'women_helpline'),
      police_headquarters: firstRowValue(data, 'police_headquarters'),
      pincode: await pinCodeColumn(row.pincode_id),
    };
  },
  hooks: {
    beforeCreate: async (data) => {
      if ('city_helpline' in data) data.city_helpline = jsonCastWrite(data.city_helpline);
      return newRow('city_helpline_numbers', await onlyColumns('city_helpline_numbers', data));
    },
    beforeUpdate: async (data, existing) => {
      if ('city_helpline' in data) {
        data.city_helpline = keepIfJsonEquivalent(existing, 'city_helpline', jsonCastWrite(data.city_helpline));
      }
      const row = await onlyColumns('city_helpline_numbers', data);
      coerceRow('city_helpline_numbers', row);
      return row;

    },
    afterUpdate: (id, data) => storeCoerced('city_helpline_numbers', id, data),
  },
};
