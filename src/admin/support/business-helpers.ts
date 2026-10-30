// Shared Eloquent/Backpack behaviour for the Business admin screens.
import type { Request, Response } from 'express';
import { toModelJson } from '../../core/time.js';
import { validateRequest, type ValidationSchema } from '../../core/validation/validator.js';
import { like, toRow, type Row } from '../../db/mongo.js';
import { Pincode } from '../../models/index.js';

const PINCODES_PER_PAGE = 10;

/** FormRequest validation; on failure answers 422 like the generic engine and returns false. */
export async function validated(req: Request, res: Response, schema: ValidationSchema): Promise<boolean> {
  const validation = await validateRequest(req.input, schema);
  if (!validation.fails()) return true;
  res.status(422).json({ message: validation.first(), errors: validation.all() });
  return false;
}

/** `$request->only($fieldNames)` — keys absent from the request are left out. */
export const only = (input: Record<string, unknown>, names: string[]) =>
  Object.fromEntries(names.filter((name) => name in input).map((name) => [name, input[name]]));

/** Backpack FetchOperation::fetch() for PinCode (`searchable_attributes` pin_code, simplePaginate(10)). */
export async function fetchPincodes(req: Request, res: Response) {
  const searchTerm = req.input.q;
  const page = Math.max(Number(req.input.page ?? 1) || 1, 1);
  // `request()->input('q') ?? false` — '' is converted to null by the middleware, so it means "no search".
  const filter: Record<string, unknown> = searchTerm === null || searchTerm === undefined ? {} : { pin_code: like(String(searchTerm)) };
  const pincodes = await Pincode.find(filter)
    .sort({ _id: 1 })
    .skip((page - 1) * PINCODES_PER_PAGE)
    .limit(PINCODES_PER_PAGE + 1)
    .lean<Row[]>();
  const rows = pincodes.map((pincode) => toRow(pincode)!);
  const hasMorePages = rows.length > PINCODES_PER_PAGE;
  const data = rows.slice(0, PINCODES_PER_PAGE).map((row) => ({
    ...row,
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
  }));
  const path = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`.replace(/\/$/, '');
  res.json({
    current_page: page,
    current_page_url: `${path}?page=${page}`,
    data,
    first_page_url: `${path}?page=1`,
    from: data.length ? (page - 1) * PINCODES_PER_PAGE + 1 : null,
    next_page_url: hasMorePages ? `${path}?page=${page + 1}` : null,
    path,
    per_page: PINCODES_PER_PAGE,
    prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
    to: data.length ? (page - 1) * PINCODES_PER_PAGE + data.length : null,
  });
}

const toIsoTimestamp = (value: unknown) => (value === null || value === undefined ? null : toModelJson(String(value)));
