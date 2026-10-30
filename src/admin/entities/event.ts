// Port of App\Http\Controllers\Admin\EventCrudController + EventRequest / EventUpdateRequest.
// Operations: List, Create, Update, Show. Model Event: $guarded ['id'] → the edit form's *_hidden fields
// (pincode_id_hidden, state_hidden, district_hidden, tahsil_hidden) are not columns and are silently dropped.
// store() dispatches SendEventNotification($id, $state, $district, $eventName, $shortDescription).
import { validateRequest } from '../../core/validation/validator.js';
import type { Filter, Row } from '../../db/mongo.js';
import { Event, Pincode } from '../../models/index.js';
import { createEventValidation, dateSearchTermValidation, updateEventValidation } from '../../validators/admin/event.validator.js';
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

const UPLOAD_DIR = 'uploads/event_images';

/** Carbon::parse($term)->toDateString() for the forms accepted by the `date` rule. */
function carbonDate(term: string): string | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(term.trim());
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  const timestamp = Date.parse(term);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp + 330 * 60_000).toISOString().slice(0, 10);
}

/** `select <col> from <collection> group by <col> having COUNT(<col>) >= 1` → pluck(col, col). */
async function distinctValues(collection: string, column: string) {
  const rows = await groupValues(collection, column, { match: { [column]: { $ne: null } } });
  return rows.map((row) => ({ value: String(row[column]), label: String(row[column]) }));
}

/** The "Sort By" dropdown filter: resets orders; Backpack then appends `id DESC`. */
function sortingFilter(input: Record<string, unknown>): ListFilterResult['orderBy'] | undefined {
  if (!('sorting' in input)) return undefined;
  const orderBySorting: Record<string, [string, 'asc' | 'desc']> = {
    a_z: ['name', 'asc'],
    z_a: ['name', 'desc'],
    newest: ['created_at', 'desc'],
    oldest: ['created_at', 'asc'],
  };
  const order = orderBySorting[String(input.sorting)];
  return order ? [order, ['id', 'desc']] : [['id', 'desc']];
}

/** `$this->crud->addClause('where', $col, $value)` — a NULL value becomes `IS NULL`. */
const whereFilter = (column: string, value: unknown): Filter<Row> =>
  value === null || value === undefined ? { [column]: null } : { [column]: eqValue(value) };

/** `->format('d-m-Y')` of a Y-m-d date. */
const dayMonthYear = (date: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};

const nullIfMissing = (value: unknown) => (value === undefined ? null : value);

export const event: CrudConfig = {
  route: 'event',
  collection: Event.collection.collectionName,
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
      if ((await validateRequest({ value: term }, dateSearchTermValidation)).fails()) return null;
      const date = carbonDate(term);
      return date ? { date: { $regex: `^${date}` } } : null;
    },
    sortable: ['district', 'state', 'name', 'date', 'event_time', 'image', 'charge'],
    filters: (input) => {
      const where: NonNullable<ListFilterResult['where']> = [];
      if ('name' in input) where.push(whereFilter('name', input.name));
      if ('date' in input && input.date) {
        // date_range filter: json_decode($value) → from / to
        let dates: { from?: string; to?: string } = {};
        try {
          dates = JSON.parse(String(input.date));
        } catch {
          /* PHP would fail reading ->from on null */
        }
        // `date >= NULL` matches nothing.
        where.push(dates.from == null ? NEVER : { date: { $gte: dates.from } });
        where.push(dates.to == null ? NEVER : { date: { $lte: dates.to } });
      }
      if ('state' in input) where.push(whereFilter('state', input.state));
      if ('district' in input) where.push(whereFilter('district', input.district));
      return { where, orderBy: sortingFilter(input) };
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
      state: (await groupValues(Pincode.collection.collectionName, 'state', { order: 'asc' })).map((row) => ({
        value: String(row.state),
        label: String(row.state),
      })),
    };
  },
  fields: { create: FIELDS, update: FIELDS },
  validation: { create: createEventValidation, update: updateEventValidation },
  serialize: async ({ details: _details, locations: _locations, ...row }: Row) => {
    const pincode =
      row.pincode_id === null ? null : await findById(Pincode.collection.collectionName, row.pincode_id, { pin_code: 1 });
    return {
      ...row,
      // Show columns: name = name_hi . " (name)", date d-m-Y, PinCode::find($id)->pin_code.
      show_name: String(row.name_hi ?? '') + (row.name ? ` (${row.name})` : ''),
      show_date: row.date ? dayMonthYear(row.date) : '',
      // Laravel quirk: a missing pincode makes the show page fail (500) with this error.
      pincode_pin_code: pincode ? pincode.pin_code : null,
      show_error: pincode ? null : 'Attempt to read property "pin_code" on null',
    };
  },
  hooks: {
    beforeCreate: (data, req) => {
      applySingleUpload(data, req.input, 'image', UPLOAD_DIR);
      return newRow('events', data);
    },
    afterCreate: async (id, _data, req) => {
      const input = req.input;
      await dispatchJob(
        'SendEventNotification',
        id,
        nullIfMissing(input.state),
        nullIfMissing(input.district),
        nullIfMissing(input.name),
        nullIfMissing(input.short_description),
      );

    },
    beforeUpdate: (data, existing, req) => {
      applySingleUpload(data, req.input, 'image', UPLOAD_DIR, existing.image);
      coerceRow('events', data);
      return data;
    },
    afterUpdate: (id, data) => storeCoerced('events', id, data),
  },
};
