// Spatie translation-loader `language_lines`. Collection `language_lines`, migrated from MySQL table `language_lines`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const languageLineSchema = new Schema(
  {
    _id: column.int(),
    group: column.string(),
    key: column.string(),
    text: column.decodedJson('json'),
    created_at: column.string(),
    updated_at: column.string(),
  },
  legacySchemaOptions('language_lines', 'language_lines'),
);
languageLineSchema.index({ group: 1, key: 1 });

export const LanguageLine = model('LanguageLine', languageLineSchema);
