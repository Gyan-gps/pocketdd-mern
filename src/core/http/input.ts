import type { RequestHandler } from 'express';

// Laravel's global TrimStrings + ConvertEmptyStringsToNull middleware, then `$request->all()`
// semantics: body values override query values, uploaded files are merged in by field name.
const SKIP_TRIM = new Set(['current_password', 'password', 'password_confirmation']);

function clean(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const v = key && SKIP_TRIM.has(key) ? value : value.trim();
    return v === '' ? null : v;
  }
  if (Array.isArray(value)) return value.map((v) => clean(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
  }
  return value;
}

/** Place a multer file under its field name, honouring `images[]` / `images[0]` array syntax. */
function mergeFile(target: Record<string, unknown>, file: Express.Multer.File) {
  const m = /^([^[\]]+)\[(\d*)\]$/.exec(file.fieldname);
  if (!m) {
    target[file.fieldname] = file;
    return;
  }
  const list = Array.isArray(target[m[1]!]) ? (target[m[1]!] as unknown[]) : [];
  if (m[2] === '') list.push(file);
  else list[Number(m[2])] = file;
  target[m[1]!] = list;
}

export const normalizeInput: RequestHandler = (req, _res, next) => {
  const query = clean(req.query ?? {}) as Record<string, unknown>;
  const body = clean(req.body ?? {}) as Record<string, unknown>;
  const input: Record<string, unknown> = { ...query, ...body };
  if (Array.isArray(req.files)) for (const f of req.files) mergeFile(input, f);
  req.input = input;
  next();
};
