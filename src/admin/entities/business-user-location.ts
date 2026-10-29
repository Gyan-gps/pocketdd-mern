// Port of App\Http\Controllers\Admin\BusinessUserLocationCrudController (+ BusinessUserLocationRequest: no rules).
// Operations: List, Create, InlineCreate (not ported: only used by inline-create modals, none in the panel),
// Update, Fetch (no fetch* methods), Show. select2 columns are not searchable in Backpack → no search.
// Laravel quirk: store() redirects to the Staff list (business-user), update() back to this list.
import { C, type Row } from '../../db/mongo.js';
import { translatedAttr } from '../../utils/php/compat.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, fieldById, newRow, selectSorted } from './business-columns.js';

const FIELDS = ['business_user_id', 'location_id'];

/** Location `location_name` (HasTranslations, app locale en). */
export const locationLabel = (raw: unknown) => String(translatedAttr(raw) ?? '');

export const locationOptions = async () =>
  (await selectSorted(C.locations, ['location_name'])).map((r) => ({ value: String(r.id), label: locationLabel(r.location_name) }));

export const businessUserLocation: CrudConfig = {
  route: 'business-user-location',
  redirect: { create: 'business-user' },
  embedded: 'business_users_location',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['business_user_id', 'location_id'] },
  formOptions: async () => ({
    business_user_id: (await selectSorted(C.businessUsers, ['name'])).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  serialize: async (row: Row) => {
    const bu = await fieldById(C.businessUsers, row.business_user_id, 'name');
    const loc = await fieldById(C.locations, row.location_id, 'location_name');
    return { ...row, business_user_name: bu?.v ?? null, location_label: loc ? locationLabel(loc.v) : null };
  },
  hooks: {
    beforeCreate: (data) => newRow('business_users_location', data),
    beforeUpdate: (data) => coerceRow('business_users_location', data),
  },
};
