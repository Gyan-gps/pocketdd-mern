// UI of BusinessUserCrudController ("Staff Management"), BusinessUserLocationCrudController, EventCrudController,
// EventDetailCrudController, EventLocationCrudController.
import { chainField, eventChain, staffChain, timeField } from '../fields/chain-fields';
import type { EntityUi, FieldDef } from '../types';

const hindi = { fontFamily: '"k010", sans-serif', fontSize: 23 };
const titleCase = 'titleCaseEnglish' as const;
const lettersOnly = (v: string) => v.replace(/[^a-zA-Z\s]/g, '').replace(/\b\w/g, (t) => t.toUpperCase());
const digits = (n?: number) => (v: string) => (n ? v.replace(/[^0-9]/g, '').slice(0, n) : v.replace(/[^0-9]/g, ''));
const translate = (from: string) => ({
  from,
  endpoint: (v: string) => `/api/translate-to-hindi/${encodeURIComponent(v)}`,
  pick: (json: any) => json?.data?.translated_text,
});
const statusSort = [
  { name: 'sorting', label: 'Sort By', type: 'select' as const },
];

// ---------------------------------------------------------------- Staff
const staffCommon = (update: boolean): FieldDef[] => [
  { name: 'name', label: 'Name', size: 3, inputFilter: lettersOnly },
  { name: 'phone', label: 'Phone', size: 3, inputFilter: digits(10), attributes: { pattern: '[0-9]{10}', maxLength: '10', title: 'Please enter exactly 10 digits' } },
  { name: 'email', label: 'Email', type: 'email', size: 3 },
  {
    name: 'designation',
    label: 'Designation',
    type: 'select',
    size: 3,
    options: [
      { value: 'mediator', label: 'Mediator' },
      { value: 'staff', label: 'Staff' },
      { value: 'manager', label: 'Manager' },
      { value: 'field_man', label: 'Field Man' },
      { value: 'data_entry_operator', label: 'Data Entry Operator' },
    ],
  },
  ...(update
    ? ([
        { name: 'state', label: 'State', size: 3, attributes: { readOnly: 'readonly' } },
        { name: 'district', label: 'District', size: 3, attributes: { readOnly: 'readonly' } },
        // relationship field rendered disabled → never submitted
        { name: 'pincode_pin_code', label: 'Pincode', size: 3, attributes: { disabled: 'disabled' } },
        { name: 'tahsil', label: 'PinCode Area', size: 3, attributes: { readOnly: 'readonly' } },
      ] as FieldDef[])
    : [
        chainField({ name: 'state', label: 'State', size: 3 }),
        chainField({ name: 'district', label: 'District', size: 3 }, staffChain.district),
        chainField({ name: 'pincode_id', label: 'PinCode', size: 3 }, staffChain.pincode_id),
        chainField({ name: 'tahsil', label: 'PinCode Area', size: 3 }, staffChain.tahsil),
      ]),
  { name: 'address_line_1', label: update ? 'Enter Address Line1' : 'Enter Address Line', size: 3, transform: titleCase },
  { name: 'street_address', label: 'Enter Street Address', size: 3, transform: titleCase },
  { name: 'profile_img', label: 'Profile img', type: 'upload', size: 3 },
  { name: 'aadhar_no', label: 'Aadhaar Number', size: 3, inputFilter: digits(), attributes: { pattern: '[0-9]{12}', maxLength: '12', minLength: '12', title: 'Aadhaar number must be exactly 12 digits' } },
  { name: 'description', label: 'About Yourself', type: 'textarea', size: 6, transform: titleCase },
  { name: 'description_hi', label: 'अपने बारे में', type: 'textarea', size: 6, placeholder: 'केवल हिंदी अक्षर', autofill: translate('description'), attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' } },
  { name: 'status', label: 'User status', type: 'checkbox' },
];

const tick = (row: Record<string, unknown>) => (
  <span style={{ fontSize: 20, color: Number(row.status) === 1 ? 'green' : 'red' }}>{Number(row.status) === 1 ? '✅' : '❌'}</span>
);

export const businessUser: EntityUi = {
  route: 'business-user',
  singular: 'staff',
  plural: 'staff',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [
    { name: 'name', label: 'Name' },
    { name: 'phone', label: 'Phone' },
    { name: 'district', label: 'District' },
    { name: 'state', label: 'State' },
    { name: 'email', label: 'Email', render: (r) => (r.email ? <a href={`mailto:${r.email}`}>{String(r.email)}</a> : '-') },
    { name: 'profile_img', label: 'Profile img', type: 'image' },
    { name: 'status', label: 'Status', render: tick },
  ],
  showColumns: [
    { name: 'profile_img', label: 'Profile Image', type: 'image' },
    { name: 'name', label: 'Name' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email' },
    { name: 'state', label: 'State' },
    { name: 'district', label: 'District' },
    { name: 'address_line_1', label: 'Address line 1', limit: 500 },
    { name: 'street_address', label: 'Street address', limit: 500 },
    { name: 'post', label: 'Post' },
    { name: 'tahsil', label: 'PinCode Area' },
    { name: 'pincode_pin_code', label: 'Pincode' },
    { name: 'user_description', label: 'User description' },
    { name: 'status', label: 'Status', type: 'boolean' },
  ],
  createFields: staffCommon(false),
  updateFields: staffCommon(true),
  filters: [
    { name: 'name', label: 'Business User Name', type: 'select' },
    { name: 'state', label: 'Choose State', type: 'select' },
    { name: 'district', label: 'District Name', type: 'select' },
    { name: 'status', label: 'Choose Status', type: 'select' },
    ...statusSort,
  ],
};

// ---------------------------------------------------------------- Events
const eventFields: FieldDef[] = [
  { name: 'name', label: 'Event Name', size: 3, transform: titleCase, attributes: { autoComplete: 'off', title: 'Please enter only alphabets and spaces' } },
  { name: 'name_hi', label: 'घटना नाम', size: 3, autofill: translate('name'), attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' } },
  { name: 'date', label: 'Event Date', type: 'date', size: 3 },
  timeField({ name: 'event_time', label: 'Event Time', size: 3 }),
  chainField({ name: 'state', label: 'State', size: 3 }),
  chainField({ name: 'district', label: 'District', size: 3 }, eventChain.district),
  chainField({ name: 'pincode_id', label: 'PinCode', size: 3 }, eventChain.pincode_id),
  chainField({ name: 'tahsil', label: 'Pin Code Area', size: 3 }, eventChain.tahsil),
  { name: 'charge', label: 'Event Charge', size: 6, inputFilter: digits(), attributes: { title: 'Please enter only Numbers' } },
  { name: 'image', label: 'Image', type: 'upload', size: 6 },
  { name: 'short_description', label: 'Event Description (In English)', type: 'textarea', size: 6, transform: titleCase },
  { name: 'event_description_hi', label: 'घटना विवरण हिंदी में', type: 'textarea', size: 6, autofill: translate('short_description'), attributes: { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' } },
  { name: 'status', label: 'Event Status', type: 'checkbox' },
];

export const event: EntityUi = {
  route: 'event',
  singular: 'event',
  plural: 'events',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [
    { name: 'district', label: 'District' },
    { name: 'state', label: 'State' },
    { name: 'name', label: 'Business Event' },
    { name: 'date', label: 'Date' },
    { name: 'event_time', label: 'Event time', render: (r) => (r.event_time ? String(r.event_time).slice(0, 5) : '-') },
    { name: 'image', label: 'Image', type: 'image' },
    { name: 'charge', label: 'Charge', render: (r) => (r.charge === null || r.charge === undefined ? '-' : `₹${r.charge}`) },
    { name: 'status', label: 'Status', render: tick },
  ],
  showColumns: [
    { name: 'image', label: 'Event Image', type: 'image' },
    { name: 'show_name', label: 'Name' },
    { name: 'show_date', label: 'Date' },
    { name: 'event_time', label: 'Event time' },
    { name: 'state', label: 'State' },
    { name: 'district', label: 'District' },
    // Laravel quirk: PinCode::find(null)->pin_code makes the whole show page fail.
    { name: 'pincode_pin_code', label: 'PinCode', render: (r) => (r.show_error ? `Error: ${r.show_error}` : String(r.pincode_pin_code)) },
    { name: 'tahsil', label: 'Tahsil' },
    { name: 'charge', label: 'Charge', render: (r) => (r.charge === null || r.charge === undefined ? '-' : `₹${r.charge}`) },
    { name: 'short_description', label: 'Short Description', limit: 1000 },
    { name: 'event_description_hi', label: 'Event Description (Hindi)', limit: 1000, style: hindi },
    { name: 'status', label: 'Status', type: 'boolean' },
  ],
  createFields: eventFields,
  filters: [
    { name: 'name', label: 'Select Event', type: 'select' },
    { name: 'date', label: 'Event Date Range', type: 'date_range' },
    { name: 'state', label: 'Choose State Name', type: 'select' },
    { name: 'district', label: 'District Name', type: 'select' },
    ...statusSort,
  ],
};

// ---------------------------------------------------------------- relations
const rel = (name: string, label: string): FieldDef => ({ name, label, type: 'select', size: 6 });

export const businessUserLocation: EntityUi = {
  route: 'business-user-location',
  singular: 'business user location',
  plural: 'business user locations',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [
    { name: 'business_user_id', label: 'Business User', render: (r) => String(r.business_user_name ?? '-') },
    { name: 'location_id', label: 'Business User Location', render: (r) => String(r.location_label ?? '-') },
  ],
  createFields: [rel('business_user_id', 'Business User'), rel('location_id', 'Business User Location')],
  // Laravel quirk: store() redirects to the Staff list.
  saveRedirect: () => '/pocketddadmin/business-user',
};

export const eventLocation: EntityUi = {
  route: 'event-location',
  singular: 'event location',
  plural: 'event locations',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [
    { name: 'event_id', label: 'Event Name', render: (r) => String(r.event_name ?? '-') },
    { name: 'location_id', label: 'Event Location', render: (r) => String(r.location_label ?? '-') },
  ],
  createFields: [rel('event_id', 'Event Name'), rel('location_id', 'Event Location')],
};

export const eventDetail: EntityUi = {
  route: 'event-detail',
  singular: 'event detail',
  plural: 'event details',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [{ name: 'event_id', label: 'Event Title', render: (r) => String(r.event_name ?? '-') }],
  // default Backpack show (setFromDb): event_details + timestamps
  showColumns: [
    { name: 'event_details', label: 'Event details', limit: 100000 },
    { name: 'created_at', label: 'Created', type: 'datetime' },
    { name: 'updated_at', label: 'Updated', type: 'datetime' },
  ],
  createFields: [
    { ...rel('event_id', 'Event Name') },
    // ckeditor → textarea (HTML stored as-is)
    { name: 'event_details', label: 'Event details', type: 'textarea', size: 12 },
  ],
};
