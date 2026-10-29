// Port of App\Http\Controllers\Admin\EventCrudController + EventRequest / EventUpdateRequest.
// Operations: List, Create, Update, Show. Model Event: $guarded ['id'] → the edit form's *_hidden fields
// (pincode_id_hidden, state_hidden, district_hidden, tahsil_hidden) are not columns and are silently dropped.
// store() dispatches SendEventNotification($id, $state, $district, $eventName, $shortDescription).
import { validate } from '../../core/validation/validator.js';
import { C, type Filter, type Row } from '../../db/mongo.js';
import { dispatchJob } from '../../jobs/queue.js';
import type { CrudConfig, ListFilterResult } from '../crud.js';
import { coerceRow, eqValue, findById, groupValues, NEVER, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { applySingleUpload } from '../uploads.js';

const FIELDS = [
  'name',
  'name_hi',
  'date',
  'event_time',
  'state',
  'district',
  'pincode_id',
  'tahsil',
  'charge',
  'image',
  'short_description',
  'event_description_hi',
  'status',
];

const MESSAGES = {
  'name.required': 'Event Name is required',
  'date.required': 'Event date is required',
  'event_time.required': 'Event Time is required',
  'charge.required': 'Event Charge is required',
  'image.required': 'Event Image is required',
  'short_description.required': 'Event description is required',
  'event_description_hi.required': 'घटना विवरण आवश्यक है',
  'state.required': 'Event State is not selected.',
  'district.required': 'Event City is not selected.',
  'pincode_id.required': 'City pincode  is not selected.',
  'tahsil.required': 'Tahsil is not selected.',
};

const UPLOAD_DIR = 'uploads/event_images';

/** Carbon::parse($term)->toDateString() for the forms accepted by the `date` rule. */
function carbonDate(term: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(term.trim());
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  const t = Date.parse(term);
  if (Number.isNaN(t)) return null;
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** `select <col> from <collection> group by <col> having COUNT(<col>) >= 1` → pluck(col, col). */
async function distinctValues(collection: string, column: string) {
  const rows = await groupValues(collection, column, { match: { [column]: { $ne: null } } });
  return rows.map((r) => ({ value: String(r[column]), label: String(r[column]) }));
}

/** The "Sort By" dropdown filter: resets orders; Backpack then appends `id DESC`. */
function sortingFilter(input: Record<string, unknown>): ListFilterResult['orderBy'] | undefined {
  if (!('sorting' in input)) return undefined;
  const map: Record<string, [string, 'asc' | 'desc']> = {
    a_z: ['name', 'asc'],
    z_a: ['name', 'desc'],
    newest: ['created_at', 'desc'],
    oldest: ['created_at', 'asc'],
  };
  const o = map[String(input.sorting)];
  return o ? [o, ['id', 'desc']] : [['id', 'desc']];
}

/** `$this->crud->addClause('where', $col, $value)` — a NULL value becomes `IS NULL`. */
const whereFilter = (column: string, v: unknown): Filter<Row> =>
  v === null || v === undefined ? { [column]: null } : { [column]: eqValue(v) };

/** `->format('d-m-Y')` of a Y-m-d date. */
const dmy = (d: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

export const event: CrudConfig = {
  route: 'event',
  collection: C.events,
  operations: ['list', 'create', 'update', 'show'],
  list: {
    orderBy: [
      ['name', 'asc'],
      ['id', 'desc'],
    ],
    searchable: ['district', 'state', 'name'],
    // `date` column: Backpack orWhereDate() when the term passes the `date` rule (time/image/number/closure
    // columns are not searched).
    searchExtra: async (term) => {
      if ((await validate({ value: term }, { value: 'date' })).fails()) return null;
      const d = carbonDate(term);
      return d ? { date: { $regex: `^${d}` } } : null;
    },
    sortable: ['district', 'state', 'name', 'date', 'event_time', 'image', 'charge'],
    filters: (q) => {
      const where: NonNullable<ListFilterResult['where']> = [];
      if ('name' in q) where.push(whereFilter('name', q.name));
      if ('date' in q && q.date) {
        // date_range filter: json_decode($value) → from / to
        let dates: { from?: string; to?: string } = {};
        try {
          dates = JSON.parse(String(q.date));
        } catch {
          /* PHP would fail reading ->from on null */
        }
        // `date >= NULL` matches nothing.
        where.push(dates.from == null ? NEVER : { date: { $gte: dates.from } });
        where.push(dates.to == null ? NEVER : { date: { $lte: dates.to } });
      }
      if ('state' in q) where.push(whereFilter('state', q.state));
      if ('district' in q) where.push(whereFilter('district', q.district));
      return { where, orderBy: sortingFilter(q) };
    },
    // Laravel quirk: the state/district filter values come from business_users, not events.
    filterOptions: async () => ({
      name: await distinctValues('events', 'name'),
      state: await distinctValues('business_users', 'state'),
      district: await distinctValues('business_users', 'district'),
      sorting: [
        { value: 'a_z', label: 'Name (A - Z)' },
        { value: 'z_a', label: 'Name (Z - A)' },
        { value: 'newest', label: 'Newest First' },
        { value: 'oldest', label: 'Oldest First' },
      ],
    }),
  },
  formOptions: async () => {
    return {
      state: (await groupValues(C.pincodes, 'state', { order: 'asc' })).map((r) => ({
        value: String(r.state),
        label: String(r.state),
      })),
    };
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: {
      rules: {
        name: 'required|min:1|max:191',
        date: 'required',
        short_description: 'required',
        event_description_hi: 'required',
        image: 'required',
        charge: 'nullable',
        state: 'required',
        district: 'required',
        pincode_id: 'required',
      },
      messages: MESSAGES,
    },
    update: {
      rules: {
        name: 'required|min:1|max:191',
        date: 'required',
        short_description: 'required',
        event_description_hi: 'required',
        charge: 'nullable',
        state: 'required',
        district: 'required',
        tahsil: 'required',
      },
      messages: MESSAGES,
    },
  },
  serialize: async ({ details: _d, locations: _l, ...row }: Row) => {
    const pin = row.pincode_id === null ? null : await findById(C.pincodes, row.pincode_id, { pin_code: 1 });
    return {
      ...row,
      // Show columns: name = name_hi . " (name)", date d-m-Y, PinCode::find($id)->pin_code.
      show_name: String(row.name_hi ?? '') + (row.name ? ` (${row.name})` : ''),
      show_date: row.date ? dmy(row.date) : '',
      // Laravel quirk: a missing pincode makes the show page fail (500) with this error.
      pincode_pin_code: pin ? pin.pin_code : null,
      show_error: pin ? null : 'Attempt to read property "pin_code" on null',
    };
  },
  hooks: {
    beforeCreate: (data, req) => {
      applySingleUpload(data, req.input, 'image', UPLOAD_DIR);
      return newRow('events', data);
    },
    afterCreate: async (id, _data, req) => {
      const r = req.input;
      const v = (x: unknown) => (x === undefined ? null : x);
      await dispatchJob('SendEventNotification', id, v(r.state), v(r.district), v(r.name), v(r.short_description));
    },
    beforeUpdate: (data, existing, req) => {
      applySingleUpload(data, req.input, 'image', UPLOAD_DIR, existing.image);
      coerceRow('events', data);
      return data;
    },
    afterUpdate: (id, data) => storeCoerced('events', id, data),
  },
};
