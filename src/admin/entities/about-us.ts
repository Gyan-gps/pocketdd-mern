// Port of App\Http\Controllers\Admin\AboutUsCrudController (+ AboutUsRequest / AboutUsUpdateRequest,
// public/assets/js/about_us.js). Operations: List, Create, Update, Show. Model: AboutUs (no casts,
// $guarded = ['id']). `tourist_places` is a repeatable whose `place_image` subfield uses Backpack's
// repeatable uploader (withFiles disk public_path, path uploads/tourist_place_images):
//   Uploaders/Support/Traits/HandleRepeatableUploads.php + SingleFile::uploadRepeatableFiles().
// Laravel quirk (verified against Backpack): on edit the form re-sends the stored image as
// `_order_tourist_places[i][place_image]` = the value WITHOUT its path (retrieveRepeatableFiles strips it),
// so an untouched row is saved as the bare file name and the original file is deleted from disk.
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import type { Row } from '../../db/mongo.js';
import { isUploadedFile, type UploadedFileLike } from '../../utils/php/values.js';
import type { CrudConfig } from '../crud.js';
import { backpackFileName, deletePublicFile } from '../uploads.js';
import { coerceRow, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { decodeAssoc, jsonColumnLike, onlyColumns, phpEmpty, rawJson, stateOptions, type FormOpts } from '../support/directory-helpers.js';

const UPLOAD_PATH = 'uploads/tourist_place_images/';
const FIELDS = ['state', 'city', 'about_mediator', 'about_mediator_hi', 'know_your_city', 'know_your_city_hi', 'tourist_places'];

const BASE_RULES = {
  city: 'required',
  state: 'required',
  about_mediator: 'required',
  about_mediator_hi: 'required',
  know_your_city: 'required',
  know_your_city_hi: 'required',
  tourist_places: 'required|array|min:1|max:10',
  'tourist_places.*.place_name': 'required',
  'tourist_places.*.place_name_hi': 'required',
};

const MESSAGES = {
  'state.required': 'Please select a state.',
  'city.required': 'Please select a city.',
  'about_mediator.required': 'The "Know About the Mediator" field is required.',
  'about_mediator_hi.required': '"मध्यस्थ के बारे में जानें" फ़ील्ड आवश्यक है',
  'know_your_city.required': 'The "Know Your City" field is required.',
  'know_your_city_hi.required': 'The "अपने शहर को जानें" field is required.',
  'tourist_places.*.place_name.required': 'Each tourist place must have a name.',
  'tourist_places.*.place_name_hi.required': 'प्रत्येक पर्यटन स्थल का हिंदी नाम होना चाहिए।',
  'tourist_places.*.place_image.required': 'Each tourist place must have an image.',
  'tourist_places.*.place_image.mimes': 'Images must be in jpg, jpeg, png, or svg format.',
  'tourist_places.*.place_image.max': 'Each image must be less than 2MB.',
  'tourist_places.*.place_description.required': 'Each tourist place must have a description.',
  'tourist_places.*.place_description_hi.required': 'प्रत्येक पर्यटन स्थल का हिंदी विवरण होना चाहिए।',
};

const clean = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && !isUploadedFile(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  return v;
};

/** Rows as PHP sees `$request->input($name)`: a JSON string (Next form) is decoded; `{0:…}` objects become lists. */
function rowsOf(v: unknown): Record<string, unknown>[] | null {
  if (typeof v === 'string') {
    try {
      v = clean(JSON.parse(v));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  return (Array.isArray(v) ? v : Object.values(v)) as Record<string, unknown>[];
}

/**
 * Normalise the request so FormRequest rules see what PHP sees: `tourist_places` rows with each uploaded
 * `tourist_places[i][place_image]` file merged in (multer leaves bracketed file names flat), and
 * `_order_tourist_places` decoded.
 */
function prepareInput(req: Request): void {
  const input = req.input;
  const rows = rowsOf(input.tourist_places);
  if (rows) input.tourist_places = rows.map((r) => (r && typeof r === 'object' ? { ...r } : r));
  for (const key of Object.keys(input)) {
    const m = /^tourist_places\[(\d+)\]\[place_image\]$/.exec(key);
    if (!m) continue;
    const file = input[key];
    delete input[key];
    if (!isUploadedFile(file) || file.size === 0 || file.originalname === '') continue;
    const list = (Array.isArray(input.tourist_places) ? input.tourist_places : []) as Record<string, unknown>[];
    const i = Number(m[1]);
    list[i] = { ...(list[i] ?? {}), place_image: file };
    input.tourist_places = list;
  }
  const order = rowsOf(input._order_tourist_places);
  if (order) input._order_tourist_places = order;
}

/** `$request->file('tourist_places')` merged into `$request->input('tourist_places')` (mergeValuesRecursive). */
function requestRows(req: Request): Map<number, Record<string, unknown>> {
  const out = new Map<number, Record<string, unknown>>();
  const rows = Array.isArray(req.input.tourist_places) ? (req.input.tourist_places as unknown[]) : [];
  rows.forEach((r, i) => {
    if (r !== undefined) out.set(i, r && typeof r === 'object' ? { ...(r as Record<string, unknown>) } : ({} as Record<string, unknown>));
  });
  return out;
}

/** HandleRepeatableUploads::handleRepeatableFiles() for the single `place_image` uploader. */
function processTouristPlaces(req: Request, previousRaw: unknown): unknown {
  const values = requestRows(req);
  // getFileOrderFromRequest(): `_order_tourist_places[row][place_image]`
  const ordered = new Map<number, unknown>();
  const order = req.input._order_tourist_places;
  if (Array.isArray(order)) {
    order.forEach((o, row) => {
      if (o === undefined) return;
      ordered.set(row, o && typeof o === 'object' ? ((o as Record<string, unknown>).place_image ?? null) : null);
    });
  }
  // uploadRepeatableFiles(): store each valid uploaded file.
  for (const [row, item] of values) {
    const file = item.place_image;
    if (isUploadedFile(file) && file.size > 0) {
      const name = backpackFileName(file as UploadedFileLike);
      const abs = path.posix.join(env.publicPath, UPLOAD_PATH);
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(abs + name, (file as UploadedFileLike).buffer ?? Buffer.alloc(0));
      ordered.set(row, UPLOAD_PATH + name);
    }
  }
  // previous values: array_column($previousRows, 'place_image') (rows without the key are skipped → reindexed).
  const prevDecoded = decodeAssoc(previousRaw);
  const prevRows = prevDecoded && typeof prevDecoded === 'object' ? Object.values(prevDecoded as object) : [];
  const previous = prevRows
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r) && 'place_image' in (r as object))
    .map((r) => (r as Record<string, unknown>).place_image);
  previous.forEach((file, row) => {
    if (!file) return;
    if (!ordered.has(row)) ordered.set(row, null);
    // in_array() (loose) against the new ordered values.
    if (![...ordered.values()].some((v) => v !== null && v !== undefined && String(v) === String(file))) {
      deletePublicFile(String(file));
    }
  });
  // processRepeatableUploads(): $item['place_image'] = $uploadedValues[$key] ?? null
  const processed: Record<string, unknown>[] = [];
  for (const [row, item] of values) {
    item.place_image = ordered.get(row) ?? null;
    processed[row] = item;
  }
  const list = processed.filter((x) => x !== undefined);
  if (list.length === 0) return null;
  // Model has no cast for tourist_places → json_encode() of the list; stored as a native value.
  return list.length === processed.length ? list : Object.fromEntries(values);
}

/** List column: json_decode(...); "name (name_hi)" joined with ', ' (or '-'). */
export function touristPlacesText(raw: unknown): string {
  const places = decodeAssoc(raw);
  if (phpEmpty(places) || typeof places !== 'object') return '-';
  const str = (v: unknown) => (v === null || v === undefined || v === false ? '' : v === true ? '1' : typeof v === 'object' ? 'Array' : String(v));
  return Object.values(places as object)
    .map((p) => {
      const o = p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
      return `${str(o.place_name ?? '')} (${str(o.place_name_hi ?? '')})`;
    })
    .join(', ');
}

export const aboutUs: CrudConfig = {
  route: 'about-us',
  collection: 'about_uses',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // state, city and tourist_places (text type, table column → LIKE on the raw JSON) are searchable.
    searchable: ['state', 'city'],
    searchExtra: (term) => jsonColumnLike('about_uses', 'tourist_places', term),
    sortable: ['state', 'city', 'tourist_places'],
    orderBy: [['id', 'desc']],
  },
  formOptions: async (_req, id): Promise<FormOpts> => (id ? {} : { state: await stateOptions() }),
  fields: { create: FIELDS, update: FIELDS },
  validation: {
    create: {
      rules: (req) => {
        prepareInput(req);
        return {
          ...BASE_RULES,
          'tourist_places.*.place_image': 'required|image|mimes:jpg,jpeg,png,svg|max:2048',
          'tourist_places.*.place_description': 'required',
          'tourist_places.*.place_description_hi': 'required',
        };
      },
      messages: MESSAGES,
    },
    update: {
      rules: (req) => {
        prepareInput(req);
        return {
          ...BASE_RULES,
          'tourist_places.*.place_image': 'image|mimes:jpg,jpeg,png,svg|max:2048',
          'tourist_places.*.place_description': 'required',
          'tourist_places.*.place_description_hi': 'required',
        };
      },
      messages: MESSAGES,
    },
  },
  serialize: (row: Row) => ({
    ...row,
    tourist_places: rawJson(row.tourist_places),
    tourist_places_text: touristPlacesText(row.tourist_places),
    tourist_places_list: decodeAssoc(row.tourist_places),
    // Edit form value: retrieveRepeatableFiles() strips the upload path from each place_image.
    tourist_places_form: (() => {
      const d = decodeAssoc(row.tourist_places);
      if (!d || typeof d !== 'object') return [];
      return Object.values(d as object).map((p) => {
        const o = p && typeof p === 'object' && !Array.isArray(p) ? { ...(p as Record<string, unknown>) } : {};
        const img = o.place_image;
        o.place_image = img === undefined || img === null ? null : typeof img === 'string' && img.includes(UPLOAD_PATH) ? img.slice(img.indexOf(UPLOAD_PATH) + UPLOAD_PATH.length) : img;
        return o;
      });
    })(),
  }),
  hooks: {
    beforeCreate: async (data, req) => {
      data.tourist_places = processTouristPlaces(req, null);
      return newRow('about_uses', await onlyColumns('about_uses', data));
    },
    beforeUpdate: async (data, existing, req) => {
      data.tourist_places = processTouristPlaces(req, existing.tourist_places);
      const out = await onlyColumns('about_uses', data);
      coerceRow('about_uses', out);
      return out;
    },
    afterUpdate: (id, data) => storeCoerced('about_uses', id, data),
  },
};
