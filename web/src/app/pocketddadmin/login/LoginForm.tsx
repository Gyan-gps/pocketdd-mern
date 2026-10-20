'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} noValidate>
      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          required
          autoFocus
          aria-invalid={!!state.error}
          aria-describedby={state.error ? 'login-error' : undefined}
          className={state.error ? 'invalid' : undefined}
        />
        {state.error && (
          <div id="login-error" className="error" role="alert">
            {state.error}
          </div>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <label className="mb-6 flex items-center gap-2">
        <input type="checkbox" name="remember" className="size-4 accent-primary" /> Remember me
      </label>
      <button className="btn btn-primary w-full justify-center" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Login'}
      </button>
    </form>
  );
}
