import { redirect } from 'next/navigation';

// Backpack: /pocketddadmin → dashboard
export default function AdminRoot() {
  redirect('/pocketddadmin/dashboard');
}
