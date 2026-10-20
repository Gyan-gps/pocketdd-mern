// Port of App\Http\Controllers\Admin\EventDetailCrudController (+ EventDetailRequest / EventDetailUpdateRequest:
// no rules). Operations: List, Create, Update, Show (default show: every column). The event dropdown lists
// Event::where('status', 1)->pluck('name', 'id'). select2 list column → no search.
import { all, first, type Row } from '../../db/pool.js';
import type { CrudConfig } from '../crud.js';

const FIELDS = ['event_id', 'event_details'];

export const eventDetail: CrudConfig = {
  route: 'event-detail',
  table: 'event_details',
  operations: ['list', 'create', 'update', 'show'],
  list: { searchable: [], sortable: ['event_id'] },
  formOptions: async () => ({
    event_id: (await all('select id, name from events where status = 1')).map((r) => ({ value: String(r.id), label: String(r.name ?? '') })),
  }),
  fields: { create: FIELDS, update: FIELDS },
  serialize: async (row: Row) => {
    const ev = row.event_id === null ? null : await first('select name from events where id = ?', [row.event_id]);
    return { ...row, event_name: ev?.name ?? null };
  },
};
