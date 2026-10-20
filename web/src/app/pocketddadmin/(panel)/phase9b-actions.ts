'use server';

import { revalidatePath } from 'next/cache';
import { ADMIN_PREFIX, adminFetch } from '@/lib/api';

export interface ImportState {
  alert?: string;
  message?: string;
  success?: string;
  error?: string;
}

/** POST insertCategoryData / insertSubCategoryData (Excel import forms). */
export async function importSheet(endpoint: string, _prev: ImportState, form: FormData): Promise<ImportState> {
  const res = await adminFetch<ImportState>(`/${endpoint}`, { method: 'POST', body: form });
  revalidatePath(`${ADMIN_PREFIX}/business-category`);
  revalidatePath(`${ADMIN_PREFIX}/business-sub-category`);
  return res;
}

/** POST slider/reorder with Backpack's nestedSortable `tree` payload. */
export async function saveSliderOrder(tree: string): Promise<string> {
  const res = await adminFetch<string>('/slider/reorder', { method: 'POST', body: JSON.stringify({ tree }) });
  revalidatePath(`${ADMIN_PREFIX}/slider`);
  return typeof res === 'string' ? res : String(res);
}
