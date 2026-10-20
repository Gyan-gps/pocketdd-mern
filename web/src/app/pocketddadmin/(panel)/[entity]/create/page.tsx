import { notFound } from 'next/navigation';
import { getEntity } from '@/admin/registry';
import type { Option } from '@/admin/types';
import { CrudForm } from '@/components/admin/CrudForm';
import { adminFetch } from '@/lib/api';

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
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const formOptions = ui.formOptions ? await adminFetch<Record<string, Option[]>>(`/${entity}/form-options?${qs}`) : undefined;
  return (
    <>
      <div className="page-head">
        <h1>{ui.plural}</h1>
        <small>Add {ui.singular}.</small>
      </div>
      <CrudForm entity={entity} id={null} initial={initial} submitLabel="Save and back" formOptions={formOptions} />
    </>
  );
}
