// Laravel Sanctum API tokens. Collection `personal_access_tokens`, migrated from MySQL table `personal_access_tokens`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const personalAccessTokenSchema = new Schema(
  {
    _id: column.int(),
    tokenable_type: column.string(),
    tokenable_id: column.int(),
    name: column.string(),
    token: column.string(),
    abilities: column.decodedJson('string'),
    last_used_at: column.string(),
    expires_at: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('personal_access_tokens', 'personal_access_tokens'),
);
personalAccessTokenSchema.index({ token: 1 }, { unique: true });
personalAccessTokenSchema.index({ tokenable_type: 1, tokenable_id: 1 });

export const PersonalAccessToken = model('PersonalAccessToken', personalAccessTokenSchema);
