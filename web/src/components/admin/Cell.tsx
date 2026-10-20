import type { ColumnDef } from '@/admin/types';

/** Backpack column types (text with ->limit(), check, boolean, date, image…). */
export function Cell({ col, row }: { col: ColumnDef; row: Record<string, unknown> }) {
  if (col.render) return <>{col.render(row)}</>;
  const v = row[col.name];
  switch (col.type) {
    case 'check':
      // Backpack `check` column: la-check-circle / la-circle
      return Number(v) ? (
        <i className="la la-check-circle text-lg" aria-label="Yes" />
      ) : (
        <i className="la la-circle text-lg" aria-label="No" />
      );
    case 'boolean':
      return <span>{Number(v) ? 'Yes' : 'No'}</span>;
    case 'image':
      return v ? <img src={`/${String(v).replace(/^\//, '')}`} alt="" className="max-h-10 rounded" /> : <span>-</span>;
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
      // Backpack text column: PHP empty() (null, '', '0') renders '-', inside the column wrapper style.
      if (v === null || v === undefined || v === '' || v === '0') return <span style={col.style}>-</span>;
      const s = String(v);
      const limit = col.limit ?? 32;
      // Str::limit($value, $limit, '…'): cut, trim trailing whitespace, append a single ellipsis character
      const chars = [...s];
      return <span style={col.style}>{chars.length > limit ? `${chars.slice(0, limit).join('').trimEnd()}…` : s}</span>;
    }
  }
}
