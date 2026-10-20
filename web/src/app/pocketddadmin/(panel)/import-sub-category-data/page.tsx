import { ImportSheetForm } from '@/components/admin/ImportSheetForm';

// BusinessSubCategoryCrudController@importSubCategoryData → view('import.import_sub_category')
export default function ImportSubCategoryPage() {
  return (
    <>
      <div className="page-head">
        <h1>Import Sub-Category Data</h1>
      </div>
      <ImportSheetForm endpoint="insertSubCategoryData" field="sub_category_data_sheet" label="Sub-Category Data Sheet (.xlsx)" />
    </>
  );
}
