// Port of App\Http\Controllers\Admin\BusinessRequestManagmentCrudController (List + Show only).
// Model BusinessRequestManagment: table `businesse_requests` (sic). Line button approveBusiness() → link to
// business/{business_id}/edit while is_business_approved == 0 (the Business update() approves it).
// Laravel quirks kept: update() exists in the PHP but no UpdateOperation is used, so there is no edit route;
// the show page's business_category_id closure does BusinessCategory::find()->name (fatal when missing).
import type { CrudConfig } from '../crud.js';
import { C, col } from '../../db/mongo.js';
import { fieldById, idOptions, looseInt } from './business-columns.js';

export const businessRequestManagement: CrudConfig = {
  route: 'business-request-managment',
  collection: C.businessRequests,
  operations: ['list', 'show'],
  list: {
    orderBy: [['id', 'desc']],
    searchable: ['business_name'], // is_business_approved is a `check` column → not searched
    sortable: ['business_name', 'is_business_approved'],
    filters: (input) => (input.business_id ? { where: [{ business_id: looseInt(input.business_id) }] } : {}),
    filterOptions: async () => ({
      // Business::where('status','1')->distinct('business_name_en')->pluck('business_name_en','id')
      business_id: await idOptions(C.businesses, { status: 1 }, 'business_name_en'),
    }),
  },
  fields: { create: [], update: [] },
  routes: (r) => {
    // Widget::make()->type('progress')->value(BusinessRequestManagment::where('is_business_approved', 0)->count())
    r.get('/widget', async (_req, res, next) => {
      try {
        const c = await col(C.businessRequests).countDocuments({ is_business_approved: 0 });
        res.json({ value: c, description: 'Pending Businesses Applications', progress: (100 * c) / 1000, hint: `${100 - c} more until next milestone.` });
      } catch (e) {
        next(e);
      }
    });
  },
  serialize: async (row) => {
    const cat = await fieldById(C.businessCategories, row.business_category_id, 'name');
    const sub =
      await fieldById(C.businessSubCategories, row.business_sub_category_id, 'name');
    return {
      ...row,
      // null → the show column throws ("Attempt to read property \"name\" on null"), like the PHP closure.
      business_category_name: cat ? cat.v : null,
      business_sub_category_name: sub ? sub.v : '-',
    };
  },
};
