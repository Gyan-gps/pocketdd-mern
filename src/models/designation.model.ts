// App\Models\Designation. Collection `designations`, migrated from MySQL table `designations`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const designationSchema = new Schema(
  {
    _id: column.int(),
    name: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('designations', 'designations'),
);

export const Designation = model('Designation', designationSchema);
