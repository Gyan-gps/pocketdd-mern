// App\Models\Advertisment. Collection `advertisements`, migrated from MySQL table `advertisments`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

/** Embedded advertisment_subcategory row; the parent id (`advertisment_id`) is the parent document's `_id`. */
export const advertisementSubcategorySchema = new Schema(
  {
    id: column.int(),
    subcategory_id: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
  },
  subdocumentOptions,
);

export const advertisementSchema = new Schema(
  {
    _id: column.int(),
    client_name: column.string(),
    advt_img: column.string(),
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
    ads_position: column.string(),
    ads_location: column.string(),
    sub_category_name: column.decodedJson('json'),
    fees_type: column.string(),
    subcategories: column.embedded(advertisementSubcategorySchema, { table: 'advertisment_subcategory', foreignKey: 'advertisment_id' }),
  },
  legacySchemaOptions('advertisements', 'advertisments'),
);
advertisementSchema.index({ status: 1, from_date: 1, to_date: 1 });
advertisementSchema.index({ 'subcategories.id': 1 });

export const Advertisement = model('Advertisement', advertisementSchema);
