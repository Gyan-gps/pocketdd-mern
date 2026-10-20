// Port of App\Http\Controllers\Admin\EventLocationCrudController (+ EventLocationRequest: no rules).
// Operations: List, Create, Update, Show (no Delete). select2 columns → no search.
import { all, first, type Row } from '../../db/pool.js';
import type { CrudConfig } from '../crud.js';
import { locationLabel, locationOptions } from './business-user-location.js';

const FIELDS = ['event_id', 'location_id'];

export const eventLocation: CrudConfig = {
  route: 'event-location',
  table: 'event_locations',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id', 'location_id'] },
  formOptions: async () => ({
    event_id: (await all('select id, name from events order by id')).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  serialize: async (row: Row) => {
    const ev = row.event_id === null ? null : await first('select name from events where id = ?', [row.event_id]);
    const loc = row.location_id === null ? null : await first('select location_name from locations where id = ?', [row.location_id]);
    return { ...row, event_name: ev?.name ?? null, location_label: loc ? locationLabel(loc.location_name) : null };
  },
};
