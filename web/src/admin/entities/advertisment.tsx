// UI of App\Http\Controllers\Admin\AdvertismentCrudController (+ public/assets/js/ads-position-handler.js).
import type { EntityUi, FieldDef, Option } from '../types';
import { dateCell, rupees, statusClosure } from './phase9b-shared';

const opts = (...values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));

// ads-position-handler.js adOptions
const AD_LOCATIONS: Record<string, Option[]> = {
  home: opts('TOP', 'Bottom', 'Popup'),
  inner: opts('Same Category/Subcategory Page', 'Multiple Category/Subcategory Page', 'Event', 'Notification', 'Menu'),
};

/** calculateToDate(): new Date(from) + months/year → toISOString().split('T')[0] ('' when either is empty). */
function toDate(v: Record<string, string>): string {
  const from = v.from_date;
  const till = v.vaild_till;
  if (!from || !till) return '';
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return v.to_date ?? '';
  const months: Record<string, number> = { '1_month': 1, '2_months': 2, '3_months': 3, '6_months': 6 };
  if (till === '1_year') d.setFullYear(d.getFullYear() + 1);
  else if (months[till]) d.setMonth(d.getMonth() + months[till]!);
  return d.toISOString().split('T')[0]!;
}

const fields = (imgLabel: string): FieldDef[] => [
  { name: 'client_name', label: 'Business Name', type: 'select', size: 4 },
  { name: 'ads_position', label: 'Select Banner Type', type: 'select', size: 4, options: [{ value: 'home', label: 'Home' }, { value: 'inner', label: 'Inner' }] },
  { name: 'ads_location', label: 'Select Ad Location', type: 'select', size: 4, dependsOn: { field: 'ads_position', options: AD_LOCATIONS } },
  {
    name: 'sub_category_name',
    label: 'Select Subcategories',
    type: 'select_multiple',
    size: 4,
    visibleWhen: (v) => v.ads_location === 'Multiple Category/Subcategory Page',
  },
  { name: 'from_date', label: 'From Date', type: 'date', size: 4 },
  {
    name: 'vaild_till',
    label: 'Valid Till',
    type: 'select',
    size: 4,
    options: [
      { value: '1_month', label: '1 Month' },
      { value: '2_months', label: '2 Months' },
      { value: '3_months', label: '3 Months' },
      { value: '6_months', label: '6 Months' },
      { value: '1_year', label: '1 Year' },
    ],
  },
  { name: 'to_date', label: 'To Date', type: 'date', size: 4, attributes: { readOnly: 'readonly' }, compute: { from: ['from_date', 'vaild_till'], fn: toDate } },
  { name: 'advt_img', label: imgLabel, type: 'upload', size: 4 },
  { name: 'fees_type', label: 'Business Fess Type', type: 'select', size: 4, options: opts('Cheque', 'Cash', 'Online via UPI', 'NEFT', 'Free') },
  {
    name: 'amount',
    label: 'Advertisement Price',
    size: 4,
    attributes: { title: 'Please enter only Numbers (decimals allowed)' },
    visibleWhen: (v) => v.fees_type !== 'Free', // toggleAmount(): hidden + cleared for Free
  },
  { name: 'status', label: 'Status', type: 'checkbox' },
  { name: 'ads_location_hidden', type: 'hidden' },
];

const businessColumn = {
  name: 'client_name',
  label: 'Business Name',
  render: (row: Record<string, unknown>) => (
    <a href={`/pocketddadmin/business?business_name_en=${encodeURIComponent(String(row.business_name_en ?? ''))}`}>
      {row.business_name_en ? String(row.business_name_en) : '-'}
    </a>
  ),
};

export const advertisment: EntityUi = {
  route: 'advertisment',
  singular: 'advertisement',
  plural: 'advertisements',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    businessColumn,
    { name: 'advt_img', label: 'Advt img', type: 'image' },
    dateCell('from_date', 'From date'),
    dateCell('to_date', 'To date'),
    { name: 'fees_type', label: 'Fees type' },
    rupees('amount', 'Amount'),
    { name: 'ads_position', label: 'Ads Position' },
    { name: 'ads_location', label: 'Ads Location' },
    statusClosure,
  ],
  showColumns: [
    { name: 'client_name', label: 'Business Name', render: (row) => <span>{String(row.business_name_en ?? '')}</span> },
    { name: 'advt_img', label: 'Advt img', type: 'image' },
    dateCell('from_date', 'From date'),
    dateCell('to_date', 'To date'),
    { name: 'fees_type', label: 'Fees type' },
    rupees('amount', 'Amount'),
    { name: 'status', label: 'Status', type: 'check' },
  ],
  createFields: fields('Advertisement Image'),
  updateFields: fields('Advt img'),
  formOptions: true,
  createDefaultsFromQuery: ['client_name'],
  filters: [
    { name: 'client_name', label: 'Client Name', type: 'select' },
    { name: 'from_date', label: 'Advertisement Date Range', type: 'date_range' },
    { name: 'sorting', label: 'Sort By', type: 'select' },
  ],
};
