import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Login' };

/** Backpack auth/login.blade.php (coreuiv4): heading, card with the form, developer footer. */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-6 text-[2rem] font-light">Login</h1>
        <div className="w-full max-w-[416px] rounded border border-line bg-white p-6">
          <LoginForm />
        </div>
      </main>
      <footer className="mx-auto p-2 text-muted">
        Handcrafted by{' '}
        <a href="https://www.microprixs.com/" target="_blank" rel="noopener">
          Microprixs Solution Pvt.Ltd
        </a>
        .
      </footer>
    </div>
  );
}
