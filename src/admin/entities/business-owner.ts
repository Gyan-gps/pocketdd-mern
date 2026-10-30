// Port of App\Http\Controllers\Admin\BusinessOwnerCrudController (List + Show only; BusinessOwnerRequest has no rules).
// Model BusinessOwner: table business_owners, belongsTo businessName (Business, business_id).
import type { CrudConfig } from '../crud.js';
import { like, type Row } from '../../db/mongo.js';
import { Business } from '../../models/index.js';
import { fieldById } from './business-columns.js';

export const businessOwner: CrudConfig = {
  route: 'business-owner',
  embedded: 'business_owners',
  operations: ['list', 'show'],
  list: {
    orderBy: [['name', 'asc']],
    // name/phone are `text` columns; business_id is a `select` column → orWhereHas(businessName, business_name_en LIKE).
    searchable: ['name', 'phone'],
    // Child rows carry their business id in business_id; the parent's columns are not in the unwound row.
    searchExtra: async (term) => {
      const businesses = await Business.find({ business_name_en: like(term) }, { _id: 1 }).lean<Row[]>();
      return { business_id: { $in: businesses.map((business) => business._id) } };
    },
    sortable: ['name', 'phone'],
  },
  fields: { create: [], update: [] },
  serialize: async (row) => {
    const business = await fieldById(Business, row.business_id, 'business_name_en');
    return { ...row, business_name_en: business ? business.value : null };
  },
};
