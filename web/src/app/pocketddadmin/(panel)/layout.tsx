import { Sidebar } from '@/components/admin/Sidebar';
import { adminFetch } from '@/lib/api';
import { logout } from '../actions';

interface Me {
  name: string | null;
  email: string | null;
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const [me, entities] = await Promise.all([
    adminFetch<Me>('/auth/me'),
    adminFetch<Array<{ route: string }>>('/entities'),
  ]);
  return (
    <div className="shell">
      <Sidebar available={entities.map((e) => e.route)} />
      <div className="main">
        <header className="topbar">
          <span>{me.name ?? me.email}</span>
          <form action={logout}>
            <button className="btn" type="submit">
              Logout
            </button>
          </form>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
