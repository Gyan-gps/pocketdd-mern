import { ImportSheetForm } from '@/components/admin/ImportSheetForm';

// BusinessCategoryCrudController@importCategoryData → view('import.import_category')
export default function ImportCategoryPage() {
  return (
    <>
      <div className="page-head">
        <h1>Import Category Data</h1>
      </div>
      <ImportSheetForm endpoint="insertCategoryData" field="category_data_sheet" label="Category Data Sheet (.xlsx)" />
    </>
  );
}
