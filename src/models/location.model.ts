// App\Models\Location. Collection `locations`, migrated from MySQL table `locations`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const locationSchema = new Schema(
  {
    _id: column.int(),
    location_name: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('locations', 'locations'),
);

export const Location = model('Location', locationSchema);
