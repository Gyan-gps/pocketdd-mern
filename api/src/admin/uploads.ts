// Backpack 7 `upload` field with `withFiles => ['disk' => 'public_path', 'path' => …]`
// (Library/Uploaders/SingleFile.php + Support/FileNameGenerator.php), disk root = Laravel public_path().
//  - stored name: Str::slug(<client name before last '.'>) . '-' . Str::random(4) . '.' . $file->extension()
//    (extension guessed from the file CONTENT, like Symfony's finfo-based guesser),
//  - DB value: "<path>/<name>",
//  - new file → previous file deleted; key sent as null/'' (cleared) → previous file deleted + NULL;
//    key absent or a string (unchanged) → previous value kept.
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { strRandom } from '../core/auth/sanctum.js';
import { isUploadedFile, strSlug, type UploadedFileLike } from '../helpers/business.js';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

/** `UploadedFile::extension()` — content sniffing for the common types, client MIME as fallback. */
export function guessExtension(file: UploadedFileLike): string {
  const b = file.buffer ?? Buffer.alloc(0);
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(0, 2).toString('latin1') === 'BM') return 'bmp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = b.subarray(0, 512).toString('utf8');
  if (/<svg[\s>]/i.test(head)) return 'svg';
  if (b.length && !b.subarray(0, 512).includes(0)) return 'txt';
  return MIME_EXT[file.mimetype] ?? '';
}

/** FileNameGenerator::getName(). */
export function backpackFileName(file: UploadedFileLike): string {
  const orig = file.originalname;
  const base = orig.includes('.') ? orig.slice(0, orig.lastIndexOf('.')) : orig;
  return `${strSlug(base)}-${strRandom(4)}.${guessExtension(file)}`;
}

/** Storage::disk('public_path')->delete($path) — missing files are ignored. */
export function deletePublicFile(rel: unknown): void {
  if (typeof rel !== 'string' || rel === '') return;
  try {
    fs.unlinkSync(path.posix.join(env.publicPath, rel));
  } catch {
    /* Flysystem local delete of a missing file is a no-op */
  }
}

/**
 * SingleFile::uploadFiles() for one attribute. Mutates `data[field]`: the stored DB path, null when
 * cleared, or removes the key when the previous value is kept unchanged.
 */
export function applySingleUpload(
  data: Record<string, unknown>,
  input: Record<string, unknown>,
  field: string,
  dir: string,
  previous: unknown = null,
): void {
  const folder = dir.endsWith('/') ? dir : `${dir}/`;
  const value = input[field];
  if (isUploadedFile(value) && value.size > 0) {
    deletePublicFile(previous);
    const name = backpackFileName(value);
    const abs = path.posix.join(env.publicPath, folder);
    fs.mkdirSync(abs, { recursive: true });
    fs.writeFileSync(abs + name, value.buffer ?? Buffer.alloc(0));
    data[field] = folder + name;
    return;
  }
  if (field in input && (value === null || value === undefined || value === '') && previous) {
    deletePublicFile(previous);
    data[field] = null;
    return;
  }
  // No upload: on create the attribute stays NULL; on update the previous value is kept.
  if (previous === null || previous === undefined || previous === '') {
    if (field in data) data[field] = null;
  } else delete data[field];
}
