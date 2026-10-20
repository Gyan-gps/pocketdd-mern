import type { Metadata } from 'next';
import Link from 'next/link';
import { DashboardChart, type ChartDataset } from '@/components/admin/DashboardChart';
import { adminFetch } from '@/lib/api';

export const metadata: Metadata = { title: 'Dashboard' };

interface Widget {
  value: number;
  description: string;
  href: string | null;
  /** Backpack progress-widget classes, e.g. "bg-info text-white". */
  class: string;
  progress: number;
  blink?: boolean;
}

interface DashboardData {
  widgets: Widget[];
  charts: Array<{ name: string; header: string; labels: string[] }>;
}

// CoreUI 4 background utilities used by the widgets (bg-primary follows the Backpack purple).
const WIDGET_BG: Record<string, string> = {
  'bg-info': 'bg-cui-info',
  'bg-primary': 'bg-primary',
  'bg-success': 'bg-cui-success',
  'bg-warning': 'bg-cui-warning',
  'bg-danger': 'bg-cui-danger',
};

/** resources/views/vendor/backpack/ui/dashboard.blade.php: progress widgets, then four chart cards. */
export default async function Dashboard() {
  const dash = await adminFetch<DashboardData>('/dashboard');
  const datasets = await Promise.all(dash.charts.map((c) => adminFetch<ChartDataset[]>(`/charts/${c.name}`)));

  return (
    <>
      <div className="mt-2 mb-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {dash.widgets.map((w) => {
          const [bg = '', fg = ''] = w.class.split(' ');
          const dark = fg === 'text-dark';
          const body = (
            <div className={`rounded border border-black/5 px-4 py-5 ${WIDGET_BG[bg] ?? 'bg-cui-secondary'} ${dark ? 'text-[#4f5d73]' : 'text-white'}`}>
              <div>{w.value}</div>
              <div className="flex items-center gap-1.5">
                {w.description}
                {w.blink && <span className="inline-block size-2 animate-pulse rounded-full bg-red-600" aria-label="New" />}
              </div>
              <div className="mt-3 h-4 overflow-hidden rounded bg-white/25">
                <div className="h-full rounded bg-white" style={{ width: `${Math.max(1, w.progress)}%` }} />
              </div>
            </div>
          );
          return w.href ? (
            <Link key={w.description} href={`/pocketddadmin/${w.href}`} className="hover:no-underline">
              {body}
            </Link>
          ) : (
            <div key={w.description}>{body}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
        {dash.charts.map((c, i) => (
          <div key={c.name} className="mb-10 rounded border border-line bg-white">
            <div className="border-b border-line bg-[#f9fafb] px-4 py-2.5">{c.header}</div>
            <div className="p-4">
              <DashboardChart labels={c.labels} datasets={datasets[i] ?? []} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
