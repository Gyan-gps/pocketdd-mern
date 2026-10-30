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
import { createAboutUsValidation, updateAboutUsValidation } from '../../validators/admin/about-us.validator.js';
import { coerceRow, newRow, storeCoerced } from '../support/catalog-helpers.js';
import { decodeAssoc, jsonColumnLike, onlyColumns, phpEmpty, rawJson, stateOptions, type FormOpts } from '../support/directory-helpers.js';

const UPLOAD_PATH = 'uploads/tourist_place_images/';
const FIELDS = ['state', 'city', 'about_mediator', 'about_mediator_hi', 'know_your_city', 'know_your_city_hi', 'tourist_places'];

const clean = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && !isUploadedFile(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clean(nested)]));
  }
  return value;
};

/** Rows as PHP sees `$request->input($name)`: a JSON string (Next form) is decoded; `{0:…}` objects become lists. */
function rowsOf(value: unknown): Record<string, unknown>[] | null {
  if (typeof value === 'string') {
    try {
      value = clean(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  return (Array.isArray(value) ? value : Object.values(value)) as Record<string, unknown>[];
}

/**
 * Normalise the request so FormRequest rules see what PHP sees: `tourist_places` rows with each uploaded
 * `tourist_places[i][place_image]` file merged in (multer leaves bracketed file names flat), and
 * `_order_tourist_places` decoded.
 */
function prepareInput(req: Request): void {
  const input = req.input;
  const rows = rowsOf(input.tourist_places);
  if (rows) input.tourist_places = rows.map((row) => (row && typeof row === 'object' ? { ...row } : row));
  for (const key of Object.keys(input)) {
    const match = /^tourist_places\[(\d+)\]\[place_image\]$/.exec(key);
    if (!match) continue;
    const file = input[key];
    delete input[key];
    if (!isUploadedFile(file) || file.size === 0 || file.originalname === '') continue;
    const list = (Array.isArray(input.tourist_places) ? input.tourist_places : []) as Record<string, unknown>[];
    const index = Number(match[1]);
    list[index] = { ...(list[index] ?? {}), place_image: file };
    input.tourist_places = list;
  }
  const order = rowsOf(input._order_tourist_places);
  if (order) input._order_tourist_places = order;
}

/** `$request->file('tourist_places')` merged into `$request->input('tourist_places')` (mergeValuesRecursive). */
function requestRows(req: Request): Map<number, Record<string, unknown>> {
  const rowsByIndex = new Map<number, Record<string, unknown>>();
  const rows = Array.isArray(req.input.tourist_places) ? (req.input.tourist_places as unknown[]) : [];
  rows.forEach((row, index) => {
    if (row !== undefined) {
      rowsByIndex.set(index, row && typeof row === 'object' ? { ...(row as Record<string, unknown>) } : ({} as Record<string, unknown>));
    }
  });
  return rowsByIndex;
}

/** HandleRepeatableUploads::handleRepeatableFiles() for the single `place_image` uploader. */
function processTouristPlaces(req: Request, previousRaw: unknown): unknown {
  const values = requestRows(req);
  // getFileOrderFromRequest(): `_order_tourist_places[row][place_image]`
  const ordered = new Map<number, unknown>();
  const order = req.input._order_tourist_places;
  if (Array.isArray(order)) {
    order.forEach((orderRow, row) => {
      if (orderRow === undefined) return;
      ordered.set(row, orderRow && typeof orderRow === 'object' ? ((orderRow as Record<string, unknown>).place_image ?? null) : null);
    });
  }
  // uploadRepeatableFiles(): store each valid uploaded file.
  for (const [row, item] of values) {
    const file = item.place_image;
    if (isUploadedFile(file) && file.size > 0) {
      const name = backpackFileName(file as UploadedFileLike);
      const absoluteDirectory = path.posix.join(env.publicPath, UPLOAD_PATH);
      fs.mkdirSync(absoluteDirectory, { recursive: true });
      fs.writeFileSync(absoluteDirectory + name, (file as UploadedFileLike).buffer ?? Buffer.alloc(0));
      ordered.set(row, UPLOAD_PATH + name);
    }
  }
  // previous values: array_column($previousRows, 'place_image') (rows without the key are skipped → reindexed).
  const previousDecoded = decodeAssoc(previousRaw);
  const previousRows = previousDecoded && typeof previousDecoded === 'object' ? Object.values(previousDecoded as object) : [];
  const previous = previousRows
    .filter((previousRow) => previousRow && typeof previousRow === 'object' && !Array.isArray(previousRow) && 'place_image' in (previousRow as object))
    .map((previousRow) => (previousRow as Record<string, unknown>).place_image);
  previous.forEach((file, row) => {
    if (!file) return;
    if (!ordered.has(row)) ordered.set(row, null);
    // in_array() (loose) against the new ordered values.
    if (![...ordered.values()].some((value) => value !== null && value !== undefined && String(value) === String(file))) {
      deletePublicFile(String(file));
    }
  });
  // processRepeatableUploads(): $item['place_image'] = $uploadedValues[$key] ?? null
  const processed: Record<string, unknown>[] = [];
  for (const [row, item] of values) {
    item.place_image = ordered.get(row) ?? null;
    processed[row] = item;
  }
  const list = processed.filter((item) => item !== undefined);
  if (list.length === 0) return null;
  // Model has no cast for tourist_places → json_encode() of the list; stored as a native value.
  return list.length === processed.length ? list : Object.fromEntries(values);
}

/** List column: json_decode(...); "name (name_hi)" joined with ', ' (or '-'). */
export function touristPlacesText(raw: unknown): string {
  const places = decodeAssoc(raw);
  if (phpEmpty(places) || typeof places !== 'object') return '-';
  const phpString = (value: unknown) =>
    value === null || value === undefined || value === false
      ? ''
      : value === true
        ? '1'
        : typeof value === 'object'
          ? 'Array'
          : String(value);
  return Object.values(places as object)
    .map((place) => {
      const fields = place && typeof place === 'object' && !Array.isArray(place) ? (place as Record<string, unknown>) : {};
      return `${phpString(fields.place_name ?? '')} (${phpString(fields.place_name_hi ?? '')})`;
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
        return { ...createAboutUsValidation.rules };
      },
      messages: createAboutUsValidation.messages,
    },
    update: {
      rules: (req) => {
        prepareInput(req);
        return { ...updateAboutUsValidation.rules };
      },
      messages: updateAboutUsValidation.messages,
    },
  },
  serialize: (row: Row) => ({
    ...row,
    tourist_places: rawJson(row.tourist_places),
    tourist_places_text: touristPlacesText(row.tourist_places),
    tourist_places_list: decodeAssoc(row.tourist_places),
    // Edit form value: retrieveRepeatableFiles() strips the upload path from each place_image.
    tourist_places_form: (() => {
      const places = decodeAssoc(row.tourist_places);
      if (!places || typeof places !== 'object') return [];
      return Object.values(places as object).map((place) => {
        const formRow = place && typeof place === 'object' && !Array.isArray(place) ? { ...(place as Record<string, unknown>) } : {};
        const image = formRow.place_image;
        formRow.place_image =
          image === undefined || image === null
            ? null
            : typeof image === 'string' && image.includes(UPLOAD_PATH)
              ? image.slice(image.indexOf(UPLOAD_PATH) + UPLOAD_PATH.length)
              : image;
        return formRow;
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
      const row = await onlyColumns('about_uses', data);
      coerceRow('about_uses', row);
      return row;

    },
    afterUpdate: (id, data) => storeCoerced('about_uses', id, data),
  },
};
