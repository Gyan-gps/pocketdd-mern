import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import type { Option } from '@/admin/types';
import { BackLink } from '@/components/admin/BackLink';
import { CrudForm } from '@/components/admin/CrudForm';
import { PageHeader, crudBreadcrumbs } from '@/components/admin/PageHeader';
import { ApiError, adminFetch, getEntityMeta } from '@/lib/api';

/** Backpack UpdateOperation (crud/edit.blade.php). */
export default async function EditPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('update')) notFound();
  const row = await adminFetch<Record<string, unknown>>(`/${entity}/${id}`).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const [formOptions, meta] = await Promise.all([
    ui.formOptions ? adminFetch<Record<string, Option[]>>(`/${entity}/form-options?id=${encodeURIComponent(id)}`) : undefined,
    getEntityMeta(entity),
  ]);

  return (
    <>
      <PageHeader title={ui.plural} subheading={`Edit ${ui.singular}.`} breadcrumbs={crudBreadcrumbs(entity, ui.plural, 'Edit')}>
        {ui.operations.includes('list') && <BackLink entity={entity} plural={ui.plural} />}
      </PageHeader>
      <CrudForm
        entity={entity}
        id={id}
        initial={row}
        submitLabel="Save and back"
        formOptions={formOptions}
        required={meta?.required.update}
      />
    </>
  );
}
