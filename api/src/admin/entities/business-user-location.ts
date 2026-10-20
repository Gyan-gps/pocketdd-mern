// Port of App\Http\Controllers\Admin\BusinessUserLocationCrudController (+ BusinessUserLocationRequest: no rules).
// Operations: List, Create, InlineCreate (not ported: only used by inline-create modals, none in the panel),
// Update, Fetch (no fetch* methods), Show. select2 columns are not searchable in Backpack → no search.
// Laravel quirk: store() redirects to the Staff list (business-user), update() back to this list.
import { all, first, type Row } from '../../db/pool.js';
import { translatedAttr } from '../../helpers/phase5.js';
import type { CrudConfig } from '../crud.js';

const FIELDS = ['business_user_id', 'location_id'];

/** Location `location_name` (HasTranslations, app locale en). */
export const locationLabel = (raw: unknown) => String(translatedAttr(raw) ?? '');

export const locationOptions = async () =>
  (await all('select id, location_name from locations order by id')).map((r) => ({ value: String(r.id), label: locationLabel(r.location_name) }));

export const businessUserLocation: CrudConfig = {
  route: 'business-user-location',
  redirect: { create: 'business-user' },
  table: 'business_users_location',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['business_user_id', 'location_id'] },
  formOptions: async () => ({
    business_user_id: (await all('select id, name from business_users order by id')).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  serialize: async (row: Row) => {
    const bu = row.business_user_id === null ? null : await first('select name from business_users where id = ?', [row.business_user_id]);
    const loc = row.location_id === null ? null : await first('select location_name from locations where id = ?', [row.location_id]);
    return { ...row, business_user_name: bu?.name ?? null, location_label: loc ? locationLabel(loc.location_name) : null };
  },
};
