// App\Models\DeviceId — registered app installs. Collection `device_ids`, migrated from MySQL table `device_ids`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const deviceIdSchema = new Schema(
  {
    _id: column.int(),
    device_id: column.string(),
    device_model: column.string(),
    android_version: column.string(),
    app_version: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('device_ids', 'device_ids'),
);
deviceIdSchema.index({ device_id: 1 });

export const DeviceId = model('DeviceId', deviceIdSchema);
