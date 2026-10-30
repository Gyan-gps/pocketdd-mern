// App\Models\Slider. Collection `sliders`, migrated from MySQL table `sliders`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const sliderSchema = new Schema(
  {
    _id: column.int(),
    client_name: column.string(),
    slider_img: column.string(),
    from_date: column.string(),
    to_date: column.string(),
    amount: column.decimal(2),
    lft: column.int(),
    rgt: column.int(),
    depth: column.int(),
    parent_id: column.int(),
    page_location: column.string(),
    url: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('sliders', 'sliders'),
);

export const Slider = model('Slider', sliderSchema);
