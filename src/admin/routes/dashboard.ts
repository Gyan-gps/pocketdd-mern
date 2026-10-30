// directory admin custom admin routes:
//   GET  import-pincode-data          → PinCodeCrudController@importPinCodeData (Blade upload form → Next page; title only)
//   POST insertPinCodeData            → PinCodeCrudController@insertPinCodeMaster (PinCodeMasterImport / PinCodeMasterSheetImport1)
//   GET  charts/recent-businesses     → Charts\RecentBusinessesChartController@response
//   GET  charts/recent-business-users → Charts\RecentBusinessUsersChartController@response
//   GET  charts/weekly-users          → Charts\WeeklyUsersChartController@response
//   GET  charts/weekly-businesses     → Charts\WeeklyBusinessChartController@response
//   GET  dashboard                    → resources/views/vendor/backpack/ui/dashboard.blade.php widget values + chart labels
//
// Import outcome as JSON (Laravel redirects + flashes), same convention as catalog-imports.ts:
//   { alert: 'warning', message } | { success } | { error }
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { nowDb } from '../../core/time.js';
import { insertRow, transaction, type ClientSession, type Row } from '../../db/mongo.js';
import { isUploadedFile, type UploadedFileLike } from '../../utils/php/values.js';
import { CASE_INSENSITIVE, originalIsEquivalent } from '../../db/eloquent.js';
import {
  Address,
  Advertisement,
  Business,
  BusinessCategory,
  BusinessRequest,
  BusinessSubCategory,
  BusinessUser,
  DeviceId,
  Event,
  Pincode,
  type AnyModel,
} from '../../models/index.js';
import { quickTranslatedText } from '../../utils/general.js';
import { adminAuth } from '../auth.js';
import { headingRows, readFirstSheet, type CellValue } from '../xlsx.js';

export const dashboardRoutes = Router();

// ---------------------------------------------------------------- dates (app timezone Asia/Kolkata)

/** `today()->subDays($n)->toDateString()` / `now()->subDay($n)->format('Y-m-d')` in IST. */
export function istDateMinus(days: number, now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCDate(ist.getUTCDate() - days);
  return ist.toISOString().slice(0, 10);
}

// DATE(created_at) = date: the stored "YYYY-MM-DD HH:MM:SS" string starts with the date.
const countOn = (model: AnyModel, date: string, extra: Record<string, unknown> = {}) =>
  model.countDocuments({ ...extra, created_at: { $regex: `^${date}` } });

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

async function series(days: number, model: AnyModel, extra: Record<string, unknown> = {}): Promise<number[]> {
  const counts: number[] = [];
  for (let daysAgo = days; daysAgo >= 0; daysAgo--) counts.push(await countOn(model, istDateMinus(daysAgo), extra));
  return counts;
}

export const CHARTS: Record<string, { labels: () => string[]; data: () => Promise<Dataset[]> }> = {
  'recent-businesses': {
    labels: () => [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => istDateMinus(daysAgo)),
    data: async () => [
      dataset('Business Created', 'bar', await series(6, Business), 'rgb(66, 186, 150, 1)', 'rgb(66, 186, 150, 0.4)'),
      dataset('Business categories Created', 'bar', await series(6, BusinessCategory), 'rgb(70, 127, 208)', 'rgb(70, 127, 208)'),
    ],
  },
  'recent-business-users': {
    labels: () => [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => istDateMinus(daysAgo)),
    data: async () => [
      dataset('Business Users Created', 'bar', await series(6, BusinessUser), 'rgb(66, 186, 150, 1)', 'rgb(66, 186, 118)'),
      dataset('Business Advertisements Created', 'bar', await series(6, Advertisement), 'rgb(70, 127, 208)', 'rgb(70, 127, 208)'),
    ],
  },
  'weekly-users': {
    labels: () => Array.from({ length: 31 }, (_, i) => `${30 - i} days ago`),
    data: async () => [
      dataset('Business-Categories', 'line', await series(30, BusinessCategory, { status: 1 }), 'rgb(77, 189, 116)', 'rgba(77, 189, 116, 0.4)'),
    ],
  },
  'weekly-businesses': {
    // Laravel quirk: the labels loop is commented out — the pie chart has no labels.
    labels: () => [],
    data: async () => [
      dataset('Business Applications', 'pie', await series(30, Business, { status: 1 }), 'rgb(77, 189, 116)', 'rgba(77, 189, 116, 0.4)'),
    ],
  },
};

for (const [name, chart] of Object.entries(CHARTS)) {
  dashboardRoutes.get(`/charts/${name}`, adminAuth, async (_req, res, next) => {
    try {
      res.json(await chart.data());
    } catch (error) {
      next(error);
    }
  });
}

// ---------------------------------------------------------------- dashboard widgets

const count = (model: AnyModel, filter: Record<string, unknown> = {}) => model.countDocuments(filter);

dashboardRoutes.get('/dashboard', adminAuth, async (_req, res, next) => {
  try {
    const installCount = await count(DeviceId);
    const businessUsers = await count(BusinessUser, { status: 1 });
    const businessCounts = await count(Business, { status: 1 });
    const businessCategories = await count(BusinessCategory, { status: 1 });
    const businessSubCategories = await count(BusinessSubCategory, { status: 1 });
    const businessAdvertisements = await count(Advertisement, { status: 1 });
    const businessApplications = await count(BusinessRequest, { is_business_approved: 0 });
    const eventsCount = await count(Event, { status: 1 });
    const addressCount = await count(Address);
    const pct = (value: number, cap = 100) => Math.min(cap, (100 * Math.trunc(value)) / 1000);
    res.json({
      widgets: [
        { value: installCount, description: 'Application Users Count', href: null, class: 'bg-info text-white', ribbon: 'la-mobile', progress: pct(installCount) },
        { value: businessUsers, description: 'Staff', href: 'business-user', class: 'bg-primary text-white', ribbon: 'la-user', progress: pct(businessUsers) },
        { value: businessCounts, description: 'Total Businesses', href: 'business', class: 'bg-success text-white', ribbon: 'la-briefcase', progress: pct(businessCounts) },
        { value: businessCategories, description: 'Business Categories', href: 'business-category', class: 'bg-warning text-dark', ribbon: 'la-th-list', progress: pct(businessCategories) },
        { value: businessSubCategories, description: 'Business Sub Categories', href: 'business-sub-category', class: 'bg-warning text-dark', ribbon: 'la-th-list', progress: pct(businessSubCategories) },
        { value: businessAdvertisements, description: 'Business Advertisements', href: 'advertisment', class: 'bg-danger text-white', ribbon: 'la-bullhorn', progress: pct(businessAdvertisements) },
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
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- pincode import

dashboardRoutes.get('/import-pincode-data', adminAuth, (_req, res) => {
  res.json({ title: 'Import PinCode Data' });
});

const hasFile = (value: unknown): value is UploadedFileLike => isUploadedFile(value) && value.originalname !== '';

/**
 * `mimes:xlsx` — Laravel checks UploadedFile::guessExtension() (finfo on the content): an Office Open XML
 * spreadsheet zip is "xlsx" whatever its client name.
 */
function looksLikeXlsx(file: UploadedFileLike): boolean {
  const buffer = file.buffer ?? Buffer.alloc(0);
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return false;
  const content = buffer.toString('latin1');
  return content.includes('xl/workbook.xml') || (content.includes('[Content_Types].xml') && content.includes('xl/'));
}

/** `$row[$key]` on a heading-row array — a missing key is an "Undefined array key" warning (ErrorException). */
function key(row: Record<string, CellValue>, name: string): CellValue {
  if (!(name in row)) throw new Error(`Undefined array key "${name}"`);
  return row[name] ?? null;
}

/** Cell → value stored in a VARCHAR column (MySQL coerces numbers/booleans to text). */
const text = (value: CellValue | undefined) =>
  value === null || value === undefined ? null : typeof value === 'boolean' ? (value ? '1' : '0') : String(value);

/** PinCodeMasterSheetImport1::model() — every Throwable is caught and only logged. */
async function pincodeRow(session: ClientSession, row: Record<string, CellValue>): Promise<void> {
  try {
    const pinCode = key(row, 'pincode');
    // `pin_code = ?`: case-insensitive, and a numeric cell also equals its text form.
    const existing = await Pincode.findOne(
      { pin_code: pinCode === null ? null : { $in: [pinCode, String(pinCode)] } },
      null,
      { collation: CASE_INSENSITIVE, sort: { _id: 1 }, session },
    ).lean<Row>();
    if (existing) {
      // eloquentSave(massAssign): only dirty attributes are written, then updated_at is touched.
      const attrs: Record<string, CellValue> = {
        state: row.state ?? null,
        city: row.district ?? null,
        state_code: row.statecode ?? null,
        district_code: row.district_code ?? null,
      };
      const original = { ...existing, id: existing._id };
      const dirty: Record<string, unknown> = {};
      for (const [column, value] of Object.entries(attrs)) {
        if (!originalIsEquivalent(original, column, value)) dirty[column] = text(value);
      }
      if (Object.keys(dirty).length) {
        const now = nowDb();
        if (!originalIsEquivalent(original, 'updated_at', now)) dirty.updated_at = now;
        await Pincode.updateOne({ _id: existing._id }, { $set: dirty }, { session });
      }
      return;
    }
    // General::quickTranslate(): 400 JSON for empty input → translated_text missing → null.
    const stateHi = await quickTranslatedText(key(row, 'state'));
    const districtHi = await quickTranslatedText(key(row, 'district'));
    const now = nowDb();
    await insertRow(
      Pincode.collection.collectionName,
      {
        pin_code: text(pinCode),
        state: text(row.state),
        state_hi: stateHi,
        city: text(row.district),
        city_hi: districtHi,
        state_code: text(row.statecode),
        district_code: text(row.district_code),
        updated_at: now,
        created_at: now,
      },
      session,
    );
  } catch (error) {
    // FacadesLog::error("Error processing row - Error: " . $e->getTraceAsString()); $this->errorRow++;
    console.error('Error processing row - Error: ' + (error instanceof Error ? error.stack : String(error)));
  }
}

dashboardRoutes.post('/insertPinCodeData', adminAuth, async (req: Request, res: Response, next) => {
  try {
    const file = req.input.pin_code_master_sheet;
    if (!hasFile(file)) return void res.json({ alert: 'warning', message: 'Please select a file' });
    if (!looksLikeXlsx(file)) return void res.json({ alert: 'warning', message: 'Please select a file with a valid extension (xlsx)' });
    // copy($path, public_path().'/uploads/import_file/pin_code_master_sheet/'.$fileName) — outside the try:
    // a missing folder is a PHP warning → ErrorException → 500.
    const destination = path.posix.join(env.publicPath, 'uploads/import_file/pin_code_master_sheet') + '/' + file.originalname;
    try {
      fs.writeFileSync(destination, file.buffer ?? Buffer.alloc(0));
    } catch {
      throw new Error(`copy(${destination}): Failed to open stream: No such file or directory`);
    }
    try {
      // Excel::import(): one DB transaction around the whole sheet (excel.transactions.handler = db).
      await transaction(async (session) => {
        for (const { row } of headingRows(readFirstSheet(fs.readFileSync(destination)))) await pincodeRow(session, row);
      });
      res.json({ success: 'Your sheet has been imported successfully.' });
    } catch (error) {
      // catch (\Exception $e) → back()->with('error', $e->getTraceAsString())
      res.json({ error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
  } catch (error) {
    next(error);
  }

});
