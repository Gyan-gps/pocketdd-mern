// App\Models\AdUserView — ad impressions per device. Collection `ad_user_views`, migrated from MySQL table `ad_user_views`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const adUserViewSchema = new Schema(
  {
    _id: column.int(),
    device_id: column.string(),
    ad_id: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('ad_user_views', 'ad_user_views'),
);
adUserViewSchema.index({ device_id: 1, ad_id: 1 });

export const AdUserView = model('AdUserView', adUserViewSchema);
