// api_failures log (log.api.failures middleware). Collection `api_failures`, migrated from MySQL table `api_failures`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const apiFailureSchema = new Schema(
  {
    _id: column.int(),
    api_name: column.string(),
    method: column.string(),
    request_url: column.string(),
    user_id: column.int(),
    device_id: column.string(),
    error_message: column.string(),
    exception_class: column.string(),
    status_code: column.int(),
    request_data: column.string(),
    ip_address: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('api_failures', 'api_failures'),
);

export const ApiFailure = model('ApiFailure', apiFailureSchema);
