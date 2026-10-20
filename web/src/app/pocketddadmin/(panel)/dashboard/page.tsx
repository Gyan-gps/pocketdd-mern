import type { Metadata } from 'next';
import Link from 'next/link';
import { adminFetch } from '@/lib/api';

export const metadata: Metadata = { title: 'Dashboard' };

interface Widget {
  value: number;
  description: string;
  href: string | null;
  class: string;
  progress: number;
  blink?: boolean;
}
interface Dataset {
  borderColor: string;
  backgroundColor: string;
  data: number[];
  label: string;
  type: string;
}
interface DashboardData {
  widgets: Widget[];
  charts: Array<{ name: string; header: string; labels: string[] }>;
}

const BG: Record<string, string> = { 'bg-info': '#17a2b8', 'bg-primary': '#467fd0', 'bg-success': '#42ba96', 'bg-warning': '#ffc107', 'bg-danger': '#df4759' };

/** Inline-SVG rendering of the consoletvs/charts (Chart.js) datasets: bar / line / pie. */
function Chart({ labels, datasets }: { labels: string[]; datasets: Dataset[] }) {
  const W = 520;
  const H = 240;
  const P = 30;
  if (datasets[0]?.type === 'pie') {
    const d = datasets[0];
    const total = d.data.reduce((a, b) => a + b, 0);
    let angle = -Math.PI / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={d.label}>
        {total === 0 ? (
          <circle cx={W / 2} cy={H / 2} r={90} fill="none" stroke={d.borderColor} strokeWidth={2} />
        ) : (
          d.data.map((v, i) => {
            if (!v) return null;
            const a2 = angle + (2 * Math.PI * v) / total;
            const [x1, y1, x2, y2] = [Math.cos(angle), Math.sin(angle), Math.cos(a2), Math.sin(a2)].map((t, k) => (k % 2 ? H / 2 : W / 2) + 90 * t);
            const path = v === total ? `M ${W / 2 - 90} ${H / 2} a 90 90 0 1 0 180 0 a 90 90 0 1 0 -180 0` : `M ${W / 2} ${H / 2} L ${x1} ${y1} A 90 90 0 ${a2 - angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
            angle = a2;
            return <path key={i} d={path} fill={d.backgroundColor} stroke={d.borderColor} strokeWidth={2}><title>{`${labels[i] ?? ''} ${v}`}</title></path>;
          })
        )}
        <text x={10} y={16} fontSize={12}>{d.label}</text>
      </svg>
    );
  }
  const n = Math.max(...datasets.map((d) => d.data.length), 1);
  const max = Math.max(1, ...datasets.flatMap((d) => d.data));
  const x = (i: number) => P + ((W - 2 * P) * (i + 0.5)) / n;
  const y = (v: number) => H - P - ((H - 2 * P) * v) / max;
  const bw = ((W - 2 * P) / n / Math.max(datasets.length, 1)) * 0.8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#999" />
      <text x={2} y={P} fontSize={10}>{max}</text>
      <text x={2} y={H - P} fontSize={10}>0</text>
      {datasets.map((d, di) =>
        d.type === 'line' ? (
          <polyline key={di} fill="none" stroke={d.borderColor} strokeWidth={2} points={d.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ) : (
          d.data.map((v, i) => (
            <rect key={`${di}-${i}`} x={x(i) - (bw * datasets.length) / 2 + di * bw} y={y(v)} width={bw} height={H - P - y(v)} fill={d.backgroundColor} stroke={d.borderColor} strokeWidth={2}>
              <title>{`${labels[i] ?? ''}: ${v}`}</title>
            </rect>
          ))
        ),
      )}
      {labels.map((l, i) => (n <= 7 || i % 5 === 0 ? <text key={i} x={x(i)} y={H - 8} fontSize={9} textAnchor="middle">{l}</text> : null))}
      {datasets.map((d, di) => (
        <g key={`l${di}`}>
          <rect x={P + di * 220} y={4} width={12} height={10} fill={d.backgroundColor} stroke={d.borderColor} />
          <text x={P + di * 220 + 16} y={13} fontSize={11}>{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

// resources/views/vendor/backpack/ui/dashboard.blade.php: progress widgets + 4 chart widgets
export default async function Dashboard() {
  const dash = await adminFetch<DashboardData>('/dashboard');
  const data = await Promise.all(dash.charts.map((c) => adminFetch<Dataset[]>(`/charts/${c.name}`)));
  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        {dash.widgets.map((w) => {
          const [bg, fg] = w.class.split(' ');
          const body = (
            <div className="card" style={{ background: BG[bg!] ?? '#888', color: fg === 'text-dark' ? '#222' : '#fff', borderLeft: '4px solid rgba(255,255,255,.6)' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{w.value}</div>
              <div>
                {w.description}
                {w.blink && <span className="blink-dot" style={{ width: 8, height: 8, background: 'red', borderRadius: '50%', display: 'inline-block', marginLeft: 6 }} />}
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,.3)', marginTop: 8 }}>
                <div style={{ width: `${w.progress}%`, height: 4, background: fg === 'text-dark' ? '#222' : '#fff' }} />
              </div>
            </div>
          );
          return w.href ? (
            <Link key={w.description} href={`/pocketddadmin/${w.href}`} style={{ textDecoration: 'none' }}>
              {body}
            </Link>
          ) : (
            <a key={w.description} href="#" style={{ textDecoration: 'none' }}>
              {body}
            </a>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {dash.charts.map((c, i) => (
          <div key={c.name} className="card">
            <h3 style={{ marginTop: 0 }}>{c.header}</h3>
            <Chart labels={c.labels} datasets={data[i]!} />
          </div>
        ))}
      </div>
    </>
  );
}
