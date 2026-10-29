// Port of App\Http\Controllers\Admin\AdministratorCrudController ("Officers Contact")
// (+ AdministratorRequest / AdministratorUpdateRequest, public/assets/js/administrator.js).
// Operations: List, Create, Update, Show (Delete is commented out). Model: Administrator
// ($casts officer_rank_name => json, $guarded = ['id'] → non-columns such as `pincode_show` are dropped).
import { C, col, like, toRows, type Row } from '../../db/mongo.js';
import type { CrudConfig } from '../crud.js';
import { NEVER, coerceRow, findById, groupValues, newRow, storeCoerced, eqFilter } from '../support/catalog-helpers.js';
import {
  decodeAssoc,
  decodeRepeatableInput,
  jsonCastWrite,
  keepIfJsonEquivalent,
  onlyColumns,
  pinCodeColumn,
  pluckSame,
  stateOptions,
  type FormOpts,
} from '../support/directory-helpers.js';

const RULES = {
  department_id: 'required',
  'officer_rank_name.*.officer_rank': 'required',
  'officer_rank_name.*.officer_rank_hi': 'required',
  'officer_rank_name.*.officer_number': 'required',
};

const MESSAGES = {
  'department_id.required': 'Department is not selected! / विभाग चयनित नहीं किया गया है!',
  'officer_rank_name.*.officer_rank.required':
    'Officer rank (English) is not entered! / अधिकारी रैंक (अंग्रेज़ी) दर्ज नहीं की गई है!',
  'officer_rank_name.*.officer_rank_hi.required':
    'Officer rank (Hindi) is not entered! / अधिकारी रैंक (हिंदी) दर्ज नहीं की गई है!',
  'officer_rank_name.*.officer_number.required':
    'Number of officers is not entered! / अधिकारियों की संख्या दर्ज नहीं की गई है!',
};

/** json cast read: json_decode($v, true). */
const officerRanks = (raw: unknown) => decodeAssoc(raw);

/** `Department::…->get()` rows (no ORDER BY → primary key order unless given). */
const departments = async (filter: Record<string, unknown>, sort: 1 | -1 = 1) =>
  toRows(await col(C.departments).find(filter).sort({ _id: sort }).toArray());

export const administrator: CrudConfig = {
  route: 'administrator',
  collection: 'administrators',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Text columns state/city and `pincode_id` (->type('text'), a table column) search with LIKE;
    // the department column's searchLogic adds orWhereHas('department', department_name LIKE).
    searchable: ['state', 'city', 'pincode_id'],
    searchExtra: async (term) => {
      const deps = await col(C.departments).find({ department_name: like(term) }, { projection: { _id: 1 } }).toArray();
      return deps.length ? { department_id: { $in: deps.map((d) => d._id) } } : NEVER;
    },
    sortable: ['department_id', 'state', 'city', 'pincode_id', 'status'],
    orderBy: [['id', 'desc']],
    filters: (q) => ({
      where: [...eqFilter(q, 'department_id'), ...eqFilter(q, 'state'), ...eqFilter(q, 'status')],
    }),
    filterOptions: async () => ({
      // Department::pluck('department_name', 'id')
      department_id: (await departments({})).map((d) => ({
        value: String(d.id),
        label: String(d.department_name ?? ''),
      })),
      // PinCode::query()->whereNotNull('state')->distinct()->pluck('state', 'state')
      state: pluckSame(await groupValues(C.pincodes, 'state', { match: { state: { $ne: null } } }), 'state'),
      status: [
        { value: '1', label: 'Active' },
        { value: '0', label: 'Inactive' },
      ],
    }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => {
    if (!id) {
      const deps = await departments({}, -1);
      return {
        state: await stateOptions(),
        department_id: deps.map((d) => ({
          value: String(d.id),
          label: `${d.department_name ?? ''} (${d.department_name_hi ?? ''})`,
        })),
      };
    }
    // Update form: Department::where('status', 1)->pluck('department_name', 'id').
    const deps = await departments({ status: 1 });
    const entry = await findById(C.administrators, id, { pincode_id: 1 });
    const pin = entry?.pincode_id ? await findById(C.pincodes, entry.pincode_id, { pin_code: 1 }) : null;
    return {
      department_id: deps.map((d) => ({ value: String(d.id), label: String(d.department_name ?? '') })),
      // `pincode_show` value: PinCode::find($entry->pincode_id)->pin_code ?? '-'
      pincode_show: [{ value: String(pin?.pin_code ?? '-'), label: String(pin?.pin_code ?? '-') }],
    };
  },
  fields: {
    create: ['state', 'city', 'pincode_id', 'department_id', 'officer_rank_name', 'status'],
    update: ['state', 'city', 'pincode_show', 'department_id', 'officer_rank_name', 'status', 'pincode_id'],
  },
  validation: {
    create: {
      rules: (req) => {
        decodeRepeatableInput(req, 'officer_rank_name');
        return RULES;
      },
      messages: MESSAGES,
    },
    update: {
      rules: (req) => {
        decodeRepeatableInput(req, 'officer_rank_name');
        return RULES;
      },
      messages: MESSAGES,
    },
  },
  serialize: async (row: Row) => {
    const ranks = officerRanks(row.officer_rank_name);
    const dep = row.department_id ? await findById(C.departments, row.department_id, { department_name: 1 }) : null;
    return {
      ...row,
      officer_rank_name: ranks,
      department_name: dep ? dep.department_name : null,
      // closure column: is_array($entry->officer_rank_name) ? count(...) : 0
      officer_count: ranks && typeof ranks === 'object' ? Object.keys(ranks).length : 0,
      pincode: await pinCodeColumn(row.pincode_id),
      // update form: pincode_show value = PinCode::find(pincode_id)->pin_code ?? '-'
      pincode_show: row.pincode_id ? ((await findById(C.pincodes, row.pincode_id, { pin_code: 1 }))?.pin_code ?? '-') : '-',
    };
  },
  hooks: {
    beforeCreate: async (data) => {
      if ('officer_rank_name' in data) data.officer_rank_name = jsonCastWrite(data.officer_rank_name);
      return newRow('administrators', await onlyColumns('administrators', data));
    },
    beforeUpdate: async (data, existing) => {
      if ('officer_rank_name' in data) {
        data.officer_rank_name = keepIfJsonEquivalent(existing, 'officer_rank_name', jsonCastWrite(data.officer_rank_name));
      }
      const out = await onlyColumns('administrators', data);
      coerceRow('administrators', out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced('administrators', id, data),
  },
};
