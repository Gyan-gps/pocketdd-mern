// Port of App\Http\Controllers\Admin\CityHelplineNumberCrudController ("helpline number")
// (+ CityHelplineNumberRequest / CityHelplineNumberUpdateRequest, public/assets/js/city_helpline_number.js).
// Operations: List, Create, Update, Show. Model: CityHelplineNumber ($casts city_helpline => array, plus a
// getCityHelplineAttribute() accessor that json_decodes the raw value and foreach()es it).
import type { Row } from '../../db/pool.js';
import { all } from '../../db/pool.js';
import { phpJsonDecodeAssoc } from '../../helpers/business.js';
import type { CrudConfig } from '../crud.js';
import {
  decodeRepeatableInput,
  eqWhere,
  jsonCastWrite,
  keepIfJsonEquivalent,
  onlyColumns,
  phpEmpty,
  pinCodeColumn,
  pluckSame,
  stateOptions,
  type FormOpts,
} from '../phase9d-support.js';

const HELPLINE_RULES = {
  'city_helpline.*.ambulance_number': 'required',
  'city_helpline.*.fire_safety_number': 'required',
  'city_helpline.*.women_helpline': 'required',
  'city_helpline.*.police_headquarters': 'required',
};

const MESSAGES = {
  'city_helpline.*.ambulance_number.required': 'Ambulance Number is Required',
  'city_helpline.*.fire_safety_number.required': 'Fire Safety Number is Required',
  'city_helpline.*.women_helpline.required': 'Women Helpline Number is Required',
  'city_helpline.*.police_headquarters.required': 'Police Headquarter Number is Required',
  // Laravel: a message keyed by the bare attribute applies to every rule of that attribute.
  state: 'State is Required!',
  city: 'City is Required!',
  pincode_id: 'PinCode is Required!',
};

const LABELS: Record<string, string> = {
  ambulance_no: 'Ambulance Number',
  fire_safety: 'Fire Safety',
  women_helpline: 'Women Helpline',
  police_headquarters: 'Police Headquarters',
};

const phpType = (v: unknown) =>
  v === null || v === undefined ? 'null' : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v;

/**
 * CityHelplineNumber::getCityHelplineAttribute($raw).
 * Laravel quirk: a NULL / non-JSON / scalar value makes `foreach` emit "foreach() argument must be of type
 * array|object, null given", which Laravel turns into an ErrorException — the whole list page answers 500.
 */
export function cityHelplineAccessor(raw: unknown): unknown {
  const data = typeof raw === 'string' ? phpJsonDecodeAssoc(raw) : raw;
  if (data === null || data === undefined || typeof data !== 'object') {
    throw new Error(`foreach() argument must be of type array|object, ${phpType(data)} given`);
  }
  const items = Array.isArray(data) ? data : Object.values(data as object);
  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const it = item as Record<string, unknown>;
      if (it.name !== undefined && it.name !== null && typeof it.name === 'string' && LABELS[it.name]) it.name = LABELS[it.name];
    }
  }
  return data;
}

/** `$data[0]['key'] ?? '-'` rendered by a closure column (empty → '-'). */
function firstRowValue(data: unknown, key: string): unknown {
  const row0 = Array.isArray(data) ? data[0] : data && typeof data === 'object' ? (data as Record<string, unknown>)['0'] : undefined;
  const v = row0 && typeof row0 === 'object' && !Array.isArray(row0) ? (row0 as Record<string, unknown>)[key] : undefined;
  const out = v === undefined || v === null ? '-' : v;
  return phpEmpty(out) ? '-' : out;
}

export const cityHelplineNumber: CrudConfig = {
  route: 'city-helpline-number',
  table: 'city_helpline_numbers',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // closure columns are not searchable; state/city and `pincode_id` (->type('text')) are.
    searchable: ['state', 'city', 'pincode_id'],
    sortable: ['state', 'city', 'pincode_id'],
    orderBy: [['id', 'desc']],
    filters: (q) => ({ where: [...eqWhere(q, 'state'), ...eqWhere(q, 'district', 'city')] }),
    filterOptions: async () => ({
      state: pluckSame(await all('SELECT state FROM city_helpline_numbers GROUP BY state HAVING COUNT(state) >= 1'), 'state'),
      district: pluckSame(await all('SELECT city FROM city_helpline_numbers GROUP BY city HAVING COUNT(city) >= 1'), 'city'),
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
        return { ...HELPLINE_RULES, state: 'required', city: 'required', pincode_id: 'required' };
      },
      messages: MESSAGES,
    },
    update: {
      rules: (req) => {
        decodeRepeatableInput(req, 'city_helpline');
        return { ...HELPLINE_RULES, state: 'required', city: 'required' };
      },
      messages: MESSAGES,
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
      return onlyColumns('city_helpline_numbers', data);
    },
    beforeUpdate: async (data, existing) => {
      if ('city_helpline' in data) {
        data.city_helpline = keepIfJsonEquivalent(existing, 'city_helpline', jsonCastWrite(data.city_helpline));
      }
      return onlyColumns('city_helpline_numbers', data);
    },
  },
};
