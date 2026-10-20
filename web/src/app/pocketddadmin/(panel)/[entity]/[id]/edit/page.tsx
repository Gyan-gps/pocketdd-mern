import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import type { Option } from '@/admin/types';
import { CrudForm } from '@/components/admin/CrudForm';
import { ApiError, adminFetch } from '@/lib/api';

export default async function EditPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('update')) notFound();
  const row = await adminFetch<Record<string, unknown>>(`/${entity}/${id}`).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const formOptions = ui.formOptions
    ? await adminFetch<Record<string, Option[]>>(`/${entity}/form-options?id=${encodeURIComponent(id)}`)
    : undefined;
  return (
    <>
      <div className="page-head">
        <h1>{ui.plural}</h1>
        <small>Edit {ui.singular}.</small>
      </div>
      <CrudForm entity={entity} id={id} initial={row} submitLabel="Save and back" formOptions={formOptions} />
    </>
  );
}
