// Tests that diff PHP (MySQL) against Node (MongoDB): fixtures are written to MySQL, `sync()` copies them to
// MongoDB, and rows written by the Node API are read back here as the SQL row they would have been.
import { TABLE_COLLECTION, col } from '../../scripts/lib/raw-collections.js';
import { toRow, toRows, type Filter, type Row } from '../../src/db/mongo.js';
import { migrate } from '../../scripts/migrate-from-mysql.js';

/** Re-copy MySQL into MongoDB (drops rows the Node API created since the last sync). */
export const sync = () => migrate({ refresh: true });

const collectionOf = (table: string) => TABLE_COLLECTION[table] ?? table;

/** First row of an old table in MongoDB (`SELECT * … WHERE … ORDER BY id DESC LIMIT 1` with `desc`). */
export async function nodeFirst(table: string, where: Filter<Row> = {}, desc = false): Promise<Row | null> {
  return toRow(await col(collectionOf(table)).findOne(where as never, { sort: { _id: desc ? -1 : 1 } }));
}

export async function nodeAll(table: string, where: Filter<Row> = {}): Promise<Row[]> {
  return toRows(await col(collectionOf(table)).find(where as never).sort({ _id: 1 }).toArray());
}

export async function nodeUpdate(table: string, where: Filter<Row>, set: Row) {
  await col(collectionOf(table)).updateMany(where as never, { $set: set });
}
