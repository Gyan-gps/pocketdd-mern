'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import { ADMIN_PREFIX, ApiError, adminFetch } from '@/lib/api';

export interface SaveState {
  message?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, string>;
}

/** Create (no id) or update an entry. Mirrors Backpack: validation errors re-render the form with old input. */
export async function saveEntry(entity: string, id: string | null, _prev: SaveState, form: FormData): Promise<SaveState> {
  const hasFiles = [...form.values()].some((v) => v instanceof File && v.size > 0);
  const values: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') values[k] = v;

  let body: BodyInit;
  // API-decided redirect (overridden store()/update(), e.g. advertisment/create?client_name=<new id>).
  let apiRedirect: string | null = null;
  if (hasFiles) {
    body = form;
  } else {
    // `name[]` inputs (select multiple) become arrays, like PHP's request parsing.
    const payload: Record<string, string | string[]> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v !== 'string') continue;
      if (k.endsWith('[]')) {
        const key = k.slice(0, -2);
        payload[key] = [...(Array.isArray(payload[key]) ? (payload[key] as string[]) : []), v];
      } else payload[k] = v;
    }
    body = JSON.stringify(payload);
  }
  try {
    const saved = await adminFetch<{ redirect?: string | null } | null>(id ? `/${entity}/${id}` : `/${entity}`, { method: id ? 'PUT' : 'POST', body });
    apiRedirect = saved && typeof saved === 'object' ? (saved.redirect ?? null) : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) {
      const b = e.body as { message: string; errors: Record<string, string[]> };
      return { message: b.message, errors: b.errors, values };
    }
    throw e;
  }
  revalidatePath(`${ADMIN_PREFIX}/${entity}`);
  // Backpack save action "save_and_back" + flash message.
  const msg = id ? 'The item has been modified successfully.' : 'The item has been added successfully.';
  const custom = apiRedirect ?? getEntity(entity)?.saveRedirect?.(values);
  if (custom) {
    revalidatePath(`${ADMIN_PREFIX}/${custom.split('?')[0]}`);
    redirect(`${ADMIN_PREFIX}/${custom}${custom.includes('?') ? '&' : '?'}saved=${encodeURIComponent(msg)}`);
  }
  redirect(`${ADMIN_PREFIX}/${entity}?saved=${encodeURIComponent(msg)}`);
}

export async function deleteEntry(entity: string, id: string) {
  await adminFetch(`/${entity}/${id}`, { method: 'DELETE' });
  revalidatePath(`${ADMIN_PREFIX}/${entity}`);
}
