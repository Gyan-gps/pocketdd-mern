import type { Request } from 'express';
import { env } from '../config/env.js';

/** Laravel `url($path)`: absolute URLs pass through, otherwise prefixed with the request root. */
export function url(req: Request, path: string): string {
  if (/^(#|\/\/|https?:\/\/|mailto:|tel:)/i.test(path)) return path;
  const root = env.appUrlOverride ?? `${req.protocol}://${req.get('host')}`;
  return `${root.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** `env('APP_URL') . '/' . $path` as used by model accessors. */
export function appUrl(path: string): string {
  return `${env.appUrl}/${path}`;
}
