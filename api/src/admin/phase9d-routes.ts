// Phase 9D custom admin routes:
//   GET  import-pincode-data          → PinCodeCrudController@importPinCodeData (Blade upload form → Next page; title only)
//   POST insertPinCodeData            → PinCodeCrudController@insertPinCodeMaster (PinCodeMasterImport / PinCodeMasterSheetImport1)
//   GET  charts/recent-businesses     → Charts\RecentBusinessesChartController@response
//   GET  charts/recent-business-users → Charts\RecentBusinessUsersChartController@response
//   GET  charts/weekly-users          → Charts\WeeklyUsersChartController@response
//   GET  charts/weekly-businesses     → Charts\WeeklyBusinessChartController@response
//   GET  dashboard                    → resources/views/vendor/backpack/ui/dashboard.blade.php widget values + chart labels
//
// Import outcome as JSON (Laravel redirects + flashes), same convention as phase9b-routes.ts:
//   { alert: 'warning', message } | { success } | { error }
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { nowDb } from '../core/time.js';
import { first } from '../db/pool.js';
import { eloquentSave, isUploadedFile, quickTranslatedText, Tx, type UploadedFileLike } from '../helpers/business.js';
import { adminAuth } from './auth.js';
import { headingRows, readFirstSheet, type CellValue } from './xlsx.js';

export const phase9dRoutes = Router();

// ---------------------------------------------------------------- dates (app timezone Asia/Kolkata)

/** `today()->subDays($n)->toDateString()` / `now()->subDay($n)->format('Y-m-d')` in IST. */
export function istDateMinus(days: number, now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCDate(ist.getUTCDate() - days);
  return ist.toISOString().slice(0, 10);
}

const countOn = async (table: string, date: string, extra = '') =>
  Number((await first(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE ${extra}DATE(\`created_at\`) = ?`, [date]))?.c ?? 0);

// ---------------------------------------------------------------- charts (consoletvs/charts Chartjs datasets)

interface Dataset {
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  data: number[];
  label: string;
  type: string;
}
const dataset = (label: string, type: string, data: number[], color: string, background: string): Dataset => ({
  borderWidth: 2,
  borderColor: color,
  backgroundColor: background,
  data,
  label,
  type,
});

async function series(days: number, table: string, extra = ''): Promise<number[]> {
  const out: number[] = [];
  for (let d = days; d >= 0; d--) out.push(await countOn(table, istDateMinus(d), extra));
  return out;
}

export const CHARTS: Record<string, { labels: () => string[]; data: () => Promise<Dataset[]> }> = {
  'recent-businesses': {
    labels: () => [6, 5, 4, 3, 2, 1, 0].map((d) => istDateMinus(d)),
    data: async () => [
      dataset('Business Created', 'bar', await series(6, 'businesses'), 'rgb(66, 186, 150, 1)', 'rgb(66, 186, 150, 0.4)'),
      dataset('Business categories Created', 'bar', await series(6, 'business_categories'), 'rgb(70, 127, 208)', 'rgb(70, 127, 208)'),
    ],
  },
  'recent-business-users': {
    labels: () => [6, 5, 4, 3, 2, 1, 0].map((d) => istDateMinus(d)),
    data: async () => [
      dataset('Business Users Created', 'bar', await series(6, 'business_users'), 'rgb(66, 186, 150, 1)', 'rgb(66, 186, 118)'),
      dataset('Business Advertisements Created', 'bar', await series(6, 'advertisments'), 'rgb(70, 127, 208)', 'rgb(70, 127, 208)'),
    ],
  },
  'weekly-users': {
    labels: () => Array.from({ length: 31 }, (_, i) => `${30 - i} days ago`),
    data: async () => [
      dataset('Business-Categories', 'line', await series(30, 'business_categories', '`status` = 1 AND '), 'rgb(77, 189, 116)', 'rgba(77, 189, 116, 0.4)'),
    ],
  },
  'weekly-businesses': {
    // Laravel quirk: the labels loop is commented out — the pie chart has no labels.
    labels: () => [],
    data: async () => [
      dataset('Business Applications', 'pie', await series(30, 'businesses', '`status` = 1 AND '), 'rgb(77, 189, 116)', 'rgba(77, 189, 116, 0.4)'),
    ],
  },
};

for (const [name, chart] of Object.entries(CHARTS)) {
  phase9dRoutes.get(`/charts/${name}`, adminAuth, async (_req, res, next) => {
    try {
      res.json(await chart.data());
    } catch (e) {
      next(e);
    }
  });
}

// ---------------------------------------------------------------- dashboard widgets

const count = async (sql: string) => Number((await first(sql))?.c ?? 0);

phase9dRoutes.get('/dashboard', adminAuth, async (_req, res, next) => {
  try {
    const installCount = await count('SELECT COUNT(*) AS c FROM `device_ids`');
    const businessUsers = await count('SELECT COUNT(*) AS c FROM `business_users` WHERE `status` = 1');
    const businessCounts = await count('SELECT COUNT(*) AS c FROM `businesses` WHERE `status` = 1');
    const businessCategories = await count('SELECT COUNT(*) AS c FROM `business_categories` WHERE `status` = 1');
    const businessSubCategories = await count('SELECT COUNT(*) AS c FROM `business_sub_categories` WHERE `status` = 1');
    const businessAdvs = await count('SELECT COUNT(*) AS c FROM `advertisments` WHERE `status` = 1');
    const businessApplications = await count('SELECT COUNT(*) AS c FROM `businesse_requests` WHERE `is_business_approved` = 0');
    const eventsCount = await count('SELECT COUNT(*) AS c FROM `events` WHERE `status` = 1');
    const addressCount = await count('SELECT COUNT(*) AS c FROM `addresses`');
    const pct = (n: number, cap = 100) => Math.min(cap, (100 * Math.trunc(n)) / 1000);
    res.json({
      widgets: [
        { value: installCount, description: 'Application Users Count', href: null, class: 'bg-info text-white', ribbon: 'la-mobile', progress: pct(installCount) },
        { value: businessUsers, description: 'Staff', href: 'business-user', class: 'bg-primary text-white', ribbon: 'la-user', progress: pct(businessUsers) },
        { value: businessCounts, description: 'Total Businesses', href: 'business', class: 'bg-success text-white', ribbon: 'la-briefcase', progress: pct(businessCounts) },
        { value: businessCategories, description: 'Business Categories', href: 'business-category', class: 'bg-warning text-dark', ribbon: 'la-th-list', progress: pct(businessCategories) },
        { value: businessSubCategories, description: 'Business Sub Categories', href: 'business-sub-category', class: 'bg-warning text-dark', ribbon: 'la-th-list', progress: pct(businessSubCategories) },
        { value: businessAdvs, description: 'Business Advertisements', href: 'advertisment', class: 'bg-danger text-white', ribbon: 'la-bullhorn', progress: pct(businessAdvs) },
        // the blinking red dot is shown only while applications are pending
        { value: businessApplications, description: 'Pending Business Applications', blink: businessApplications > 0, href: 'business-request-managment', class: 'bg-info text-white', ribbon: null, progress: pct(businessApplications) },
        { value: eventsCount, description: 'Events', href: 'event', class: 'bg-danger text-white', ribbon: 'la-bullhorn', progress: pct(eventsCount, 50) },
        // Laravel quirk: the Addresses widget's progress bar is computed from $eventsCount.
        { value: addressCount, description: 'Addresses', href: 'address', class: 'bg-danger text-white', ribbon: 'la-bullhorn', progress: pct(eventsCount, 50) },
      ],
      charts: [
        { name: 'recent-businesses', header: 'New Businesses', labels: CHARTS['recent-businesses']!.labels() },
        { name: 'recent-business-users', header: 'New Business Users', labels: CHARTS['recent-business-users']!.labels() },
        { name: 'weekly-users', header: 'Business Categories', labels: CHARTS['weekly-users']!.labels() },
        { name: 'weekly-businesses', header: 'Business Applications', labels: CHARTS['weekly-businesses']!.labels() },
      ],
    });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- pincode import

phase9dRoutes.get('/import-pincode-data', adminAuth, (_req, res) => {
  res.json({ title: 'Import PinCode Data' });
});

const hasFile = (v: unknown): v is UploadedFileLike => isUploadedFile(v) && v.originalname !== '';

/**
 * `mimes:xlsx` — Laravel checks UploadedFile::guessExtension() (finfo on the content): an Office Open XML
 * spreadsheet zip is "xlsx" whatever its client name.
 */
function looksLikeXlsx(f: UploadedFileLike): boolean {
  const b = f.buffer ?? Buffer.alloc(0);
  if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) return false;
  const s = b.toString('latin1');
  return s.includes('xl/workbook.xml') || (s.includes('[Content_Types].xml') && s.includes('xl/'));
}

/** `$row[$key]` on a heading-row array — a missing key is an "Undefined array key" warning (ErrorException). */
function key(row: Record<string, CellValue>, k: string): CellValue {
  if (!(k in row)) throw new Error(`Undefined array key "${k}"`);
  return row[k] ?? null;
}

/** PinCodeMasterSheetImport1::model() — every Throwable is caught and only logged. */
async function pincodeRow(tx: Tx, row: Record<string, CellValue>): Promise<void> {
  try {
    const pin = key(row, 'pincode');
    const existing =
      pin === null
        ? await tx.first('SELECT * FROM `pincodes` WHERE `pin_code` IS NULL LIMIT 1')
        : await tx.first('SELECT * FROM `pincodes` WHERE `pin_code` = ? LIMIT 1', [pin]);
    if (existing) {
      await eloquentSave(
        tx,
        'pincodes',
        existing,
        {
          state: row.state ?? null,
          city: row.district ?? null,
          state_code: row.statecode ?? null,
          district_code: row.district_code ?? null,
        },
        { massAssign: true },
      );
      return;
    }
    // General::quickTranslate(): 400 JSON for empty input → translated_text missing → null.
    const stateHi = await quickTranslatedText(key(row, 'state'));
    const districtHi = await quickTranslatedText(key(row, 'district'));
    const now = nowDb();
    await tx.exec(
      'INSERT INTO `pincodes` (`pin_code`, `state`, `state_hi`, `city`, `city_hi`, `state_code`, `district_code`, `updated_at`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [pin, row.state ?? null, stateHi, row.district ?? null, districtHi, row.statecode ?? null, row.district_code ?? null, now, now],
    );
  } catch (e) {
    // FacadesLog::error("Error processing row - Error: " . $e->getTraceAsString()); $this->errorRow++;
    console.error('Error processing row - Error: ' + (e instanceof Error ? e.stack : String(e)));
  }
}

phase9dRoutes.post('/insertPinCodeData', adminAuth, async (req: Request, res: Response, next) => {
  try {
    const file = req.input.pin_code_master_sheet;
    if (!hasFile(file)) return void res.json({ alert: 'warning', message: 'Please select a file' });
    if (!looksLikeXlsx(file)) return void res.json({ alert: 'warning', message: 'Please select a file with a valid extension (xlsx)' });
    // copy($path, public_path().'/uploads/import_file/pin_code_master_sheet/'.$fileName) — outside the try:
    // a missing folder is a PHP warning → ErrorException → 500.
    const dest = path.posix.join(env.publicPath, 'uploads/import_file/pin_code_master_sheet') + '/' + file.originalname;
    try {
      fs.writeFileSync(dest, file.buffer ?? Buffer.alloc(0));
    } catch {
      throw new Error(`copy(${dest}): Failed to open stream: No such file or directory`);
    }
    try {
      // Excel::import(): one DB transaction around the whole sheet (excel.transactions.handler = db).
      const tx = await Tx.open();
      try {
        await tx.begin();
        for (const { row } of headingRows(readFirstSheet(fs.readFileSync(dest)))) await pincodeRow(tx, row);
        await tx.commit();
      } catch (e) {
        await tx.rollBack();
        throw e;
      } finally {
        await tx.release();
      }
      res.json({ success: 'Your sheet has been imported successfully.' });
    } catch (e) {
      // catch (\Exception $e) → back()->with('error', $e->getTraceAsString())
      res.json({ error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
    }
  } catch (e) {
    next(e);
  }
});
