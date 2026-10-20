import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ADMIN_COOKIE = 'pdd_admin';
export const ADMIN_PREFIX = '/pocketddadmin'; // config('backpack.base.route_prefix')

const API_URL = process.env.API_URL ?? 'http://api:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** Server-side call to the Express admin API with the session token from the httpOnly cookie. */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) redirect(`${ADMIN_PREFIX}/login`);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function publicFetch<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: 'no-store', ...init });
  return { status: res.status, body: (await res.json()) as T };
}

export interface EntityMeta {
  route: string;
  operations: string[];
  required: { create: string[]; update: string[] };
}

/** Per-entity metadata from the API (operations + required form fields). */
export async function getEntityMeta(route: string): Promise<EntityMeta | undefined> {
  const all = await adminFetch<EntityMeta[]>('/entities');
  return all.find((e) => e.route === route);
}
