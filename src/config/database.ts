// MongoDB connection (Mongoose) and the Mongoose settings this API depends on.
import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * The API reproduces Laravel/MySQL responses byte for byte, and every value is already coerced to the stored type
 * before it reaches Mongoose (db/eloquent.ts mysqlValue(), looseEq()). Mongoose's own casting would change
 * semantics: a filter like `{ status: 'abc' }` on a Number path throws a CastError (Laravel just finds nothing),
 * `{ status: '1' }` would silently match numbers, and subdocuments would be re-ordered to schema order.
 * So queries and updates are passed to MongoDB unchanged, exactly as the native driver did before;
 * schemas still define the structure, indexes and MySQL column metadata of every collection.
 */
function passValuesThroughUnchanged() {
  const keepValue = <T>(value: T) => value;
  type ConfigurableSchemaType = { prototype?: Record<string, unknown>; cast?: unknown };
  const schemaTypes = Object.values(mongoose.Schema.Types).filter((value) => typeof value === 'function');
  for (const schemaType of schemaTypes as unknown as ConfigurableSchemaType[]) {
    if (!schemaType.prototype) continue;
    if (typeof schemaType.prototype.castForQuery === 'function') {
      schemaType.prototype.castForQuery = function castForQuery(_operator: unknown, value: unknown) {
        return value;
      };
    }
    if (typeof schemaType.cast === 'function') {
      try {
        (schemaType.cast as (caster: unknown) => void)(keepValue);
      } catch {
        // Types without a configurable caster (Mixed, arrays) already keep values as-is.
      }
    }
  }
  // Embedded child arrays: keep the subdocuments exactly as written (field order included).
  (mongoose.Schema.Types.DocumentArray.prototype as unknown as Record<string, unknown>).cast = keepValue;
  (mongoose.Schema.Types.Subdocument.prototype as unknown as Record<string, unknown>).cast = keepValue;
}

/**
 * The native driver stores `undefined` as null (`ignoreUndefined: false`), but Mongoose drops undefined keys from
 * updates. Keep the driver's behaviour: `$set: { name: undefined }` writes `name: null`.
 */
function undefinedUpdateValuesAsNull(schema: mongoose.Schema) {
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function replaceUndefinedWithNull() {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (!update) return;
    for (const [key, value] of Object.entries(update)) {
      if (key.startsWith('$') && value && typeof value === 'object' && !Array.isArray(value)) {
        const fields = value as Record<string, unknown>;
        for (const field of Object.keys(fields)) if (fields[field] === undefined) fields[field] = null;
      } else if (value === undefined) {
        update[key] = null;
      }
    }
  });
}

passValuesThroughUnchanged();
mongoose.plugin(undefinedUpdateValuesAsNull);
mongoose.set('strictQuery', false);

let connecting: Promise<typeof mongoose> | null = null;

/**
 * Open the default Mongoose connection (idempotent). Model operations issued before it resolves are buffered,
 * so scripts and tests may start querying right after calling it.
 */
export function connectDatabase(): Promise<typeof mongoose> {
  if (!env.mongo.uri) throw new Error('MONGODB_URI is not set');
  connecting ??= mongoose.connect(env.mongo.uri, { dbName: env.mongo.db, maxPoolSize: 10 });
  return connecting;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connecting) return;
  connecting = null;
  await mongoose.disconnect();
}

export { mongoose };
