import { AdminShell } from '@/components/admin/AdminShell';
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
    <AdminShell userName={me.name ?? me.email ?? ''} available={entities.map((e) => e.route)} logoutAction={logout}>
      {children}
    </AdminShell>
  );
}
