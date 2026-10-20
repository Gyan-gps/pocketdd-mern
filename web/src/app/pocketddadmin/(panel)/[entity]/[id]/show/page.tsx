import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import { BackLink } from '@/components/admin/BackLink';
import { Cell } from '@/components/admin/Cell';
import { PageHeader, crudBreadcrumbs } from '@/components/admin/PageHeader';
import { PrintButton } from '@/components/admin/PrintButton';
import { ApiError, adminFetch } from '@/lib/api';

/** Backpack ShowOperation (crud/show.blade.php): "Label:" / value rows, then the line buttons. */
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
      <PageHeader title={ui.plural} subheading={`Preview ${ui.singular}`} breadcrumbs={crudBreadcrumbs(entity, ui.plural, 'Preview')}>
        {ui.operations.includes('list') && <BackLink entity={entity} plural={ui.plural} />}
        <span className="ml-auto">
          <PrintButton />
        </span>
      </PageHeader>
      <table className="list mt-4">
        <tbody>
          {cols.map((c) => (
            <tr key={c.name}>
              <td className="w-1/2">{c.label ?? c.name}:</td>
              <td>
                <Cell col={c} row={row} />
              </td>
            </tr>
          ))}
          {ui.operations.includes('update') && (
            <tr>
              <td>Actions</td>
              <td>
                <Link className="btn-link" href={`/pocketddadmin/${entity}/${id}/edit`}>
                  <i className="la la-edit" aria-hidden /> Edit
                </Link>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
