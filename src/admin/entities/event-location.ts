// Port of App\Http\Controllers\Admin\EventLocationCrudController (+ EventLocationRequest: no rules).
// Operations: List, Create, Update, Show (no Delete). select2 columns → no search.
import { C, col, toRows, type Row } from '../../db/mongo.js';
import { translatedAttr } from '../../utils/php/compat.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, findById, newRow } from '../support/catalog-helpers.js';

const locationLabel = (raw: unknown) => String(translatedAttr(raw) ?? '');

const locationOptions = async () =>
  toRows(await col(C.locations).find().project({ location_name: 1 }).sort({ _id: 1 }).toArray()).map((r) => ({
    value: String(r.id),
    label: locationLabel(r.location_name),
  }));

const FIELDS = ['event_id', 'location_id'];

export const eventLocation: CrudConfig = {
  route: 'event-location',
  embedded: 'event_locations',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id', 'location_id'] },
  formOptions: async () => ({
    event_id: toRows(await col(C.events).find().project({ name: 1 }).sort({ _id: 1 }).toArray()).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  // event_id / location_id are bigint columns: the request sends them as text.
  hooks: {
    beforeCreate: (data) => newRow('event_locations', data),
    beforeUpdate: (data) => coerceRow('event_locations', data),
  },
  serialize: async (row: Row) => {
    const ev = row.event_id === null ? null : await findById(C.events, row.event_id, { name: 1 });
    const loc = row.location_id === null ? null : await findById(C.locations, row.location_id, { location_name: 1 });
    return { ...row, event_name: ev?.name ?? null, location_label: loc ? locationLabel(loc.location_name) : null };
  },
};
