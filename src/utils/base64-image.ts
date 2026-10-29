// Controllers' private createImageFromBase64() (BusinessController, BusinessUserProfileController).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { phpStr } from './php/values.js';

const STREAM_ERRORS: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory',
};

/** PHP base64_decode() (non-strict): characters outside the alphabet are skipped. */
function phpBase64Decode(s: string): Buffer {
  return Buffer.from(s.replace(/[^A-Za-z0-9+/]/g, ''), 'base64');
}

/**
 * Controllers' private createImageFromBase64($base64, $folder): writes
 * public_path('/uploads/<folder>/') . "<rand 5 digits>-<time()>-img.<type>" and returns the relative path.
 * `mkdir` = the BusinessController variant creates the folder; BusinessUserProfileController's does not.
 */
export function createImageFromBase64(base64: unknown, folder: string, opts: { mkdir: boolean }): string {
  const str = phpStr(base64, 'explode', 2);
  const parts = str.split(';base64,');
  const typeAux = parts[0]!.split('image/');
  if (typeAux.length < 2) throw new Error('Undefined array key 1');
  const imageType = typeAux[1]!;
  const name = `${crypto.randomInt(10000, 100000)}-${Math.floor(Date.now() / 1000)}-img.${imageType}`;
  const dir = path.posix.join(env.publicPath, 'uploads', folder) + '/';
  const destination = dir + name;
  if (opts.mkdir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
  if (parts.length < 2) throw new Error('Undefined array key 1');
  const data = phpBase64Decode(parts[1]!);
  try {
    fs.writeFileSync(destination, data);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? '';
    throw new Error(`file_put_contents(${destination}): Failed to open stream: ${STREAM_ERRORS[code] ?? 'Operation failed'}`);
  }
  return `uploads/${folder}/${name}`;
}
