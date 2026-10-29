// Port of App\Http\Controllers\Admin\BusinessLocationCrudController (+ BusinessLocation(Update)Request: no rules).
// Operations: List, Create, Update, Show. store() → redirect business-detail/create; update() → redirect business.
import type { CrudConfig } from '../crud.js';
import { C } from '../../db/mongo.js';
import { coerceRow, fieldById, idOptions, looseInt, newRow } from './business-columns.js';

export const businessLocation: CrudConfig = {
  route: 'business-location',
  embedded: 'business_locations',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    searchable: [], // both columns are select2 relationship columns → not searched
    sortable: ['business_id', 'location_id'],
    // addFilter business_id (select2) → where business_id = value
    filters: (input) => (input.business_id ? { where: [{ business_id: looseInt(input.business_id) }] } : {}),
    filterOptions: async () => ({
      // Business::where('status','1')->distinct('name')->pluck('name','id')
      business_id: await idOptions(C.businesses, { status: 1 }, 'name'),
    }),
  },
  fields: { create: ['business_id', 'location_id'], update: ['business_id', 'location_id'] },
  redirect: { create: 'business-detail/create', update: 'business' },
  // `relationship` fields (ajax false): every Business (attribute name) / Location (attribute location_name).
  formOptions: async () => ({
    business_id: await idOptions(C.businesses, {}, 'name'),
    location_id: await idOptions(C.locations, {}, 'location_name'),
  }),
  serialize: async (row) => {
    const b = await fieldById(C.businesses, row.business_id, 'name');
    const l = await fieldById(C.locations, row.location_id, 'location_name');
    return { ...row, business_name: b ? b.v : null, location_name: l ? l.v : null };
  },
  hooks: {
    beforeCreate: (data) => newRow('business_locations', data),
    beforeUpdate: (data) => coerceRow('business_locations', data),
  },
};
