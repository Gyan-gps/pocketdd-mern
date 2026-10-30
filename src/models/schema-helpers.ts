// Building blocks for the Mongoose schemas in this folder.
//
// The data was migrated from Laravel's MySQL database and the API must keep answering exactly like Laravel did,
// so each field also records its original MySQL column type (`sqlType`) and column default (`sqlDefault`).
// db/eloquent.ts uses them to coerce values the way MySQL stored them (e.g. DECIMAL → "10.00" string) and to
// build full rows in column order; Mongoose itself does not coerce values (see config/database.ts).
import { Schema, type SchemaOptions } from 'mongoose';

export type SqlType = 'int' | 'float' | 'string' | 'json' | `decimal:${number}`;

interface ColumnOptions {
  /** MySQL column default, as the string information_schema reports. Applied by tableRow(), not by Mongoose. */
  default?: string;
}

interface ColumnDefinition {
  type: unknown;
  sqlType: SqlType;
  sqlDefault?: string;
  decodedJson?: boolean;
}

const define = (type: unknown, sqlType: SqlType, options: ColumnOptions = {}): ColumnDefinition => ({
  type,
  sqlType,
  ...(options.default !== undefined ? { sqlDefault: options.default } : {}),
});

export const column = {
  /** INT / BIGINT / TINYINT. */
  int: (options?: ColumnOptions) => define(Number, 'int', options),
  /** FLOAT / DOUBLE. */
  float: (options?: ColumnOptions) => define(Number, 'float', options),
  /** VARCHAR / TEXT / DATE / DATETIME (dates are kept as the stored IST "YYYY-MM-DD HH:mm:ss" strings). */
  string: (options?: ColumnOptions) => define(String, 'string', options),
  /** DECIMAL(p, scale): stored as a fixed-point string like MySQL returned it ("10.00"). */
  decimal: (scale: number, options?: ColumnOptions) => define(String, `decimal:${scale}`, options),
  /** JSON column (stored decoded). */
  json: (options?: ColumnOptions) => define(Schema.Types.Mixed, 'json', options),
  /** TEXT column that holds JSON; the migration stored it decoded. */
  decodedJson: (sqlType: SqlType, options?: ColumnOptions): ColumnDefinition => ({
    ...define(Schema.Types.Mixed, sqlType, options),
    decodedJson: true,
  }),
  /** Child table embedded as an array of subdocuments (`foreignKey` = the old parent-id column). */
  embedded: (schema: Schema, legacy: { table: string; foreignKey: string }) => ({
    type: [schema],
    default: undefined, // absent until the first child is added, like the migrated documents
    embeddedTable: legacy.table,
    foreignKey: legacy.foreignKey,
  }),
};

/**
 * Options shared by every collection schema:
 * - numeric `_id` (the old AUTO_INCREMENT id, allocated by db/mongo.ts nextId()),
 * - no `__v`, no automatic timestamps (created_at/updated_at are written explicitly as IST strings),
 * - `strict: false` and `minimize: false` so documents are stored exactly as the API writes them.
 */
export function legacySchemaOptions(collection: string, sqlTable: string): SchemaOptions {
  return {
    collection,
    versionKey: false,
    timestamps: false,
    strict: false,
    minimize: false,
    autoIndex: false, // created by ensureIndexes() (migration / deploy), not on every boot
    autoCreate: false,
    id: false,
    // Read back by db/table-schema.ts.
    sqlTable,
  } as SchemaOptions;
}

export const subdocumentOptions: SchemaOptions = { _id: false, id: false, versionKey: false, strict: false, minimize: false };
