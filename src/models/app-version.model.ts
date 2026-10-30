// App\Models\AppVersion. Collection `app_versions`, migrated from MySQL table `app_versions`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const appVersionSchema = new Schema(
  {
    _id: column.int(),
    is_show_in_app_update: column.int({ default: '0' }),
    current_version_code: column.int(),
    current_version_name: column.string(),
    is_force_update: column.int({ default: '0' }),
    description: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('app_versions', 'app_versions'),
);

export const AppVersion = model('AppVersion', appVersionSchema);
