// Port of App\Http\Controllers\Admin\AdministratorCrudController ("Officers Contact")
// (+ AdministratorRequest / AdministratorUpdateRequest, public/assets/js/administrator.js).
// Operations: List, Create, Update, Show (Delete is commented out). Model: Administrator
// ($casts officer_rank_name => json, $guarded = ['id'] → non-columns such as `pincode_show` are dropped).
import { like, toRows, type Row } from '../../db/mongo.js';
import { Administrator, Department, Pincode } from '../../models/index.js';
import { administratorValidation } from '../../validators/admin/administrator.validator.js';
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

/** json cast read: json_decode($v, true). */
const officerRanks = (raw: unknown) => decodeAssoc(raw);

/** `Department::…->get()` rows (no ORDER BY → primary key order unless given). */
const departments = async (filter: Record<string, unknown>, sort: 1 | -1 = 1) =>
  toRows(await Department.find(filter).sort({ _id: sort }).lean<Row[]>());

export const administrator: CrudConfig = {
  route: 'administrator',
  collection: 'administrators',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Text columns state/city and `pincode_id` (->type('text'), a table column) search with LIKE;
    // the department column's searchLogic adds orWhereHas('department', department_name LIKE).
    searchable: ['state', 'city', 'pincode_id'],
    searchExtra: async (term) => {
      const matchingDepartments = await Department.find({ department_name: like(term) }, { _id: 1 }).lean<Row[]>();
      return matchingDepartments.length
        ? { department_id: { $in: matchingDepartments.map((department) => department._id) } }
        : NEVER;
    },
    sortable: ['department_id', 'state', 'city', 'pincode_id', 'status'],
    orderBy: [['id', 'desc']],
    filters: (input) => ({
      where: [...eqFilter(input, 'department_id'), ...eqFilter(input, 'state'), ...eqFilter(input, 'status')],
    }),
    filterOptions: async () => ({
      // Department::pluck('department_name', 'id')
      department_id: (await departments({})).map((department) => ({
        value: String(department.id),
        label: String(department.department_name ?? ''),
      })),
      // PinCode::query()->whereNotNull('state')->distinct()->pluck('state', 'state')
      state: pluckSame(
        await groupValues(Pincode.collection.collectionName, 'state', { match: { state: { $ne: null } } }),
        'state',
      ),
      status: [
        { value: '1', label: 'Active' },
        { value: '0', label: 'Inactive' },
      ],
    }),
  },
  formOptions: async (_req, id): Promise<FormOpts> => {
    if (!id) {
      const allDepartments = await departments({}, -1);
      return {
        state: await stateOptions(),
        department_id: allDepartments.map((department) => ({
          value: String(department.id),
          label: `${department.department_name ?? ''} (${department.department_name_hi ?? ''})`,
        })),
      };
    }
    // Update form: Department::where('status', 1)->pluck('department_name', 'id').
    const activeDepartments = await departments({ status: 1 });
    const entry = await findById(Administrator.collection.collectionName, id, { pincode_id: 1 });
    const pincode = entry?.pincode_id ? await findById(Pincode.collection.collectionName, entry.pincode_id, { pin_code: 1 }) : null;
    return {
      department_id: activeDepartments.map((department) => ({
        value: String(department.id),
        label: String(department.department_name ?? ''),
      })),
      // `pincode_show` value: PinCode::find($entry->pincode_id)->pin_code ?? '-'
      pincode_show: [{ value: String(pincode?.pin_code ?? '-'), label: String(pincode?.pin_code ?? '-') }],
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
        return administratorValidation.rules;
      },
      messages: administratorValidation.messages,
    },
    update: {
      rules: (req) => {
        decodeRepeatableInput(req, 'officer_rank_name');
        return administratorValidation.rules;
      },
      messages: administratorValidation.messages,
    },
  },
  serialize: async (row: Row) => {
    const ranks = officerRanks(row.officer_rank_name);
    const department = row.department_id
      ? await findById(Department.collection.collectionName, row.department_id, { department_name: 1 })
      : null;
    return {
      ...row,
      officer_rank_name: ranks,
      department_name: department ? department.department_name : null,
      // closure column: is_array($entry->officer_rank_name) ? count(...) : 0
      officer_count: ranks && typeof ranks === 'object' ? Object.keys(ranks).length : 0,
      pincode: await pinCodeColumn(row.pincode_id),
      // update form: pincode_show value = PinCode::find(pincode_id)->pin_code ?? '-'
      pincode_show: row.pincode_id
        ? ((await findById(Pincode.collection.collectionName, row.pincode_id, { pin_code: 1 }))?.pin_code ?? '-')
        : '-',
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
      const row = await onlyColumns('administrators', data);
      coerceRow('administrators', row);
      return row;

    },
    afterUpdate: (id, data) => storeCoerced('administrators', id, data),
  },
};
