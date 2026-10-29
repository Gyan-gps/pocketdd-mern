// Port of App\Http\Controllers\Admin\BusinessOwnerCrudController (List + Show only; BusinessOwnerRequest has no rules).
// Model BusinessOwner: table business_owners, belongsTo businessName (Business, business_id).
import type { CrudConfig } from '../crud.js';
import { C, col, like } from '../../db/mongo.js';
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
      const ids = (await col(C.businesses).find({ business_name_en: like(term) }, { projection: { _id: 1 } }).toArray()).map((b) => b._id);
      return { business_id: { $in: ids } };
    },
    sortable: ['name', 'phone'],
  },
  fields: { create: [], update: [] },
  serialize: async (row) => {
    const b = await fieldById(C.businesses, row.business_id, 'business_name_en');
    return { ...row, business_name_en: b ? b.v : null };
  },
};
