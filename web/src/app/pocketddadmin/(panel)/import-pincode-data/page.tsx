import Link from 'next/link';
import { ImportSheetForm } from '@/components/admin/ImportSheetForm';

// PinCodeCrudController@importPinCodeData → view('import.import_pincode_data') ("Import Pin Codes")
export default function ImportPincodePage() {
  return (
    <>
      <div className="page-head">
        <h1>Import Pin Codes</h1>
      </div>
      <ImportSheetForm endpoint="insertPinCodeData" field="pin_code_master_sheet" label="Choose File" />
      {/* Laravel quirk: the Cancel button points at backpack_url('pin-code'), which has no route */}
      <Link className="btn" href="/pocketddadmin/pin-code">Cancel</Link>
    </>
  );
}
