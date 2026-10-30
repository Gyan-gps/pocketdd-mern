// App\Models\Event. Collection `events`, migrated from MySQL table `events`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

/** Embedded event_details row; the parent id (`event_id`) is the parent document's `_id`. */
export const eventDetailSchema = new Schema(
  {
    id: column.int(),
    event_details: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

/** Embedded event_locations row; the parent id (`event_id`) is the parent document's `_id`. */
export const eventLocationSchema = new Schema(
  {
    id: column.int(),
    location_id: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

export const eventSchema = new Schema(
  {
    _id: column.int(),
    name: column.string(),
    date: column.string(),
    charge: column.decimal(2),
    event_details: column.string(),
    event_time: column.string(),
    image: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    name_hi: column.string(),
    short_description: column.string(),
    event_description_hi: column.string(),
    state: column.string(),
    district: column.string(),
    pincode_id: column.int(),
    tahsil: column.string(),
    details: column.embedded(eventDetailSchema, { table: 'event_details', foreignKey: 'event_id' }),
    locations: column.embedded(eventLocationSchema, { table: 'event_locations', foreignKey: 'event_id' }),
  },
  legacySchemaOptions('events', 'events'),
);
eventSchema.index({ status: 1, date: 1 });
eventSchema.index({ 'details.id': 1 });
eventSchema.index({ 'locations.id': 1 });
eventSchema.index({ 'locations.location_id': 1 });

export const Event = model('Event', eventSchema);
