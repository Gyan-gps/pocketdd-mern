import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import { Cell } from '@/components/admin/Cell';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { adminFetch } from '@/lib/api';

interface ListResponse {
  data: Array<Record<string, unknown>>;
  total: number;
  page: number;
  length: number;
  filters?: Record<string, Array<{ value: string; label: string }>>;
}

type SP = Promise<Record<string, string | undefined>>;

export default async function ListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: SP }) {
  const { entity } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('list')) notFound();

  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ['search', 'page', 'length', 'sort', 'dir', ...(ui.filters ?? []).map((f) => f.name)]) if (sp[k]) qs.set(k, sp[k]!);
  const list = await adminFetch<ListResponse>(`/${entity}?${qs}`);
  const pages = Math.max(1, Math.ceil(list.total / list.length));
  const link = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(patch)) (v === undefined ? q.delete(k) : q.set(k, String(v)));
    return `?${q}`;
  };
  const from = list.total ? (list.page - 1) * list.length + 1 : 0;
  const to = Math.min(list.page * list.length, list.total);

  return (
    <>
      <div className="page-head">
        <h1>{ui.plural}</h1>
        <small>Listing {ui.plural.toLowerCase()}.</small>
      </div>
      {sp.saved && <div className="alert alert-success">{sp.saved}</div>}
      <div className="card">
        <div className="toolbar">
          <div>
            {ui.operations.includes('create') && (
              <Link className="btn btn-primary" href={`/pocketddadmin/${entity}/create`}>
                + Add {ui.singular}
              </Link>
            )}{' '}
            {ui.topButtons?.(sp).map((b) => (
              <Link key={b.href} className="btn" href={b.href}>
                {b.label}
              </Link>
            ))}
          </div>
          {ui.filters && (
            <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {ui.filters.map((f) =>
                f.type === 'date_range' ? (
                  <input key={f.name} name={f.name} defaultValue={sp[f.name]} placeholder={`${f.label} {"from":…,"to":…}`} style={{ padding: 7 }} />
                ) : (
                  <select key={f.name} name={f.name} defaultValue={sp[f.name] ?? ''} style={{ padding: 7 }} aria-label={f.label}>
                    <option value="">{f.label}</option>
                    {(list.filters?.[f.name] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ),
              )}
              {sp.search && <input type="hidden" name="search" value={sp.search} />}
              <button className="btn" type="submit">
                Filter
              </button>
              <Link className="btn-link" href="?">
                Remove filters
              </Link>
            </form>
          )}
          <form>
            <input name="search" defaultValue={sp.search} placeholder="Search..." style={{ padding: 7 }} />
          </form>
        </div>
        <table className="list">
          <thead>
            <tr>
              {ui.columns.map((c) => (
                <th key={c.name}>
                  <Link href={link({ sort: c.name, dir: sp.sort === c.name && sp.dir !== 'desc' ? 'desc' : 'asc', page: undefined })}>
                    {c.label ?? c.name}
                    {sp.sort === c.name ? (sp.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </Link>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.data.length === 0 && (
              <tr>
                <td colSpan={ui.columns.length + 1}>No entries in this table.</td>
              </tr>
            )}
            {list.data.map((row) => (
              <tr key={String(row.id)}>
                {ui.columns.map((c) => (
                  <td key={c.name}>
                    <Cell col={c} row={row} />
                  </td>
                ))}
                <td style={{ whiteSpace: 'nowrap' }}>
                  {ui.operations.includes('show') && (
                    <Link className="btn-link" href={`/pocketddadmin/${entity}/${row.id}/show`}>
                      Preview
                    </Link>
                  )}
                  {ui.operations.includes('update') && (
                    <Link className="btn-link" href={`/pocketddadmin/${entity}/${row.id}/edit`}>
                      Edit
                    </Link>
                  )}
                  {ui.operations.includes('delete') && <DeleteButton entity={entity} id={String(row.id)} />}
                  {ui.lineButtons?.(row).map((b) => (
                    <Link key={b.href} className="btn-link" href={b.href}>
                      {b.label}
                    </Link>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <span>
            Showing {from} to {to} of {list.total} entries
          </span>
          <span>
            {list.page > 1 && (
              <Link className="btn" href={link({ page: list.page - 1 })}>
                ‹ Previous
              </Link>
            )}{' '}
            Page {list.page} / {pages}{' '}
            {list.page < pages && (
              <Link className="btn" href={link({ page: list.page + 1 })}>
                Next ›
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
