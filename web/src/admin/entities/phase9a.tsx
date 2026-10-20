// UI of the phase 9A Business* CrudControllers (business, business-detail, business-image, business-location,
// business-owner, business-request-managment).
import { CascadeSelect, type CascadeCfg } from '@/components/admin/Phase9aFields';
import { Repeatable, type RepeatableCfg } from '@/components/admin/Phase9dFields';
import type { ColumnDef, EntityUi, FieldDef } from '../types';

const enc = encodeURIComponent;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const hi: React.CSSProperties = { fontFamily: 'k010', fontSize: 23 };
const cascade = (cfg: CascadeCfg): FieldDef['custom'] => (p) => <CascadeSelect p={p} cfg={cfg} />;
const repeatable = (cfg: RepeatableCfg): FieldDef['custom'] => (p) => <Repeatable p={p} cfg={cfg} />;
const translate = (from: string): FieldDef['autofill'] => ({
  from,
  endpoint: (v) => `/api/translate-to-hindi/${enc(v)}`,
  pick: (j) => j?.data?.translated_text,
});
const showLink = (row: Record<string, unknown>, text: React.ReactNode) => <a href={`/pocketddadmin/business/${s(row.id)}/show`}>{text}</a>;

// ------------------------------------------------------------------ business
const phoneFilter = (v: string) => v.replace(/[^0-9-\s]/g, '').slice(0, 15);
const titleFilter = (v: string) => v.replace(/[^a-zA-Z0-9\s&#%*@/\-().,]/g, '').replace(/\b\w/g, (t) => t.toUpperCase());
const PERIODS: Record<string, [number, number]> = {
  '3_months': [0, 3], '6_months': [0, 6], '1_year': [1, 0], '2_years': [2, 0], '3_years': [3, 0], '4_years': [4, 0], '5_years': [5, 0],
  '6_years': [6, 0], '7_years': [7, 0], '8_years': [8, 0], '9_years': [9, 0], '10_years': [10, 0],
};
/** getBusinessCity.js calculateExpiryDate() (JS Date month/year arithmetic). */
function expiry(v: Record<string, string>): string {
  const from = v.from_date;
  const p = PERIODS[v.valid_till ?? ''];
  if (!from || !p) return v.exp_date ?? '';
  const t = new Date();
  const d = new Date(from.length === 4 ? `${from}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` : from);
  if (Number.isNaN(d.getTime())) return v.exp_date ?? '';
  d.setMonth(d.getMonth() + p[1]);
  d.setFullYear(d.getFullYear() + p[0]);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const fees = (v: Record<string, string>) => v.business_payment_mode === 'Fees';

function businessFields(edit: boolean): FieldDef[] {
  const phone = (name: string, label: string): FieldDef => ({
    name, label, size: 3, inputFilter: phoneFilter,
    attributes: { pattern: '^[0-9\\-\\s]{8,15}$', maxLength: '15', autoComplete: 'off', title: 'Please enter valid mobile or landline number' },
  });
  const ro = (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, size: 6, attributes: { readOnly: 'readonly' }, ...extra });
  const upload = (name: string, label: string, size: number): FieldDef => ({ name, label, type: 'upload', size });
  return [
    { name: 'mediator', label: 'The Mediator', type: 'select', size: 3 },
    phone('owner_number_1', 'Owner Number'),
    phone('business_contact_1', 'Business Contact 1'),
    phone('business_contact_2', 'Business Contact 2'),
    phone('business_contact_3', 'Business Contact 3'),
    phone('business_contact_4', 'Business Contact 4'),
    edit
      ? { name: 'pan', label: 'PAN', size: 3, inputFilter: (v) => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(), attributes: { pattern: '[A-Z]{5}[0-9]{4}[A-Z]{1}', maxLength: '10' } }
      : { name: 'pan', label: 'PAN', size: 3, attributes: { autoComplete: 'off' } },
    edit
      ? { name: 'aadhaar', label: 'AADHAR', size: 3, inputFilter: (v) => v.replace(/[^0-9]/g, ''), attributes: { pattern: '[0-9]{12}', maxLength: '12', minLength: '12' } }
      : { name: 'aadhaar', label: 'AADHAR', size: 3, attributes: { pattern: '[0-9]{12}', maxLength: '12', autoComplete: 'off' } },
    { name: 'gst', label: 'GST', size: 3, attributes: edit ? { pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', maxLength: '15' } : { autoComplete: 'off' } },
    { name: 'from_date', label: 'Start Date', type: 'date', size: 3 },
    { name: 'valid_till', label: 'Time Period', type: 'select', size: 3, options: Object.keys(PERIODS).map((k) => ({ value: k, label: k.replace('_', ' ').replace(/^\d+ \w/, (m) => m.replace(/ (\w)/, (_x, c) => ` ${c.toUpperCase()}`)) })) },
    { name: 'exp_date', label: 'EXP DATE', type: 'date', size: 3, attributes: { readOnly: 'readonly' }, compute: { from: ['from_date', 'valid_till'], fn: expiry } },
    { name: 'business_email', label: 'Business Email ID', type: 'email', size: 3 },
    { name: 'owner_email', label: 'Owner Email ID', type: 'email', size: 3 },
    { name: 'business_payment_mode', label: 'Payment Mode', type: 'select', size: 3, options: ['Fees', 'Advertisement', 'Free'].map((v) => ({ value: v, label: v })) },
    { name: 'fees_type', label: 'Business Fess Type', type: 'select', size: 6, visibleWhen: fees, options: ['Cheque', 'Cash', 'Online via UPI', 'NEFT'].map((v) => ({ value: v, label: v })) },
    { name: 'business_fess', label: 'Fees Amount', type: 'number', size: 6, visibleWhen: fees },
    { name: 'owner_name_en', label: 'Business Owner Name', size: 6, inputFilter: titleFilter },
    { name: 'owner_name_hi', label: 'व्यवसाय के मालिक का नाम', size: 6, autofill: translate('owner_name_en') },
    { name: 'business_name_en', label: 'Business Name', size: 6, inputFilter: titleFilter },
    { name: 'business_name_hi', label: 'व्यवसाय का नाम', size: 6, autofill: translate('business_name_en') },
    { name: 'address_line_1_en', label: 'Address line 1', size: 6, transform: 'titleCaseEnglish' },
    { name: 'address_line_1_hi', label: 'पता लाइन 1', size: 6, autofill: translate('address_line_1_en') },
    { name: 'state_en', label: 'State', type: 'select', size: 6 },
    ro('state_hi', 'राज्य', { autofill: { from: 'state_en', endpoint: (v) => `/api/get-hindi-state/${enc(v)}`, pick: (j) => j?.data?.state_hi } }),
    {
      name: 'dist_en', label: 'Dist', type: 'custom', size: 6,
      custom: cascade({ deps: ['state_en'], url: (v) => (v.state_en ? `business-state-cities/${enc(v.state_en)}` : null), pick: (j) => (j?.data ?? []).map((c: any) => ({ value: c.city, label: c.city })), first: { value: '', label: 'Select Any' } }),
    },
    ro('dist_hi', 'जिला'),
    {
      name: 'pincode_id', label: 'Pincode', type: 'custom', size: 6,
      custom: cascade({
        deps: ['state_en', 'dist_en'], first: { value: '', label: 'Select Any' }, mirrorLabelTo: 'pincode_hi',
        url: (v) => (v.state_en && v.dist_en ? `business-state-city-pincode/${enc(v.state_en)}/${enc(v.dist_en)}` : null),
        pick: (j) => (j?.data ?? []).map((p: any) => ({ value: String(p.id), label: String(p.pin_code) })),
      }),
    },
    ro('pincode_hi', 'पिनकोड'),
    {
      name: 'tehsil_en', label: 'Pin Code area', type: 'custom', size: 6,
      custom: cascade({
        deps: ['state_en', 'dist_en', 'pincode_id'],
        url: (v) => (v.state_en && v.dist_en && v.pincode_id ? `get-tehsil-area/${enc(v.state_en)}/${enc(v.dist_en)}/${enc(v.pincode_id)}` : null),
        pick: (j) => (j?.tehsil ? [{ value: j.tehsil, label: j.tehsil }] : []),
      }),
    },
    ro('tehsil_hi', 'पिन कोड क्षेत्र'),
    {
      name: 'area_en', label: 'Local Area', type: 'custom', size: 6,
      custom: cascade({
        deps: ['state_en', 'dist_en', 'pincode_id'], first: { value: '', label: '' },
        url: (v) => (v.state_en && v.dist_en && v.pincode_id ? `get-tehsil-area/${enc(v.state_en)}/${enc(v.dist_en)}/${enc(v.pincode_id)}` : null),
        pick: (j) => (Array.isArray(j?.area) ? j.area.map((a: any) => ({ value: s(a.area_name), label: s(a.area_name) })) : []),
      }),
    },
    ro('area_hi', 'स्थानीय क्षेत्र'),
    { name: 'business_category_id', label: 'Category', type: 'select', size: 6 },
    ro('category_hi', 'श्रेणी', { autofill: { from: 'business_category_id', endpoint: (v) => `/api/get-category-hindi/${enc(v)}`, pick: (j) => j?.data ?? '' } }),
    {
      name: 'business_sub_category_id', label: 'Sub Category', type: 'custom', size: 6,
      custom: cascade({
        deps: ['business_category_id'], first: { value: '', label: 'Select Business Sub-Category' },
        url: (v) => (v.business_category_id ? `get-business-sub-categories/${enc(v.business_category_id)}` : null),
        pick: (j) => (j?.data ?? []).map((c: any) => ({ value: String(c.id), label: s(c.name) })),
      }),
    },
    ro('sub_category_hi', 'उप श्रेणी'),
    { name: 'about_en', label: 'About', type: 'textarea', size: 6, inputFilter: (v) => v.replace(/\b\w/g, (t) => t.toUpperCase()) },
    { name: 'about_hi', label: 'परिचय', type: 'textarea', size: 6, autofill: translate('about_en') },
    upload('logo', 'Business Logo', 12),
    upload('image_1', 'Business Image 1', 3),
    upload('image_2', 'Business Image 2', 3),
    upload('image_3', 'Business Image 3', 3),
    upload('image_4', 'Business Image 4', 3),
    { name: 'keywords', label: 'Keywords', hint: 'If you want to enter multiple keywords, please separate them with a comma (,).' },
    { name: 'keywords_hi', label: 'Keywords (Hindi)', hint: 'यदि आप एक से अधिक कीवर्ड लिखना चाहते हैं, तो उन्हें कॉमा (,) से अलग करें।' },
    {
      name: 'social_media_url', label: 'Social Media Links', type: 'custom',
      custom: repeatable({
        subfields: [
          { name: 'platform', label: 'Platform (facebook, twitter, linkedin, instagram, youtube, website, other)', size: 6 },
          { name: 'url', label: 'Profile URL', size: 6 },
        ],
        newItemLabel: 'Add Social Media Links', initRows: 1, minRows: 0, maxRows: 10,
      }),
    },
    { name: 'slug', label: 'Slug', type: 'slug', size: 6, attributes: { readOnly: 'readonly' }, slug: { target: 'business_name_en', separator: '', trim: true, lower: true, strict: true, remove: /[*+~()!:@]/g } },
    { name: 'status', label: 'Active', type: 'checkbox', size: 6 },
    ...(edit ? [] : [{ name: 'is_business_approved', type: 'hidden' as const }]),
  ];
}

const bizColumns: ColumnDef[] = [
  { name: 'state_en', label: 'State', render: (r) => showLink(r, s(r.state_en) || '-') },
  { name: 'dist_en', label: 'District', render: (r) => showLink(r, s(r.dist_en) || '-') },
  { name: 'receipt_number', label: 'Receipt no.', render: (r) => showLink(r, s(r.receipt_number) || '-') },
  { name: 'mediator', label: 'The Mediator', render: (r) => showLink(r, s(r.mediator_name) || '-') },
  { name: 'status', label: 'Status', render: (r) => (Number(r.status) === 1 ? <span style={{ fontSize: 20, color: 'green' }}>✅</span> : <span style={{ fontSize: 20, color: 'red' }}>❌</span>) },
  { name: 'owner_name_en', label: 'Business Owner', render: (r) => showLink(r, s(r.owner_name_en) || '-') },
  { name: 'business_name_en', label: 'Business Name', render: (r) => showLink(r, s(r.business_name_en) || '-') },
  { name: 'address_line_1_en', label: 'Address line 1', render: (r) => showLink(r, s(r.address_line_1_en) || '-') },
  {
    name: 'business_contact_1', label: 'Business Contacts',
    render: (r) => <div style={{ whiteSpace: 'normal' }}>{[s(r.business_contact_1), s(r.business_contact_2)].filter(Boolean).map((c, i) => <div key={i}>{c}</div>)}</div>,
  },
  { name: 'business_category_id', label: 'Business Category', render: (r) => showLink(r, s(r.business_category_name) || '-') },
  { name: 'business_sub_category_id', label: 'Business Sub Category', render: (r) => showLink(r, s(r.business_sub_category_name) || '-') },
  { name: 'business_payment_mode', label: 'Payment Mode', render: (r) => showLink(r, s(r.business_payment_mode) || '-') },
  { name: 'business_fess', label: 'Fees Amount', render: (r) => showLink(r, s(r.business_fess) || '-') },
  { name: 'fees_type', label: 'Business Fess Type', render: (r) => showLink(r, s(r.fees_type) || '-') },
];

/** resources/views/business/business_show.blade.php */
function BusinessShow({ r }: { r: Record<string, unknown> }) {
  // `{{ $mediator->name }}` on a missing BusinessUser is a fatal error in the blade view.
  if (!r.mediator_found) throw new Error('Attempt to read property "name" on null');
  const strip = (v: unknown) => s(v).replace(/<[^>]*>/g, '');
  return (
    <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
      <div style={{ flex: 2, minWidth: 300 }}>
        <p><strong>Owner:</strong> {s(r.owner_name_en)} (<span style={hi}>{s(r.owner_name_hi)}</span>)</p>
        <p><strong>Receipt No:</strong> {s(r.receipt_number)}</p>
        <p><strong>Mediator:</strong> {s(r.mediator_name)}</p>
        <p><strong>Owner Number:</strong> {s(r.owner_number_1)}</p>
        <p><strong>Business Contacts:</strong> {[r.business_contact_1, r.business_contact_2, r.business_contact_3, r.business_contact_4].map(s).join(', ')}</p>
        <p><strong>Email:</strong> {s(r.business_email)} / {s(r.owner_email)}</p>
        <p><strong>Fees:</strong> ₹{s(r.business_fess)} (Mode: {s(r.business_payment_mode)}) (Payment Mode : {s(r.fees_type)})</p>
        <p><strong>PAN:</strong> {s(r.pan)}</p>
        <p><strong>AADHAAR:</strong> {s(r.aadhaar)}</p>
        <p><strong>GST:</strong> {s(r.gst)}</p>
        <p><strong>Start Date:</strong> {s(r.from_date)}</p>
        <p><strong>Validity Till:</strong> {s(r.valid_till)}</p>
        <p><strong>Expiry Date:</strong> {s(r.exp_date)}</p>
        <hr />
        <p><strong>Category:</strong> {s(r.business_category_name) || '-'} (<span style={hi}>{s(r.category_hi)}</span>)</p>
        <p><strong>Subcategory:</strong> {s(r.business_sub_category_name) || '-'} (<span style={hi}>{s(r.sub_category_hi)}</span>)</p>
        <p><strong>About:</strong> {strip(r.about_en)} / <span style={hi}>{strip(r.about_hi)}</span></p>
        <hr />
        <p>
          <strong>Address:</strong><br />
          {s(r.address_line_1_en)}<br />
          {s(r.area_en)}, {s(r.tehsil_en)}, {s(r.dist_en)}, {s(r.state_en)} - {s(r.pin_code ?? r.pincode_hi)}<br /><br />
          <span style={hi}>{s(r.address_line_1_hi)} - {s(r.pincode_hi)}</span><br />
          <small style={hi}>({s(r.area_hi)}, {s(r.tehsil_hi)}, {s(r.dist_hi)}, {s(r.state_hi)}) - {s(r.pincode_hi)}</small>
        </p>
        <p><strong>Status:</strong> {Number(r.status) ? <span style={{ color: 'green' }}>Active</span> : <span style={{ color: 'red' }}>Inactive</span>}</p>
      </div>
      <div style={{ flex: 1, minWidth: 250, textAlign: 'center' }}>
        <div style={{ textAlign: 'right' }}><a className="btn btn-primary" href={`/pocketddadmin/business/${s(r.id)}/edit`}>Edit</a></div>
        {Boolean(r.logo) && (
          <>
            <img src={`/${s(r.logo)}`} alt="Logo" style={{ maxHeight: 100, borderRadius: 8 }} />
            <h3>{s(r.business_name_en)} <small style={{ ...hi, color: '#888' }}>({s(r.business_name_hi)})</small></h3>
          </>
        )}
        <div>
          <strong>Images:</strong><br />
          {['image_1', 'image_2', 'image_3', 'image_4'].filter((k) => r[k]).map((k) => <img key={k} src={`/${s(r[k])}`} alt="" style={{ maxHeight: 80, margin: 5, borderRadius: 6 }} />)}
        </div>
      </div>
    </div>
  );
}

export const business: EntityUi = {
  route: 'business',
  singular: 'business',
  plural: 'businesses',
  operations: ['list', 'create', 'update', 'show'],
  columns: bizColumns,
  showColumns: [{ name: 'custom_view', label: '', render: (r) => <BusinessShow r={r} /> }],
  filters: [
    { name: 'owner_name_en', label: 'Business Owner', type: 'select' },
    { name: 'business_category_id', label: 'Business Category', type: 'select' },
    { name: 'status', label: 'Business Status', type: 'select' },
    { name: 'state', label: 'Choose State', type: 'select' },
    { name: 'district', label: 'District Name', type: 'select' },
    { name: 'sorting', label: 'Sort By', type: 'select' },
  ],
  formOptions: true,
  createFields: businessFields(false),
  updateFields: businessFields(true),
};

// ------------------------------------------------------------------ business-detail
const detailCommon: FieldDef[] = [
  { name: 'state', label: 'State', size: 6, attributes: { readOnly: 'readonly', id: 'state' } },
  { name: 'district', label: 'District', size: 6, attributes: { readOnly: 'readonly', id: 'city' } },
  { name: 'business_mobile_number', label: 'Business Mobile Number', type: 'number', size: 6 },
  { name: 'business_email', label: 'Email-Id', type: 'email', size: 6 },
  { name: 'other_partner_name', label: 'Employee Partner Name', size: 6 },
  { name: 'address_line', label: 'Business Address Line 1', size: 6 },
  { name: 'street_address', label: 'Business Street Address', size: 6 },
  { name: 'post', label: 'Post Address', size: 6 },
  { name: 'tahsil', label: 'Tehsil', size: 6 },
  { name: 'description', label: 'Business Short Summary', type: 'textarea' },
  {
    name: 'summaries', label: 'About Us', type: 'custom',
    custom: repeatable({ subfields: [{ name: 'description', label: 'Add your details', type: 'textarea' }], newItemLabel: 'Add', initRows: 1, minRows: 0, maxRows: 100 }),
  },
];
export const businessDetail: EntityUi = {
  route: 'business-detail',
  singular: 'business detail',
  plural: 'business details',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'business_id', label: 'Business Name', render: (r) => s(r.business_name) || '-' },
    { name: 'business_email', label: 'Business Email' },
    { name: 'business_mobile_number', label: 'Mobile Number' },
    { name: 'pincode', label: 'PinCode' },
    { name: 'district', label: 'District' },
    { name: 'state', label: 'State' },
  ],
  showColumns: [
    { name: 'business_id', label: 'Business Name', render: (r) => s(r.business_name) || '-' },
    { name: 'business_email', label: 'Business Email' },
    { name: 'business_mobile_number', label: 'Mobile Number' },
    { name: 'created_at', label: 'Created at', type: 'datetime' },
  ],
  filters: [
    { name: 'business_id', label: 'Select Business', type: 'select' },
    { name: 'business_category__id', label: 'Business Category', type: 'select' },
    { name: 'business_sub_category_id', label: 'Business Subcategory', type: 'select' },
  ],
  formOptions: true,
  createFields: [
    { name: 'business_id', label: 'Business', type: 'select', size: 6 },
    // relationship field (select2 ajax on pin_code in Backpack) — here the pincode id; state/district are
    // filled from /api/business-city/{id}.
    { name: 'pincode_id', label: 'Pincode', size: 6, type: 'number', attributes: { id: 'pincode' } },
    ...detailCommon,
  ],
  updateFields: [
    { name: 'business_id', label: 'Business', type: 'select', size: 6 },
    { name: 'pincode_id', label: 'Enter City Pin-Code', size: 6, attributes: { readOnly: 'readonly' } },
    ...detailCommon,
  ],
};
businessDetail.createFields[2] = { ...businessDetail.createFields[2]!, autofill: { from: 'pincode_id', endpoint: (v) => `/api/business-city/${enc(v)}`, pick: (j) => j?.state ?? undefined } };
businessDetail.createFields[3] = { ...businessDetail.createFields[3]!, autofill: { from: 'pincode_id', endpoint: (v) => `/api/business-city/${enc(v)}`, pick: (j) => j?.district ?? undefined } };

// ------------------------------------------------------------------ business-image
const imageFields: FieldDef[] = [
  { name: 'business_id', label: 'Business', type: 'select', size: 6 },
  { name: 'img', label: 'Img', type: 'upload', size: 6 },
];
export const businessImage: EntityUi = {
  route: 'business-image',
  singular: 'business image',
  plural: 'business images',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'business_id', label: 'Business Name', render: (r) => s(r.business_name) || '-' },
    { name: 'img', label: 'Business Logo', type: 'image' },
  ],
  formOptions: true,
  createFields: imageFields,
};

// ------------------------------------------------------------------ business-location
const locFields: FieldDef[] = [
  { name: 'business_id', label: 'Business Name', type: 'select', size: 6 },
  { name: 'location_id', label: 'Business Location', type: 'select', size: 6 },
];
export const businessLocation: EntityUi = {
  route: 'business-location',
  singular: 'business location',
  plural: 'business locations',
  operations: ['list', 'create', 'update', 'show'],
  columns: [
    { name: 'business_id', label: 'Business Name', render: (r) => <span style={{ color: '#fff', backgroundColor: '#ffc107', borderRadius: 5, padding: 6 }}>{s(r.business_name) || '-'}</span> },
    { name: 'location_id', label: 'Business Location', render: (r) => s(r.location_name) || '-' },
  ],
  showColumns: [
    { name: 'business_id', label: 'Business Name', render: (r) => s(r.business_name) || '-' },
    { name: 'location_id', label: 'Business User Location', render: (r) => s(r.location_name) || '-' },
  ],
  filters: [{ name: 'business_id', label: 'Select Business', type: 'select' }],
  formOptions: true,
  createFields: locFields,
};

// ------------------------------------------------------------------ business-owner
export const businessOwner: EntityUi = {
  route: 'business-owner',
  singular: 'business owner',
  plural: 'business owners',
  operations: ['list', 'show'],
  columns: [
    { name: 'name', label: 'Name' },
    { name: 'phone', label: 'Phone Number' },
    {
      name: 'business_id', label: 'Business Name',
      render: (r) => <a href={`/pocketddadmin/business?business_name_en=${enc(s(r.business_name_en)).replace(/%20/g, '+')}`}>{s(r.business_name_en) || '-'}</a>,
    },
  ],
  showColumns: [
    { name: 'name', label: 'Name' },
    { name: 'phone', label: 'Phone Number' },
    { name: 'business_id', label: 'Business Name', render: (r) => s(r.business_name_en) || '-' },
  ],
  createFields: [],
};

// ------------------------------------------------------------------ business-request-managment
const reqText = (name: string, label: string): ColumnDef => ({ name, label });
export const businessRequestManagment: EntityUi = {
  route: 'business-request-managment',
  singular: 'business request management',
  plural: 'business request managements',
  operations: ['list', 'show'],
  columns: [
    { name: 'business_name', label: 'Business Name' },
    { name: 'is_business_approved', label: 'Is business approved', type: 'check' },
  ],
  showColumns: [
    { name: 'status', label: 'Status', type: 'boolean' },
    { name: 'is_business_approved', label: 'Is business approved', type: 'boolean' },
    {
      name: 'business_category_id', label: 'Business Category',
      render: (r) => {
        if (r.business_category_name === null) throw new Error('Attempt to read property "name" on null');
        return s(r.business_category_name);
      },
    },
    { name: 'business_sub_category_id', label: 'Business Category', render: (r) => s(r.business_sub_category_name) || '-' },
    reqText('business_username', 'Business username'),
    reqText('business_name', 'Business name'),
    reqText('address_line', 'Address line'),
    reqText('street_address', 'Street address'),
    reqText('area_name', 'Area name'),
    reqText('tahsil', 'Tahsil'),
    reqText('pincode', 'Pincode'),
    reqText('district', 'District'),
    reqText('state', 'State'),
    reqText('business_email', 'Business email'),
    reqText('mobile_number', 'Mobile number'),
    { name: 'business_image', label: 'Business Image', type: 'image' },
  ],
  filters: [{ name: 'business_id', label: 'Select Business', type: 'select' }],
  lineButtons: (r) => (Number(r.is_business_approved) === 0 ? [{ label: '✔ Approve', href: `/pocketddadmin/business/${s(r.business_id)}/edit` }] : []),
  createFields: [],
};

export const phase9aUi: EntityUi[] = [business, businessDetail, businessImage, businessLocation, businessOwner, businessRequestManagment];
