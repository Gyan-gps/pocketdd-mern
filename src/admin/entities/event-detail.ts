// Port of App\Http\Controllers\Admin\EventDetailCrudController (+ EventDetailRequest / EventDetailUpdateRequest:
// no rules). Operations: List, Create, Update, Show (default show: every column). The event dropdown lists
// Event::where('status', 1)->pluck('name', 'id'). select2 list column → no search.
import { C, col, toRows, type Row } from '../../db/mongo.js';
import type { CrudConfig } from '../crud.js';
import { coerceRow, findById, newRow } from '../support/catalog-helpers.js';

const FIELDS = ['event_id', 'event_details'];

export const eventDetail: CrudConfig = {
  route: 'event-detail',
  embedded: 'event_details',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id'] },
  formOptions: async () => ({
    event_id: toRows(await col(C.events).find({ status: 1 }).project({ name: 1 }).sort({ _id: 1 }).toArray()).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
  }),
  fields: { create: FIELDS, update: FIELDS },
  // event_id is a bigint column: the request sends it as text.
  hooks: {
    beforeCreate: (data) => newRow('event_details', data),
    beforeUpdate: (data) => coerceRow('event_details', data),
  },
  serialize: async (row: Row) => {
    const ev = row.event_id === null ? null : await findById(C.events, row.event_id, { name: 1 });
    return { ...row, event_name: ev?.name ?? null };
  },
};
