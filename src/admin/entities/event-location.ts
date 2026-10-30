// Port of App\Http\Controllers\Admin\EventLocationCrudController (+ EventLocationRequest: no rules).
// Operations: List, Create, Update, Show (no Delete). select2 columns → no search.
import { toRows, type Row } from '../../db/mongo.js';
import { Event, Location } from '../../models/index.js';
import { translatedAttr } from '../../utils/php/compat.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, findById, newRow } from '../support/catalog-helpers.js';

const locationLabel = (raw: unknown) => String(translatedAttr(raw) ?? '');

const locationOptions = async () =>
  toRows(await Location.find({}, { location_name: 1 }).sort({ _id: 1 }).lean<Row[]>()).map((location) => ({
    value: String(location.id),
    label: locationLabel(location.location_name),
  }));

const FIELDS = ['event_id', 'location_id'];

export const eventLocation: CrudConfig = {
  route: 'event-location',
  embedded: 'event_locations',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id', 'location_id'] },
  formOptions: async () => ({
    event_id: toRows(await Event.find({}, { name: 1 }).sort({ _id: 1 }).lean<Row[]>()).map((event) => ({
      value: String(event.id),
      label: String(event.name ?? ''),
    })),
    location_id: await locationOptions(),
  }),
  fields: { create: FIELDS, update: FIELDS },
  // event_id / location_id are bigint columns: the request sends them as text.
  hooks: {
    beforeCreate: (data) => newRow('event_locations', data),
    beforeUpdate: (data) => coerceRow('event_locations', data),
  },
  serialize: async (row: Row) => {
    const event = row.event_id === null ? null : await findById(Event.collection.collectionName, row.event_id, { name: 1 });
    const location =
      row.location_id === null
        ? null
        : await findById(Location.collection.collectionName, row.location_id, { location_name: 1 });
    return { ...row, event_name: event?.name ?? null, location_label: location ? locationLabel(location.location_name) : null };
  },
};
