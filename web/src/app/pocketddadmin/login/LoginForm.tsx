'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action}>
      {state.error && <div className="alert alert-danger">{state.error}</div>}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={state.email} required autoFocus style={{ width: '100%', padding: 8 }} />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required style={{ width: '100%', padding: 8 }} />
      </div>
      <label style={{ fontSize: 14, display: 'flex', gap: 6, marginBottom: 16 }}>
        <input type="checkbox" name="remember" /> Remember me
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending} style={{ width: '100%' }}>
        {pending ? 'Signing in…' : 'Login'}
      </button>
    </form>
  );
}
