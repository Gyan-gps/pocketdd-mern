// Port of App\Http\Controllers\Admin\AdministratorCrudController ("Officers Contact")
// (+ AdministratorRequest / AdministratorUpdateRequest, public/assets/js/administrator.js).
// Operations: List, Create, Update, Show (Delete is commented out). Model: Administrator
// ($casts officer_rank_name => json, $guarded = ['id'] → non-columns such as `pincode_show` are dropped).
import type { Row } from '../../db/pool.js';
import { all, first } from '../../db/pool.js';
import { phpJsonDecodeAssoc } from '../../helpers/business.js';
import type { CrudConfig } from '../crud.js';
import {
  decodeRepeatableInput,
  eqWhere,
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
const officerRanks = (raw: unknown) => phpJsonDecodeAssoc(raw);

export const administrator: CrudConfig = {
  route: 'administrator',
  table: 'administrators',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Text columns state/city and `pincode_id` (->type('text'), a table column) search with LIKE;
    // the department column's searchLogic adds orWhereHas('department', department_name LIKE).
    searchable: ['state', 'city', 'pincode_id'],
    searchExtra: (term) => ({
      sql: 'EXISTS (SELECT * FROM `departments` WHERE `administrators`.`department_id` = `departments`.`id` AND `department_name` LIKE ?)',
      params: [`%${term}%`],
    }),
    sortable: ['department_id', 'state', 'city', 'pincode_id', 'status'],
    orderBy: [['id', 'desc']],
    filters: (q) => ({
      where: [...eqWhere(q, 'department_id'), ...eqWhere(q, 'state'), ...eqWhere(q, 'status')],
    }),
    filterOptions: async () => ({
      // Department::pluck('department_name', 'id')
      department_id: (await all('SELECT id, department_name FROM departments')).map((d) => ({
        value: String(d.id),
        label: String(d.department_name ?? ''),
      })),
      // PinCode::query()->whereNotNull('state')->distinct()->pluck('state', 'state')
      state: pluckSame(await all('SELECT DISTINCT state FROM pincodes WHERE state IS NOT NULL'), 'state'),
      status: [
        { value: '1', label: 'Active' },
        { value: '0', label: 'Inactive' },
      ],
    }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => {
    if (!id) {
      const deps = await all('SELECT id, department_name, department_name_hi FROM departments ORDER BY id DESC');
      return {
        state: await stateOptions(),
        department_id: deps.map((d) => ({
          value: String(d.id),
          label: `${d.department_name ?? ''} (${d.department_name_hi ?? ''})`,
        })),
      };
    }
    // Update form: Department::where('status', 1)->pluck('department_name', 'id').
    const deps = await all('SELECT id, department_name FROM departments WHERE status = 1');
    const entry = await first('SELECT pincode_id FROM administrators WHERE id = ? LIMIT 1', [id]);
    const pin = entry?.pincode_id ? await first('SELECT pin_code FROM pincodes WHERE id = ? LIMIT 1', [entry.pincode_id]) : null;
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
    const dep = row.department_id
      ? await first('SELECT department_name FROM departments WHERE id = ? LIMIT 1', [row.department_id])
      : null;
    return {
      ...row,
      officer_rank_name: ranks,
      department_name: dep ? dep.department_name : null,
      // closure column: is_array($entry->officer_rank_name) ? count(...) : 0
      officer_count: ranks && typeof ranks === 'object' ? Object.keys(ranks).length : 0,
      pincode: await pinCodeColumn(row.pincode_id),
      // update form: pincode_show value = PinCode::find(pincode_id)->pin_code ?? '-'
      pincode_show: row.pincode_id ? ((await first('SELECT pin_code FROM pincodes WHERE id = ? LIMIT 1', [row.pincode_id]))?.pin_code ?? '-') : '-',
    };
  },
  hooks: {
    beforeCreate: async (data) => {
      if ('officer_rank_name' in data) data.officer_rank_name = jsonCastWrite(data.officer_rank_name);
      return onlyColumns('administrators', data);
    },
    beforeUpdate: async (data, existing) => {
      if ('officer_rank_name' in data) {
        data.officer_rank_name = keepIfJsonEquivalent(existing, 'officer_rank_name', jsonCastWrite(data.officer_rank_name));
      }
      return onlyColumns('administrators', data);
    },
  },
};
