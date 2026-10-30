// Port of App\Http\Controllers\Admin\BusinessUserLocationCrudController (+ BusinessUserLocationRequest: no rules).
// Operations: List, Create, InlineCreate (not ported: only used by inline-create modals, none in the panel),
// Update, Fetch (no fetch* methods), Show. select2 columns are not searchable in Backpack → no search.
// Laravel quirk: store() redirects to the Staff list (business-user), update() back to this list.
import type { Row } from '../../db/mongo.js';
import { BusinessUser, Location } from '../../models/index.js';
import { translatedAttr } from '../../utils/php/compat.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, fieldById, newRow, selectSorted } from './business-columns.js';

const FIELDS = ['business_user_id', 'location_id'];

/** Location `location_name` (HasTranslations, app locale en). */
export const locationLabel = (raw: unknown) => String(translatedAttr(raw) ?? '');

export const locationOptions = async () =>
  (await selectSorted(Location, ['location_name'])).map((location) => ({
    value: String(location.id),
    label: locationLabel(location.location_name),
  }));

export const businessUserLocation: CrudConfig = {
  route: 'business-user-location',
  redirect: { create: 'business-user' },
  embedded: 'business_users_location',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['business_user_id', 'location_id'] },
  formOptions: async () => ({
    business_user_id: (await selectSorted(BusinessUser, ['name'])).map((staff) => ({
      value: String(staff.id),
      label: String(staff.name ?? ''),
    })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  serialize: async (row: Row) => {
    const staff = await fieldById(BusinessUser, row.business_user_id, 'name');
    const location = await fieldById(Location, row.location_id, 'location_name');
    return { ...row, business_user_name: staff?.value ?? null, location_label: location ? locationLabel(location.value) : null };
  },
  hooks: {
    beforeCreate: (data) => newRow('business_users_location', data),
    beforeUpdate: (data) => coerceRow('business_users_location', data),
  },
};
