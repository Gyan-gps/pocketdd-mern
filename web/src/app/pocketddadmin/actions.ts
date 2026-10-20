'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, ADMIN_PREFIX, adminFetch } from '@/lib/api';

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '');
  const res = await fetch(`${process.env.API_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password: String(form.get('password') ?? '') }),
    cache: 'no-store',
  });
  const body = (await res.json()) as { token?: string; message?: string; expires_in_minutes?: number };
  if (!res.ok || !body.token) return { error: body.message ?? 'Login failed', email };

  (await cookies()).set(ADMIN_COOKIE, body.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // "remember me" keeps the cookie for 30 days; otherwise it is a session cookie.
    ...(form.get('remember') ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  });
  redirect(`${ADMIN_PREFIX}/dashboard`);
}

export async function logout() {
  try {
    await adminFetch('/auth/logout', { method: 'POST' });
  } catch {
    /* already expired */
  }
  (await cookies()).delete(ADMIN_COOKIE);
  redirect(`${ADMIN_PREFIX}/login`);
}
