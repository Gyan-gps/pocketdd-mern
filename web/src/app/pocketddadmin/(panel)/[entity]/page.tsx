import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import { ActionButtonLink } from '@/components/admin/ActionButtonLink';
import { Cell } from '@/components/admin/Cell';
import { DeleteButton } from '@/components/admin/DeleteButton';
import { FilterBar } from '@/components/admin/FilterBar';
import { ListSearch, PageLengthSelect } from '@/components/admin/ListControls';
import { PageHeader, crudBreadcrumbs } from '@/components/admin/PageHeader';
import { adminFetch } from '@/lib/api';

interface ListResponse {
  data: Array<Record<string, unknown>>;
  total: number;
  /** Rows in the whole table (before list clauses, filters and search). */
  totalAll?: number;
  page: number;
  length: number;
  filters?: Record<string, Array<{ value: string; label: string }>>;
}

type SearchParams = Promise<Record<string, string | undefined>>;

const PREFIX = '/pocketddadmin';

/** Backpack ListOperation (crud/list.blade.php + DataTables). */
export default async function ListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: SearchParams }) {
  const { entity } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('list')) notFound();

  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const k of ['search', 'page', 'length', 'sort', 'dir', ...(ui.filters ?? []).map((f) => f.name)]) if (sp[k]) query.set(k, sp[k]!);
  const list = await adminFetch<ListResponse>(`/${entity}?${query}`);

  const pages = Math.max(1, Math.ceil(list.total / list.length));
  const href = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v === undefined ? q.delete(k) : q.set(k, String(v)));
    return `?${q}`;
  };
  const from = list.total ? (list.page - 1) * list.length + 1 : 0;
  const to = Math.min(list.page * list.length, list.total);
  const filtered = query.toString() !== '';
  const topButtons = ui.topButtons?.(sp) ?? [];
  const actionsCount = ['show', 'update', 'delete'].filter((o) => ui.operations.includes(o as never)).length;
  const hasActions = actionsCount > 0 || !!ui.lineButtons;

  const headerCells = (sortable: boolean) => (
    <tr>
      {ui.columns.map((c) => (
        <th key={c.name}>
          {sortable ? (
            <Link href={href({ sort: c.name, dir: sp.sort === c.name && sp.dir !== 'desc' ? 'desc' : 'asc', page: undefined })}>
              {c.label ?? c.name}
              <SortIcon dir={sp.sort === c.name ? (sp.dir === 'desc' ? 'desc' : 'asc') : undefined} />
            </Link>
          ) : (
            (c.label ?? c.name)
          )}
        </th>
      ))}
      {hasActions && <th>Actions</th>}
    </tr>
  );

  return (
    <>
      <PageHeader
        title={ui.plural}
        breadcrumbs={crudBreadcrumbs(entity, ui.plural, 'List')}
        subheading={
          <>
            {list.total ? `Showing ${from} to ${to} of ${list.total} entries` : 'Showing 0 to 0 of 0 entries'}
            {list.totalAll !== undefined && list.totalAll !== list.total ? ` (filtered from ${list.totalAll} total entries)` : ''}.{' '}
            <Link href={`${PREFIX}/${entity}`}>Reset</Link>
          </>
        }
      />
      {sp.saved && (
        <div className="alert alert-success" role="status">
          {sp.saved}
        </div>
      )}

      <div className="toolbar">
        <div className="flex flex-wrap gap-2">
          {topButtons
            .filter((b) => b.position === 'first')
            .map((b) => (
              <ActionButtonLink key={b.href} button={b} fallback="primary" />
            ))}
          {ui.operations.includes('create') && (
            <Link className="btn btn-primary" href={`${PREFIX}/${entity}/create`}>
              <i className="la la-plus" aria-hidden /> Add {ui.singular}
            </Link>
          )}
          {topButtons
            .filter((b) => b.position !== 'first')
            .map((b) => (
              <ActionButtonLink key={b.href} button={b} fallback="primary" />
            ))}
        </div>
        <ListSearch initial={sp.search} />
      </div>

      {ui.filters && <FilterBar filters={ui.filters} options={list.filters ?? {}} />}

      {/* Backpack keeps wide tables inside the content area (horizontal scroll) */}
      <div className="overflow-x-auto">
      <table className="list">
        <thead>{headerCells(true)}</thead>
        <tbody>
          {list.data.length === 0 && (
            <tr>
              <td colSpan={ui.columns.length + 1} className="text-center">
                {filtered ? 'No matching records found' : 'No entries in this table.'}
              </td>
            </tr>
          )}
          {list.data.map((row) => (
            <tr key={String(row.id)}>
              {ui.columns.map((c) => (
                <td key={c.name}>
                  <Cell col={c} row={row} />
                </td>
              ))}
              {hasActions && (
                <td className="whitespace-nowrap">
                  {ui.operations.includes('show') && (
                    <Link className="btn-link" href={`${PREFIX}/${entity}/${row.id}/show`}>
                      <i className="la la-eye" aria-hidden /> Preview
                    </Link>
                  )}
                  {ui.operations.includes('update') && (
                    <Link className="btn-link" href={`${PREFIX}/${entity}/${row.id}/edit`}>
                      <i className="la la-edit" aria-hidden /> Edit
                    </Link>
                  )}
                  {ui.operations.includes('delete') && <DeleteButton entity={entity} id={String(row.id)} />}
                  {ui.lineButtons?.(row).map((b) => (
                    <ActionButtonLink key={b.href} button={b} fallback="link" />
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>{headerCells(false)}</tfoot>
      </table>
      </div>

      <div className="pager">
        <PageLengthSelect value={list.length} />
        <Pagination page={list.page} pages={pages} href={(p) => href({ page: p === 1 ? undefined : p })} />
      </div>
    </>
  );
}

/** DataTables sort arrows: both faint when unsorted, the active one darker. */
function SortIcon({ dir }: { dir?: 'asc' | 'desc' }) {
  return (
    <span className="flex flex-col text-[0.55rem] leading-[0.6rem] text-[#c5cbd6]" aria-hidden>
      <span className={dir === 'asc' ? 'text-ink' : undefined}>▲</span>
      <span className={dir === 'desc' ? 'text-ink' : undefined}>▼</span>
    </span>
  );
}

function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2);
  const item = 'flex min-w-9 items-center justify-center rounded px-2.5 py-1.5';
  return (
    <nav aria-label="Pagination">
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link className={`${item} text-muted hover:no-underline`} href={href(page - 1)} aria-label="Previous">
              <i className="la la-angle-left" aria-hidden />
            </Link>
          ) : (
            <span className={`${item} text-[#c5cbd6]`} aria-hidden>
              <i className="la la-angle-left" />
            </span>
          )}
        </li>
        {nums.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && p - nums[i - 1]! > 1 && <span className="px-1 text-muted">…</span>}
            {p === page ? (
              <span className={`${item} bg-primary text-white`} aria-current="page">
                {p}
              </span>
            ) : (
              <Link className={`${item} text-ink hover:bg-white hover:no-underline`} href={href(p)}>
                {p}
              </Link>
            )}
          </li>
        ))}
        <li>
          {page < pages ? (
            <Link className={`${item} text-muted hover:no-underline`} href={href(page + 1)} aria-label="Next">
              <i className="la la-angle-right" aria-hidden />
            </Link>
          ) : (
            <span className={`${item} text-[#c5cbd6]`} aria-hidden>
              <i className="la la-angle-right" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
