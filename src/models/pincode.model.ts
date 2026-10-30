// App\Models\PinCode — state/city/tehsil/pin code directory. Collection `pincodes`, migrated from MySQL table `pincodes`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const pincodeSchema = new Schema(
  {
    _id: column.int(),
    pin_code: column.string(),
    city: column.string(),
    state: column.string(),
    created_at: column.string(),
    updated_at: column.string(),
    state_hi: column.string(),
    city_hi: column.string(),
    state_code: column.string(),
    district_code: column.string(),
  },
  legacySchemaOptions('pincodes', 'pincodes'),
);
pincodeSchema.index({ pin_code: 1 });
pincodeSchema.index({ state: 1, city: 1 });

export const Pincode = model('Pincode', pincodeSchema);
