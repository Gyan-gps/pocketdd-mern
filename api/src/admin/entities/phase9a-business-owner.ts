// Port of App\Http\Controllers\Admin\BusinessOwnerCrudController (List + Show only; BusinessOwnerRequest has no rules).
// Model BusinessOwner: table business_owners, belongsTo businessName (Business, business_id).
import type { CrudConfig } from '../crud.js';
import { first } from '../../db/pool.js';

export const businessOwner: CrudConfig = {
  route: 'business-owner',
  table: 'business_owners',
  operations: ['list', 'show'],
  list: {
    orderBy: [['name', 'asc']],
    // name/phone are `text` columns; business_id is a `select` column → orWhereHas(businessName, business_name_en LIKE).
    searchable: ['name', 'phone'],
    searchExtra: (term) => ({
      sql: 'EXISTS (SELECT 1 FROM `businesses` WHERE `businesses`.`id` = `business_owners`.`business_id` AND `businesses`.`business_name_en` LIKE ?)',
      params: [`%${term}%`],
    }),
    sortable: ['name', 'phone'],
  },
  fields: { create: [], update: [] },
  serialize: async (row) => {
    const b = row.business_id === null ? null : await first('SELECT business_name_en FROM businesses WHERE id = ?', [row.business_id]);
    return { ...row, business_name_en: b ? b.business_name_en : null };
  },
};
