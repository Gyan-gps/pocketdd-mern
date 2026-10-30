// App\Models\BusinessSubCategory. Collection `business_sub_categories`, migrated from MySQL table `business_sub_categories`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const businessSubCategorySchema = new Schema(
  {
    _id: column.int(),
    name: column.string(),
    business_category_id: column.int(),
    lft: column.int(),
    rgt: column.int(),
    depth: column.int(),
    parent_id: column.int(),
    img: column.string(),
    slug: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    name_hi: column.string(),
  },
  legacySchemaOptions('business_sub_categories', 'business_sub_categories'),
);
businessSubCategorySchema.index({ business_category_id: 1 });
businessSubCategorySchema.index({ slug: 1 });

export const BusinessSubCategory = model('BusinessSubCategory', businessSubCategorySchema);
