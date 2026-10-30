import { ALL_MODELS } from '../models/index.js';

/** Indexes for the query patterns the API uses, as declared on the model schemas. Safe to run repeatedly. */
export async function ensureIndexes() {
  for (const model of ALL_MODELS) await model.createIndexes();
}
