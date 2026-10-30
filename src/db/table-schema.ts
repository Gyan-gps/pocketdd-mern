// MySQL column metadata of every migrated table, in column order, derived from the Mongoose models.
// Used for Eloquent mass assignment (`$guarded = ['id']`), full-row inserts and MySQL value coercion (db/eloquent.ts).
import type { Schema } from 'mongoose';
import { EMBEDDED_TABLES, TABLE_MODELS, sqlTableOf } from '../models/index.js';
import type { SqlType } from '../models/schema-helpers.js';

export type ColumnKind = SqlType;
export interface ColumnDef { kind: ColumnKind; default?: string }

function columnsOf(schema: Schema, renames: Record<string, string> = {}): Record<string, ColumnDef> {
  const columns: Record<string, ColumnDef> = {};
  for (const [name, path] of Object.entries(schema.paths)) {
    const options = path.options as { sqlType?: SqlType; sqlDefault?: string };
    if (!options.sqlType) continue; // embedded child arrays
    columns[renames[name] ?? name] =
      options.sqlDefault === undefined ? { kind: options.sqlType } : { kind: options.sqlType, default: options.sqlDefault };
  }
  return columns;
}

function buildTableSchema(): Record<string, Record<string, ColumnDef>> {
  const tables: Record<string, Record<string, ColumnDef>> = {};
  for (const model of TABLE_MODELS) tables[sqlTableOf(model)] = columnsOf(model.schema, { _id: 'id' });
  // Child tables: `id`, then the old parent-id column (always the second MySQL column), then the rest.
  for (const child of Object.values(EMBEDDED_TABLES)) {
    const [idColumn, ...rest] = Object.entries(columnsOf(child.schema));
    tables[child.table] = Object.fromEntries([idColumn!, [child.foreignKey, { kind: 'int' }], ...rest]);
  }
  return tables;
}

export const TABLE_SCHEMA: Record<string, Record<string, ColumnDef>> = buildTableSchema();

export const TABLE_COLUMNS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(TABLE_SCHEMA).map(([table, columns]) => [table, Object.keys(columns)]),
);
