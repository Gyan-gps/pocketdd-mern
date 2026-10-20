// UI of App\Http\Controllers\Admin\SliderCrudController (List, Create, Update, Show, Reorder).
import type { EntityUi, FieldDef } from '../types';
import { dateCell, rupees } from './shared-columns';

const PAGE_LOCATIONS = [
  { value: 'business_page', label: 'Business' },
  { value: 'home', label: 'Home' },
  { value: 'event_page', label: 'Business Event' },
  { value: 'all-business', label: 'ALL Business' },
  { value: 'business-details', label: 'Business Details' },
  { value: 'sub-categories', label: 'Business SubCategories' },
];

const fields: FieldDef[] = [
  { name: 'client_name', label: 'Client Name', size: 6, attributes: { title: 'Please enter only alphabets and spaces' } },
  { name: 'slider_img', label: 'Slider img', type: 'upload', size: 6 },
  { name: 'from_date', label: 'From Date', type: 'date', size: 6 },
  { name: 'to_date', label: 'To Date', type: 'date', size: 6 },
  { name: 'amount', label: 'Slider Price ', size: 6, attributes: { title: 'Please enter only Numbers' } },
  { name: 'page_location', label: 'Location', type: 'select', size: 6, options: PAGE_LOCATIONS },
  { name: 'url', label: 'URL', size: 6 },
  { name: 'status', label: 'Slider Status', type: 'checkbox' },
];

const enumLabel = (v: unknown) => PAGE_LOCATIONS.find((o) => o.value === v)?.label ?? (v ? String(v) : '-');

const columns = [
  { name: 'client_name', label: 'Client name' },
  { name: 'slider_img', label: 'Slider img', type: 'image' as const },
  dateCell('from_date', 'From date'),
  dateCell('to_date', 'To date'),
  rupees('amount', 'Amount'),
  { name: 'page_location', label: 'Page Location', render: (row: Record<string, unknown>) => <span>{enumLabel(row.page_location)}</span> },
  { name: 'status', label: 'Status', type: 'check' as const },
];

export const slider: EntityUi = {
  route: 'slider',
  singular: 'slider',
  plural: 'sliders',
  operations: ['list', 'create', 'update', 'show'],
  columns,
  showColumns: columns,
  createFields: fields,
  filters: [
    { name: 'client_name', label: 'Client Name', type: 'select' },
    { name: 'from_date', label: 'Advertisement Date Range', type: 'date_range' },
  ],
  // Backpack ReorderOperation button: btn-outline-primary + la-arrows, after Add
  topButtons: () => [{ label: 'Reorder sliders', icon: 'la-arrows', variant: 'outline-primary', href: '/pocketddadmin/slider/reorder' }],
};
