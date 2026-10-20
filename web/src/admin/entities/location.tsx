// UI of App\Http\Controllers\Admin\LocationCrudController.
import type { EntityUi, FieldDef } from '../types';

const fields = (title?: string): FieldDef[] => [
  { name: 'location_name', label: 'Business Location', placeholder: 'Enter City Name', size: 6, attributes: title ? { title } : undefined },
  { name: 'status', label: 'Status', type: 'checkbox', size: 12 },
];

export const location: EntityUi = {
  route: 'location',
  singular: 'location',
  plural: 'locations',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'location_name', label: 'City Name' },
    { name: 'status', label: 'Active', type: 'check' },
  ],
  showColumns: [
    { name: 'location_name', label: 'Location name' },
    { name: 'status', label: 'Status', type: 'check' },
  ],
  createFields: fields(),
  updateFields: fields('Please enter only alphabets and spaces'),
  filters: [
    { name: 'id', label: 'Select City', type: 'select' },
    { name: 'status', label: 'Choose Status', type: 'select' },
  ],
  // the importPinCodeMaster button points at routes that are commented out (404 in Laravel too)
  topButtons: () => [{ label: '☁ Import Pincode Master', href: '/pocketddadmin/importPinCodeMaster' }],
  // store()/update(): redirect(backpack_url('business-user'))
  saveRedirect: () => 'business-user',
};
