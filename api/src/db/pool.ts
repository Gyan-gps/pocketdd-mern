import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

export type Row = mysql.RowDataPacket;

export const pool = mysql.createPool({
  ...env.db,
  connectionLimit: 10,
  charset: 'utf8mb4',
  // Return DATE/DATETIME/TIMESTAMP exactly as stored (IST wall-clock), like PDO.
  dateStrings: true,
  // PDO returns JSON columns as strings; casts decide whether to decode.
  typeCast(field, next) {
    if (field.type === 'JSON') return field.string('utf8');
    return next();
  },
});

// PDO's SQLSTATE descriptions (ext/pdo/pdo_sqlstate.c) for the states MySQL commonly raises.
const SQLSTATE_TEXT: Record<string, string> = {
  HY000: 'General error',
  HY093: 'Invalid parameter number',
  '01000': 'Warning',
  '08S01': 'Communication link failure',
  '21S01': 'Insert value list does not match column list',
  '22001': 'String data, right truncated',
  '22003': 'Numeric value out of range',
  '22007': 'Invalid datetime format',
  '22012': 'Division by zero',
  '23000': 'Integrity constraint violation',
  '40001': 'Serialization failure',
  '42000': 'Syntax error or access violation',
  '42S02': 'Base table or view not found',
  '42S22': 'Column not found',
};

/** Illuminate\Database\QueryException — same message shape so `sendCatchLog($e->getMessage())` matches. */
export class QueryException extends Error {
  exceptionClass = 'Illuminate\\Database\\QueryException';
  constructor(
    message: string,
    readonly sqlState: string,
    readonly errno: number,
  ) {
    super(message);
  }
}

/** Str::replaceArray('?', $bindings, $sql) — bindings are inserted unquoted. */
function interpolate(sql: string, params: unknown[]): string {
  const flat = params.flatMap((p) => (Array.isArray(p) ? [p.flat(2).map((x) => String(x ?? '')).join(', ')] : [p]));
  let i = 0;
  return sql.replace(/\?/g, () => {
    if (i >= flat.length) return '?';
    const b = flat[i++];
    if (b === null || b === undefined) return '?';
    if (b === true) return '1';
    if (b === false) return '';
    return String(b);
  });
}

function wrap(e: unknown, sql: string, params: unknown[]): never {
  const err = e as { sqlState?: string; errno?: number; sqlMessage?: string; message?: string };
  if (!err?.sqlState) throw e;
  const state = err.sqlState;
  const pdo = `SQLSTATE[${state}]: ${SQLSTATE_TEXT[state] ?? 'General error'}: ${err.errno} ${err.sqlMessage ?? err.message}`;
  const details = `Host: ${env.db.host}, Port: ${env.db.port}, Database: ${env.db.database}`;
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  throw new QueryException(
    `${pdo} (Connection: mysql, ${details}, SQL: ${interpolate(oneLine, params)})`,
    state,
    err.errno ?? 0,
  );
}

export async function all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const [rows] = await pool.query<Row[]>(sql, params);
    return rows as T[];
  } catch (e) {
    wrap(e, sql, params);
  }
}

/** First row or null (Eloquent `->first()`). */
export async function first<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  try {
    const [res] = await pool.query<mysql.ResultSetHeader>(sql, params);
    return res;
  } catch (e) {
    wrap(e, sql, params);
  }
}

/** Laravel QueryException formatting for queries run on a dedicated connection (transactions). */
export { wrap as wrapQueryError };
