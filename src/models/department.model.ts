// App\Models\Department. Collection `departments`, migrated from MySQL table `departments`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const departmentSchema = new Schema(
  {
    _id: column.int(),
    designation_id: column.decodedJson('string'),
    name: column.string(),
    status: column.int({ default: '0' }),
    created_at: column.string(),
    updated_at: column.string(),
    slug: column.string(),
    department_name: column.string(),
    department_name_hi: column.string(),
    department_mobile_number: column.decodedJson('string'),
  },
  legacySchemaOptions('departments', 'departments'),
);

export const Department = model('Department', departmentSchema);
