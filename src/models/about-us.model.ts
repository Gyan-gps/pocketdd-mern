// App\Models\AboutUs — city information pages. Collection `about_uses`, migrated from MySQL table `about_uses`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const aboutUsSchema = new Schema(
  {
    _id: column.int(),
    state: column.string(),
    city: column.string(),
    about_mediator: column.string(),
    about_mediator_hi: column.string(),
    know_your_city: column.string(),
    know_your_city_hi: column.string(),
    tourist_places: column.decodedJson('string'),
    status: column.int({ default: '1' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('about_uses', 'about_uses'),
);
aboutUsSchema.index({ state: 1, city: 1 });

export const AboutUs = model('AboutUs', aboutUsSchema);
