// Port of App\Http\Controllers\Admin\EventDetailCrudController (+ EventDetailRequest / EventDetailUpdateRequest:
// no rules). Operations: List, Create, Update, Show (default show: every column). The event dropdown lists
// Event::where('status', 1)->pluck('name', 'id'). select2 list column → no search.
import { toRows, type Row } from '../../db/mongo.js';
import { Event } from '../../models/index.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, findById, newRow } from '../support/catalog-helpers.js';

const FIELDS = ['event_id', 'event_details'];

export const eventDetail: CrudConfig = {
  route: 'event-detail',
  embedded: 'event_details',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id'] },
  formOptions: async () => ({
    event_id: toRows(await Event.find({ status: 1 }, { name: 1 }).sort({ _id: 1 }).lean<Row[]>()).map((event) => ({
      value: String(event.id),
      label: String(event.name ?? ''),
    })),
  }),
  fields: { create: FIELDS, update: FIELDS },
  // event_id is a bigint column: the request sends it as text.
  hooks: {
    beforeCreate: (data) => newRow('event_details', data),
    beforeUpdate: (data) => coerceRow('event_details', data),
  },
  serialize: async (row: Row) => {
    const event = row.event_id === null ? null : await findById(Event.collection.collectionName, row.event_id, { name: 1 });
    return { ...row, event_name: event?.name ?? null };
  },
};
