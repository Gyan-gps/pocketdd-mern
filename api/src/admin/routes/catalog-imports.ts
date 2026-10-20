// catalog admin custom admin routes (routes/backpack/custom.php):
//   POST insertCategoryData     → BusinessCategoryCrudController@insertCategoryData (CategoryImport / CategoryBulkImport)
//   POST insertSubCategoryData  → BusinessSubCategoryCrudController@insertSubCategoryData (SubCategoryImport / SubCategoryBulkImport)
//   GET|POST slider/reorder     → SliderCrudController ReorderOperation (reorder / saveReorder)
// (GET import-category-data / import-sub-category-data only render a Blade upload form → Next.js pages.)
//
// Laravel answers the imports with redirects + flashed alerts; here the outcome is JSON:
//   { alert: 'warning', message }  — Alert::warning(...) + redirect()->back()
//   { success: '…' }               — redirect(import page)->with('success', …)
//   { error: '…' }                 — back()->with('error', …)
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { nowDb } from '../../core/time.js';
import { all } from '../../db/pool.js';
import { isUploadedFile, quickTranslatedText, strSlug, Tx, type UploadedFileLike } from '../../helpers/business.js';
import { adminAuth } from '../auth.js';
import { headingRows, readFirstSheet, type CellValue } from '../xlsx.js';

export const catalogImportRoutes = Router();

// ---------------------------------------------------------------- row validation (maatwebsite WithValidation)

type RowRule = string;
interface Failure {
  row: number;
  attribute: string;
  errors: string[];
}

/** Laravel's validateRequired. */
const present = (v: CellValue | undefined) => !(v === null || v === undefined || (typeof v === 'string' && v.trim() === ''));

/** :input → getDisplayableValue(): null → 'empty', bool → 'true'/'false'. */
const display = (v: CellValue | undefined) => (v === null || v === undefined ? 'empty' : typeof v === 'boolean' ? String(v) : String(v));

/**
 * Validator::make($rows, $rules, $messages)->validate() for one row (batch size 1), on the import's own
 * transaction connection so rows inserted earlier in the same file are visible to unique/exists.
 * Messages fall back to the raw `validation.<rule>` key (the app ships no lang files).
 */
async function validateRow(
  tx: Tx,
  rowNumber: number,
  row: Record<string, CellValue>,
  rules: Record<string, RowRule[]>,
  messages: Record<string, string>,
): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (const [attribute, list] of Object.entries(rules)) {
    const exists = attribute in row;
    const v = row[attribute];
    const nullable = list.includes('nullable');
    const errors: string[] = [];
    for (const raw of list) {
      const [rule, paramStr = ''] = raw.split(/:(.*)/s) as [string, string?];
      const params = paramStr ? paramStr.split(',') : [];
      if (rule !== 'required' && (!exists || (nullable && v === null))) continue;
      let ok = true;
      switch (rule) {
        case 'required':
          ok = present(v);
          break;
        case 'nullable':
          break;
        case 'string':
          ok = typeof v === 'string';
          break;
        case 'max':
          ok = [...String(v ?? '')].length <= Number(params[0]);
          break;
        case 'in':
          ok = v !== null && v !== undefined && typeof v !== 'boolean' && params.includes(String(v));
          break;
        case 'unique':
        case 'exists': {
          const [table, column] = params;
          const c = Number((await tx.first(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${column}\` = ?`, [v]))?.c ?? 0);
          ok = rule === 'unique' ? c === 0 : c > 0;
          break;
        }
        default:
          throw new Error(`Unsupported import rule ${rule}`);
      }
      if (ok) continue;
      const template = messages[`${attribute}.${rule}`] ?? `validation.${rule}`;
      errors.push(template.replace(/:input/g, display(v)));
      if (rule === 'required') break;
    }
    if (errors.length) failures.push({ row: rowNumber, attribute, errors });
  }
  return failures;
}

/** "<errors…> on line number N <br />" per failure (insertXData's catch of ValidationException). */
const failureText = (failures: Failure[]) => failures.map((f) => `${f.errors.join('')} on line number ${f.row} <br />`).join('');

class ImportValidationException extends Error {
  constructor(readonly failures: Failure[]) {
    super('The given data was invalid.');
  }
}

// ---------------------------------------------------------------- shared upload handling

function hasFile(v: unknown): v is UploadedFileLike {
  return isUploadedFile(v) && v.originalname !== '';
}

/** `mimes:xlsx` (client extension; Laravel guesses from content — a real .xlsx gives the same answer). */
const isXlsx = (f: UploadedFileLike) => f.originalname.split('.').pop()?.toLowerCase() === 'xlsx';

/** copy($path, public_path().'/uploads/import_file/<dir>/'.$originalName) — fails (500) if the folder is missing. */
function copyToImportFolder(file: UploadedFileLike, dir: string): string {
  const dest = path.posix.join(env.publicPath, 'uploads/import_file', dir) + '/' + file.originalname;
  try {
    fs.writeFileSync(dest, file.buffer ?? Buffer.alloc(0));
  } catch {
    throw new Error(`copy(${dest}): Failed to open stream: No such file or directory`);
  }
  return dest;
}

/** Excel::import() — the whole import runs in one DB transaction (config excel.transactions.handler = db). */
async function runImport(dest: string, perRow: (tx: Tx, rowNumber: number, row: Record<string, CellValue>) => Promise<void>) {
  const tx = await Tx.open();
  try {
    await tx.begin();
    const rows = headingRows(readFirstSheet(fs.readFileSync(dest)));
    for (const { rowNumber, row } of rows) await perRow(tx, rowNumber, row);
    await tx.commit();
  } catch (e) {
    await tx.rollBack();
    throw e;
  } finally {
    await tx.release();
  }
}

function handleImportRoute(
  field: string,
  folder: string,
  perRow: (tx: Tx, rowNumber: number, row: Record<string, CellValue>) => Promise<void>,
) {
  return async (req: Request, res: Response, next: (e?: unknown) => void) => {
    try {
      const file = req.input[field];
      if (!hasFile(file)) return void res.json({ alert: 'warning', message: 'Please select a file' });
      if (!isXlsx(file)) return void res.json({ alert: 'warning', message: 'Please select a file with a valid extension (xlsx)' });
      const dest = copyToImportFolder(file, folder);
      try {
        await runImport(dest, perRow);
        res.json({ success: 'Your sheet has been imported successfully.' });
      } catch (e) {
        if (e instanceof ImportValidationException) return void res.json({ error: failureText(e.failures) });
        // catch (\Exception $e) → back()->with('error', $e->getTraceAsString())
        res.json({ error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
      }
    } catch (e) {
      next(e);
    }
  };
}

// ---------------------------------------------------------------- CategoryBulkImport

const CATEGORY_RULES = {
  business_category_name: ['required', 'unique:business_categories,name'],
  statusactive_inactive: ['required', 'in:Inactive,Active,inactive,active'],
};
const CATEGORY_MESSAGES = {
  'business_category_name.required': 'The Business Category Name does not exist :input .',
  'business_category_name.unique': 'The Business Category Already Exists :input .',
  'statusactive_inactive.required': 'The Status does not exist :input .',
  'statusactive_inactive.in': 'The value of Status must be of two (Active / Inactive) :input .',
};

async function categoryRow(tx: Tx, rowNumber: number, row: Record<string, CellValue>) {
  // WithValidation without SkipsOnFailure: the first failing row aborts (and rolls back) the import.
  const failures = await validateRow(tx, rowNumber, row, CATEGORY_RULES, CATEGORY_MESSAGES);
  if (failures.length) throw new ImportValidationException(failures);
  // model(): the inner Validator::make(...)->validate() repeats the same rules (always passes here).
  const name = row.business_category_name ?? null;
  const nameHi = await quickTranslatedText(name);
  const slug = strSlug(name);
  const status = String(row.statusactive_inactive).toLowerCase() === 'inactive' ? 0 : 1;
  const now = nowDb();
  // BusinessCategory::insertNewCategory() — query-builder insertGetId (no Sluggable, no lft/rgt).
  await tx.exec(
    'INSERT INTO `business_categories` (`name`, `name_hi`, `slug`, `status`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?)',
    [name, nameHi, slug, status, now, now],
  );
}

// ---------------------------------------------------------------- SubCategoryBulkImport

const SUB_RULES = {
  category_name: ['required', 'string', 'max:255', 'exists:business_categories,name'],
  sub_category_name: ['required', 'string', 'max:255', 'unique:business_sub_categories,name'],
  sub_category_name_hindi: ['nullable', 'string', 'max:255'],
  statusactive_inactive: ['required', 'in:Active,Inactive,active,inactive'],
};
const SUB_MESSAGES = {
  'category_name.required': 'Category name is required.',
  'category_name.exists': 'Category ":input" does not exist in business categories.',
  'sub_category_name.required': 'Sub-category name is required.',
  'sub_category_name.unique': 'Sub-category ":input" already exists.',
  'statusactive_inactive.required': 'Status is required (Active / Inactive).',
  'statusactive_inactive.in': 'Invalid status ":input". Allowed values: Active or Inactive.',
};

const phpTrimStr = (v: CellValue) => String(v ?? '').replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');

async function subCategoryRow(tx: Tx, rowNumber: number, row: Record<string, CellValue>) {
  // SkipsOnFailure + SkipsFailures: invalid rows are skipped silently.
  if ((await validateRow(tx, rowNumber, row, SUB_RULES, SUB_MESSAGES)).length) return;
  const parent = await tx.first('SELECT id FROM business_categories WHERE name = ? LIMIT 1', [phpTrimStr(row.category_name)]);
  if (!parent) return;
  const name = phpTrimStr(row.sub_category_name);
  const nameHi = await quickTranslatedText(name);
  const status = String(row.statusactive_inactive).toLowerCase() === 'inactive' ? 0 : 1;
  const now = nowDb();
  // new BusinessSubCategory([...]) saved by ToModel (Eloquent insert; Sluggable keeps the non-empty slug).
  await tx.exec(
    'INSERT INTO `business_sub_categories` (`parent_id`, `name`, `slug`, `name_hi`, `status`, `updated_at`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [parent.id, name, strSlug(name), nameHi ?? null, status, now, now],
  );
}

catalogImportRoutes.post('/insertCategoryData', adminAuth, handleImportRoute('category_data_sheet', 'category-data', categoryRow));
catalogImportRoutes.post(
  '/insertSubCategoryData',
  adminAuth,
  handleImportRoute('sub_category_data_sheet', 'sub-category-data', subCategoryRow),
);

// ---------------------------------------------------------------- Slider ReorderOperation

/** GET slider/reorder — every entry (the view nests them by parent_id / lft). */
catalogImportRoutes.get('/slider/reorder', adminAuth, async (_req, res, next) => {
  try {
    res.json(await all('SELECT * FROM sliders'));
  } catch (e) {
    next(e);
  }
});

const empty = (v: unknown) => v === undefined || v === null || v === '' || v === '0' || v === 0 || v === false;

/** POST slider/reorder — saveReorder() → CrudPanel::updateTreeOrder() (4 CASE updates in one transaction). */
catalogImportRoutes.post('/slider/reorder', adminAuth, async (req, res, next) => {
  try {
    let entries: unknown;
    try {
      entries = JSON.parse(String(req.input.tree ?? ''));
    } catch {
      entries = null;
    }
    if (!Array.isArray(entries) && (entries === null || typeof entries !== 'object')) {
      throw new Error('count(): Argument #1 ($value) must be of type Countable|array, null given');
    }
    const list = Object.values(entries as Record<string, Record<string, unknown>>);
    if (!list.length) return void res.send(''); // `return false` → empty 200 body
    const keys = (await all('SELECT id FROM sliders')).map((r) => String(r.id));
    const items = list
      .filter((i) => i.item_id !== '' && i.item_id !== null && i.item_id !== undefined && keys.includes(String(i.item_id)))
      .map((i) => ({
        id: i.item_id,
        parent_id: empty(i.parent_id) ? null : i.parent_id,
        depth: empty(i.depth) ? null : Math.trunc(Number(i.depth)),
        lft: empty(i.left) ? null : Math.trunc(Number(i.left)),
        rgt: empty(i.right) ? null : Math.trunc(Number(i.right)),
      }));
    const sent = items.map((i) => String(i.id));
    const itemKeys = keys.filter((k) => sent.includes(k));
    const placeholders = items.map(() => '?').join(',');
    const tx = await Tx.open();
    try {
      await tx.begin();
      for (const column of ['parent_id', 'lft', 'rgt', 'depth'] as const) {
        let sql = `UPDATE sliders SET ${column} = CASE `;
        const bindings: unknown[] = [];
        for (const item of items) {
          sql += 'WHEN id = ? THEN ? ';
          bindings.push(item.id, item[column]);
        }
        bindings.push(...itemKeys);
        sql += `ELSE ${column} END WHERE id IN (${placeholders})`;
        await tx.exec(sql, bindings);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollBack();
      throw e;
    } finally {
      await tx.release();
    }
    res.send(`success for ${items.length} items`);
  } catch (e) {
    next(e);
  }
});

