'use client';

import { useState } from 'react';
import { saveSliderOrder } from '@/app/pocketddadmin/(panel)/phase9b-actions';

type Row = Record<string, unknown>;

/** Flat (depth 1) reorder: posts the nestedSortable `toArray()` shape Backpack sends (item_id/parent_id/depth/left/right). */
export function SliderReorder({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => (Number(a.lft ?? -1) || 0) - (Number(b.lft ?? -1) || 0));
  const [items, setItems] = useState(sorted);
  const [msg, setMsg] = useState('');
  const move = (i: number, d: number) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  async function save() {
    // nestedSortable toArray(): a root entry (item_id null, left 1) followed by the items.
    const tree = [{ item_id: null, parent_id: null, depth: 0, left: 1, right: items.length * 2 + 2 }];
    items.forEach((r, i) => tree.push({ item_id: String(r.id) as never, parent_id: null, depth: 1, left: i * 2 + 2, right: i * 2 + 3 }));
    setMsg(await saveSliderOrder(JSON.stringify(tree)));
  }
  return (
    <div className="card">
      {msg && <div className="alert alert-success">{msg}</div>}
      <ol>
        {items.map((r, i) => (
          <li key={String(r.id)} style={{ padding: 6 }}>
            #{String(r.id)} {String(r.client_name ?? '')}{' '}
            <button className="btn" type="button" onClick={() => move(i, -1)}>
              ↑
            </button>{' '}
            <button className="btn" type="button" onClick={() => move(i, 1)}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button className="btn btn-primary" type="button" onClick={save}>
        Save
      </button>
    </div>
  );
}
