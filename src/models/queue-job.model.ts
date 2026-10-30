// database queue (Laravel `jobs` table). Collection `jobs`, migrated from MySQL table `node_jobs`.
// Field order = the MySQL column order: inserts and API responses depend on it.
import { Schema, model } from 'mongoose';
import { column, legacySchemaOptions, subdocumentOptions } from './schema-helpers.js';

export const queueJobSchema = new Schema(
  {
    _id: column.int(),
    uuid: column.string(),
    queue: column.string(),
    job: column.string(),
    args: column.decodedJson('string'),
    attempts: column.int({ default: '0' }),
    reserved_at: column.int(),
    reserved_by: column.string(),
    available_at: column.int(),
    created_at: column.int(),
    failed_at: column.string(),
    exception: column.string(),
  },
  legacySchemaOptions('jobs', 'node_jobs'),
);
queueJobSchema.index({ queue: 1, reserved_at: 1, available_at: 1 });

export const QueueJob = model('QueueJob', queueJobSchema);
