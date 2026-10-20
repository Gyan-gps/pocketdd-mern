import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import { Cell } from '@/components/admin/Cell';
import { ApiError, adminFetch } from '@/lib/api';

export default async function ShowPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('show')) notFound();
  const row = await adminFetch<Record<string, unknown>>(`/${entity}/${id}`).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const cols = ui.showColumns ?? ui.columns;
  return (
    <>
      <div className="page-head">
        <h1>{ui.plural}</h1>
        <small>Preview {ui.singular}.</small>
      </div>
      <div className="card">
        <table className="list">
          <tbody>
            {cols.map((c) => (
              <tr key={c.name}>
                <th style={{ width: 240 }}>{c.label ?? c.name}</th>
                <td>
                  <Cell col={c} row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-actions">
          {ui.operations.includes('update') && (
            <Link className="btn btn-primary" href={`/pocketddadmin/${entity}/${id}/edit`}>
              Edit
            </Link>
          )}
          <Link className="btn" href={`/pocketddadmin/${entity}`}>
            Back to all {ui.plural.toLowerCase()}
          </Link>
        </div>
      </div>
    </>
  );
}
