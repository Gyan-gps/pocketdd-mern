// App\Models\Administrator. Collection `administrators`, migrated from MySQL table `administrators`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const administratorSchema = new Schema(
  {
    _id: column.int(),
    department_id: column.int(),
    designation_id: column.int(),
    officer_position: column.string(),
    officer_mobile_number: column.string(),
    location_id: column.int(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    city: column.string(),
    state: column.string(),
    officer_rank_name: column.string(),
    pincode_id: column.int(),
  },
  legacySchemaOptions('administrators', 'administrators'),
);
administratorSchema.index({ department_id: 1 });

export const Administrator = model('Administrator', administratorSchema);
