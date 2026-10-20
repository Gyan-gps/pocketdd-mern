import { SliderReorder } from '@/components/admin/SliderReorder';
import { adminFetch } from '@/lib/api';

// SliderCrudController ReorderOperation (reorder.label 'name' — sliders have no name column, so labels are empty
// in Backpack; client_name is shown here as a hint next to the id).
export default async function SliderReorderPage() {
  const rows = await adminFetch<Array<Record<string, unknown>>>('/slider/reorder');
  return (
    <>
      <div className="page-head">
        <h1>Reorder sliders</h1>
      </div>
      <SliderReorder rows={rows} />
    </>
  );
}
