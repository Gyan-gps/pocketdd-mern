// Port of App\Http\Controllers\Admin\BusinessLocationCrudController (+ BusinessLocation(Update)Request: no rules).
// Operations: List, Create, Update, Show. store() → redirect business-detail/create; update() → redirect business.
import type { CrudConfig } from '../crud.js';
import { namesById, pluckOptions } from '../support/business-helpers.js';

export const businessLocation: CrudConfig = {
  route: 'business-location',
  table: 'business_locations',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    searchable: [], // both columns are select2 relationship columns → not searched
    sortable: ['business_id', 'location_id'],
    // addFilter business_id (select2) → where business_id = value
    filters: (input) => (input.business_id ? { where: [{ sql: '`business_id` = ?', params: [input.business_id] }] } : {}),
    filterOptions: async () => ({
      // Business::where('status','1')->distinct('name')->pluck('name','id')
      business_id: await pluckOptions("SELECT DISTINCT name AS l, id AS v FROM businesses WHERE status = '1'"),
    }),
  },
  fields: { create: ['business_id', 'location_id'], update: ['business_id', 'location_id'] },
  redirect: { create: 'business-detail/create', update: 'business' },
  // `relationship` fields (ajax false): every Business (attribute name) / Location (attribute location_name).
  formOptions: async () => ({
    business_id: await pluckOptions('SELECT id AS v, name AS l FROM businesses'),
    location_id: await pluckOptions('SELECT id AS v, location_name AS l FROM locations'),
  }),
  serialize: async (row) => {
    const b = await namesById('businesses', 'name', [row.business_id]);
    const l = await namesById('locations', 'location_name', [row.location_id]);
    return {
      ...row,
      business_name: b.get(String(row.business_id)) ?? null,
      location_name: l.get(String(row.location_id)) ?? null,
    };
  },
};
