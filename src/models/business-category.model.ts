// App\Models\BusinessCategory. Collection `business_categories`, migrated from MySQL table `business_categories`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const businessCategorySchema = new Schema(
  {
    _id: column.int(),
    name: column.string(),
    location_id: column.int(),
    img: column.string(),
    slug: column.string(),
    lft: column.int(),
    rgt: column.int(),
    depth: column.int(),
    parent_id: column.int(),
    status: column.int(),
    created_at: column.string(),
    updated_at: column.string(),
    name_hi: column.string(),
  },
  legacySchemaOptions('business_categories', 'business_categories'),
);
businessCategorySchema.index({ slug: 1 });

export const BusinessCategory = model('BusinessCategory', businessCategorySchema);
