import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import type { Option } from '@/admin/types';
import { BackLink } from '@/components/admin/BackLink';
import { CrudForm } from '@/components/admin/CrudForm';
import { PageHeader, crudBreadcrumbs } from '@/components/admin/PageHeader';
import { adminFetch, getEntityMeta } from '@/lib/api';

/** Backpack CreateOperation (crud/create.blade.php). */
export default async function CreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entity } = await params;
  const ui = getEntity(entity);
  if (!ui || !ui.operations.includes('create')) notFound();
  const sp = await searchParams;

  // field 'default' => request()->get(...) and server-computed options (e.g. ?parent_id / ?client_name)
  const initial: Record<string, unknown> = {};
  for (const k of ui.createDefaultsFromQuery ?? []) if (sp[k]) initial[k] = sp[k];
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const [formOptions, meta] = await Promise.all([
    ui.formOptions ? adminFetch<Record<string, Option[]>>(`/${entity}/form-options?${query}`) : undefined,
    getEntityMeta(entity),
  ]);

  return (
    <>
      <PageHeader title={ui.plural} subheading={`Add ${ui.singular}.`} breadcrumbs={crudBreadcrumbs(entity, ui.plural, 'Add')}>
        {ui.operations.includes('list') && <BackLink entity={entity} plural={ui.plural} />}
      </PageHeader>
      <CrudForm
        entity={entity}
        id={null}
        initial={initial}
        submitLabel="Save and back"
        formOptions={formOptions}
        required={meta?.required.create}
      />
    </>
  );
}
