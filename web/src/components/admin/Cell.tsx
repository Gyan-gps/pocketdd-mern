import type { ColumnDef } from '@/admin/types';

/** Backpack column types (text with ->limit(), check, boolean, date, image…). */
export function Cell({ col, row }: { col: ColumnDef; row: Record<string, unknown> }) {
  if (col.render) return <>{col.render(row)}</>;
  const v = row[col.name];
  switch (col.type) {
    case 'check':
      return <span>{Number(v) ? '✔' : '✘'}</span>;
    case 'boolean':
      return <span>{Number(v) ? 'Yes' : 'No'}</span>;
    case 'image':
      return v ? <img src={`/${String(v).replace(/^\//, '')}`} alt="" style={{ maxHeight: 40 }} /> : <span>-</span>;
    case 'json-list': {
      let list: unknown = v;
      try {
        if (typeof v === 'string') list = JSON.parse(v);
      } catch {
        /* raw */
      }
      return <span>{Array.isArray(list) ? list.join(', ') : String(v ?? '-')}</span>;
    }
    default: {
      if (v === null || v === undefined || v === '') return <span>-</span>;
      const s = String(v);
      const limit = col.limit ?? 32;
      return <span style={col.style}>{s.length > limit ? `${s.slice(0, limit)}...` : s}</span>;
    }
  }
}
