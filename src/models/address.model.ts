// App\Models\Address. Collection `addresses`, migrated from MySQL table `addresses`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const addressSchema = new Schema(
  {
    _id: column.int(),
    state: column.string(),
    city: column.string(),
    pincode_id: column.int(),
    tehsil: column.string(),
    tehsil_hi: column.string(),
    area: column.decodedJson('string'),
    area_hi: column.decodedJson('string'),
    price: column.decimal(2),
    status: column.int({ default: '1' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('addresses', 'addresses'),
);

export const Address = model('Address', addressSchema);
