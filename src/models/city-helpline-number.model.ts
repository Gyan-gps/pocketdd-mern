// App\Models\CityHelplineNumber. Collection `city_helpline_numbers`, migrated from MySQL table `city_helpline_numbers`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const cityHelplineNumberSchema = new Schema(
  {
    _id: column.int(),
    city_helpline: column.decodedJson('string'),
    location_id: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
    city: column.string(),
    pincode_id: column.int(),
    state: column.string(),
  },
  legacySchemaOptions('city_helpline_numbers', 'city_helpline_numbers'),
);
cityHelplineNumberSchema.index({ pincode_id: 1 });
cityHelplineNumberSchema.index({ state: 1, city: 1 });

export const CityHelplineNumber = model('CityHelplineNumber', cityHelplineNumberSchema);
