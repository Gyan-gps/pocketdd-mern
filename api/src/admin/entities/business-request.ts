// Port of App\Http\Controllers\Admin\BusinessRequestManagmentCrudController (List + Show only).
// Model BusinessRequestManagment: table `businesse_requests` (sic). Line button approveBusiness() → link to
// business/{business_id}/edit while is_business_approved == 0 (the Business update() approves it).
// Laravel quirks kept: update() exists in the PHP but no UpdateOperation is used, so there is no edit route;
// the show page's business_category_id closure does BusinessCategory::find()->name (fatal when missing).
import type { CrudConfig } from '../crud.js';
import { first } from '../../db/pool.js';
import { pluckOptions } from '../support/business-helpers.js';

export const businessRequestManagment: CrudConfig = {
  route: 'business-request-managment',
  table: 'businesse_requests',
  operations: ['list', 'show'],
  list: {
    orderBy: [['id', 'desc']],
    searchable: ['business_name'], // is_business_approved is a `check` column → not searched
    sortable: ['business_name', 'is_business_approved'],
    filters: (input) => (input.business_id ? { where: [{ sql: '`business_id` = ?', params: [input.business_id] }] } : {}),
    filterOptions: async () => ({
      // Business::where('status','1')->distinct('business_name_en')->pluck('business_name_en','id')
      business_id: await pluckOptions("SELECT DISTINCT business_name_en AS l, id AS v FROM businesses WHERE status = '1'"),
    }),
  },
  fields: { create: [], update: [] },
  routes: (r) => {
    // Widget::make()->type('progress')->value(BusinessRequestManagment::where('is_business_approved', 0)->count())
    r.get('/widget', async (_req, res, next) => {
      try {
        const c = Number((await first('SELECT COUNT(*) AS c FROM businesse_requests WHERE is_business_approved = 0'))?.c ?? 0);
        res.json({ value: c, description: 'Pending Businesses Applications', progress: (100 * c) / 1000, hint: `${100 - c} more until next milestone.` });
      } catch (e) {
        next(e);
      }
    });
  },
  serialize: async (row) => {
    const cat = row.business_category_id === null ? null : await first('SELECT name FROM business_categories WHERE id = ?', [row.business_category_id]);
    const sub =
      row.business_sub_category_id === null ? null : await first('SELECT name FROM business_sub_categories WHERE id = ?', [row.business_sub_category_id]);
    return {
      ...row,
      // null → the show column throws ("Attempt to read property \"name\" on null"), like the PHP closure.
      business_category_name: cat ? cat.name : null,
      business_sub_category_name: sub ? sub.name : '-',
    };
  },
};
