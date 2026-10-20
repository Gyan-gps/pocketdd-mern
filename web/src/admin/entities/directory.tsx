// UI of the directory admin CrudControllers: Administrator ("Officers Contact"), Designation, CityHelplineNumber,
// Address ("Area & Local Area"), AboutUs, PinCode.
import {
  alphaFilter,
  alphaTitleFilter,
  areaFilter,
  citySelect,
  codeFill,
  digits10Filter,
  digits6Filter,
  digitsFilter,
  lettersFilter,
  numbersFilter,
  pincodeSelect,
  rankFilter,
  repeatable,

  textCell,
} from '../fields/directory-fields';
import type { ColumnDef, EntityUi, FieldDef } from '../types';

const k010: React.CSSProperties = { fontFamily: 'k010', fontSize: 25 };
const hiInput: React.CSSProperties = { fontFamily: 'k010', fontSize: 23, height: 35 };
const hiTitle = { autoComplete: 'off', title: 'केवल हिंदी वर्णमाला (Hindi letters only)' };
const translate = (from: string) => ({
  from,
  endpoint: (v: string) => `/api/translate-to-hindi/${encodeURIComponent(v)}`,
  pick: (j: any) => j?.data?.translated_text,
});
const text = (name: string, label: string, limit = 32): ColumnDef => ({ name, label, render: (r) => textCell(r[name], limit) });
const pincodeCol: ColumnDef = { name: 'pincode', label: 'PinCode', render: (r) => textCell(r.pincode) };
const readonly = (name: string, label: string, size: number): FieldDef => ({ name, label, size, attributes: { readOnly: 'readonly' } });
const stateSelect = (size: number): FieldDef => ({ name: 'state', label: 'State', type: 'select', size });

// ------------------------------------------------------------------ designation

const designationFields: FieldDef[] = [
  { name: 'name', label: 'Designation Name', size: 6, inputFilter: alphaFilter, attributes: { title: 'Please enter only alphabets and spaces' } },
  { name: 'officer_mobile_number', label: 'Officer Mobile Number', size: 6, inputFilter: digits10Filter, attributes: { pattern: '[0-9]{10}', maxLength: '10', title: 'Please enter exactly 10 digits' } },
  { name: 'status', label: 'Status', type: 'checkbox', size: 6 },
];

export const designation: EntityUi = {
  route: 'designation',
  singular: 'designation',
  plural: 'designations',
  operations: ['list', 'create', 'update', 'show'],
  columns: [text('name', 'Name'), text('officer_mobile_number', 'Officer mobile number'), { name: 'status', label: 'Status', type: 'check' }],
  createFields: designationFields,
};

// ------------------------------------------------------------------ administrator

const officerRepeatable = repeatable({
  newItemLabel: 'Add Officer Details',
  initRows: 1,
  minRows: 0,
  maxRows: 50,
  subfields: [
    { name: 'officer_rank', label: 'Officer Rank', size: 4, inputFilter: rankFilter, translateTo: 'officer_rank_hi' },
    { name: 'officer_rank_hi', label: 'अधिकारी पद', size: 4, style: hiInput },
    {
      name: 'officer_number', label: 'Officer Number', size: 4, inputFilter: numbersFilter,
      hint: 'Enter mobile or landline numbers separated by commas (e.g. 9876543210, 0141-1234567)',
    },
  ],
});

export const administrator: EntityUi = {
  route: 'administrator',
  singular: 'Officers Contact',
  plural: 'Officers Contact',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  filters: [
    { name: 'department_id', label: 'Department', type: 'select' },
    { name: 'state', label: 'State', type: 'select' },
    { name: 'status', label: 'Status', type: 'select' },
  ],
  columns: [
    { name: 'department_id', label: 'Department', render: (r) => textCell(r.department_name) },
    { name: 'officer_count', label: 'Officer Count', render: (r) => textCell(r.officer_count) },
    text('state', 'State'),
    text('city', 'City'),
    pincodeCol,
    { name: 'status', label: 'Status', type: 'check' },
  ],
  showColumns: [
    { name: 'department_id', label: 'Department Name', render: (r) => textCell(r.department_name) },
    {
      name: 'officer_rank_name',
      label: 'Officer Details',
      render: (r) => {
        const v = r.officer_rank_name;
        if (!v || typeof v !== 'object') return '-';
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                {['Rank (EN)', 'Rank (HI)', 'Mobile'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>{h}</th>
                ))}
              </tr>
              {Object.values(v as object).map((it: any, i) => (
                <tr key={i}>
                  <td>{String(it?.officer_rank ?? '')}</td>
                  <td>{String(it?.officer_rank_hi ?? '')}</td>
                  <td>{String(it?.officer_number ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      },
    },
    text('state', 'State'),
    text('city', 'City'),
    pincodeCol,
    { name: 'status', label: 'Status', type: 'check' },
  ],
  createFields: [
    stateSelect(4),
    { name: 'city', label: 'City', type: 'custom', size: 4, custom: citySelect('administrator-number-cities') },
    { name: 'pincode_id', label: 'PinCode', type: 'custom', size: 4, custom: pincodeSelect('administrator-number-pincode') },
    { name: 'department_id', label: 'Officer Department', type: 'select', size: 6 },
    { name: 'officer_rank_name', label: 'Officer Position', type: 'custom', custom: officerRepeatable },
    { name: 'status', label: 'Status', type: 'checkbox' },
  ],
  updateFields: [
    readonly('state', 'State', 4),
    readonly('city', 'City', 4),
    readonly('pincode_show', 'Pincode', 4),
    { name: 'department_id', label: 'Office Department', type: 'select', size: 6 },
    { name: 'officer_rank_name', label: 'Officer Position', type: 'custom', custom: officerRepeatable },
    { name: 'status', label: 'Status', type: 'checkbox' },
    { name: 'pincode_id', type: 'hidden' },
  ],
};

// ------------------------------------------------------------------ city helpline number

const helplineRepeatable = repeatable({
  newItemLabel: 'Add',
  initRows: 1,
  minRows: 1,
  maxRows: 1,
  subfields: [
    { name: 'ambulance_number', label: 'Ambulance Number (एम्बुलेंस नंबर)', type: 'number', size: 6 },
    { name: 'fire_safety_number', label: 'Fire Safety Number (अग्नि सुरक्षा संख्या)', type: 'number', size: 6 },
    { name: 'women_helpline', label: 'Women Helpline Number (महिला हेल्पलाइन नंबर)', type: 'number', size: 6 },
    { name: 'police_headquarters', label: 'Police Headquarter Number (पुलिस मुख्यालय क्रमांक)', type: 'number', size: 6 },
  ],
});

const helplineCols: ColumnDef[] = [
  { name: 'ambulance_number', label: 'Ambulance', render: (r) => textCell(r.ambulance_number) },
  { name: 'fire_safety_number', label: 'Fire Safety', render: (r) => textCell(r.fire_safety_number) },
  { name: 'women_helpline', label: 'Women Helpline', render: (r) => textCell(r.women_helpline) },
  { name: 'police_headquarters', label: 'Police HQ', render: (r) => textCell(r.police_headquarters) },
  text('state', 'State'),
  text('city', 'City'),
  pincodeCol,
];

export const cityHelplineNumber: EntityUi = {
  route: 'city-helpline-number',
  singular: 'helpline number',
  plural: 'helpline numbers',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  filters: [
    { name: 'state', label: 'Choose State', type: 'select' },
    { name: 'district', label: 'District Name', type: 'select' },
  ],
  columns: helplineCols,
  createFields: [
    stateSelect(4),
    { name: 'city', label: 'City', type: 'custom', size: 4, custom: citySelect('helpline-number-cities') },
    { name: 'pincode_id', label: 'PinCode', type: 'custom', size: 4, custom: pincodeSelect('helpline-number-pincode') },
    { name: 'city_helpline', label: 'Contact Information', type: 'custom', custom: helplineRepeatable },
  ],
  updateFields: [
    readonly('state', 'State', 4),
    readonly('city', 'City', 4),
    // relationship field with `disabled` — shown, never submitted
    { name: 'pincode', label: 'Pincode', size: 4, attributes: { disabled: 'disabled' } },
    { name: 'city_helpline', label: 'Contact Information', type: 'custom', custom: helplineRepeatable },
  ],
};

// ------------------------------------------------------------------ address

const areaRepeatable = (size: number) =>
  repeatable({
    newItemLabel: 'Add Local Areas',
    initRows: 1,
    minRows: 1,
    maxRows: 200,
    numberLabel: 'area_name',
    subfields: [
      { name: 'area_name', label: 'Local Area Name', size, inputFilter: areaFilter, translateTo: 'area_name_hi' },
      { name: 'area_name_hi', label: 'स्थानीय क्षेत्र का नाम', size, style: hiInput },
    ],
  });

const tehsilFields: FieldDef[] = [
  { name: 'tehsil', label: 'Pin code area', size: 4, inputFilter: areaFilter, attributes: { autoComplete: 'off', title: 'Please enter only alphabets and spaces' } },
  { name: 'tehsil_hi', label: 'पिन कोड क्षेत्र', size: 4, attributes: hiTitle, autofill: translate('tehsil') },
];

export const address: EntityUi = {
  route: 'address',
  singular: 'Area & Local Area',
  plural: 'Area & Local Areas',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  filters: [{ name: 'state', label: 'State', type: 'select' }],
  columns: [
    text('state', 'State'),
    text('city', 'City'),
    { name: 'pincode_id', label: 'PinCode', render: (r) => textCell(r.pincode) },
    text('tehsil', 'Pin code area'),
    { name: 'tehsil_hi', label: 'पिन कोड क्षेत्र', render: (r) => <span style={k010}>{textCell(r.tehsil_hi, 32)}</span> },
    { name: 'area', label: 'Local area', render: (r) => textCell(r.area_display, 32) },
    { name: 'area_hi', label: 'स्थानीय क्षेत्र', render: (r) => <span style={k010}>{textCell(r.area_hi_display, 32)}</span> },
  ],
  // setShowView('address.show') + views/address/address_show.blade.php
  showColumns: [
    {
      name: 'custom_view',
      label: '',
      render: (r) => (
        <div style={{ padding: '40px 20px', lineHeight: 2, fontSize: 18 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}><strong>State:</strong> {String(r.state ?? '')}</div>
            <div style={{ flex: 1 }}><strong>City:</strong> {String(r.city ?? '')}</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}><strong>Pincode:</strong> {String(r.pin_code ?? '')}</div>
            <div style={{ flex: 1 }}>
              <strong>Pin code area:</strong> {String(r.tehsil ?? '')} <span style={{ fontSize: 20 }}>({String(r.tehsil_hi ?? '')})</span>
            </div>
          </div>
          <div style={{ marginTop: 30 }}>
            <strong style={{ fontSize: 20 }}>Local Areas:</strong>
            {r.area && typeof r.area === 'object' && Object.keys(r.area).length ? (
              <ol style={{ paddingLeft: 30 }}>
                {Object.values(r.area as object).map((a: any, i) => (
                  <li key={i}>
                    <strong>Local Area Name:</strong> {String(a?.area_name ?? '')} <span style={{ fontSize: 20 }}>({String(a?.area_name_hi ?? '')})</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div>No areas added.</div>
            )}
          </div>
        </div>
      ),
    },
  ],
  createFields: [
    stateSelect(4),
    { name: 'city', label: 'City', type: 'custom', size: 4, custom: citySelect('state-cities') },
    { name: 'pincode_id', label: 'PinCode', type: 'custom', size: 4, custom: pincodeSelect('state-city-pincode') },
    ...tehsilFields,
    { name: 'area', label: 'Local Area', type: 'custom', custom: areaRepeatable(5) },
  ],
  updateFields: [
    readonly('state', 'State', 6),
    readonly('city', 'City', 6),
    { name: 'pincode', label: 'Pincode', size: 4, attributes: { disabled: 'disabled' } },
    ...tehsilFields,
    { name: 'area', label: 'Local Area', type: 'custom', custom: areaRepeatable(6) },
  ],
};

// ------------------------------------------------------------------ about us

const touristRepeatable = repeatable({
  newItemLabel: 'Add Tourist Places',
  initRows: 1,
  minRows: 1,
  maxRows: 10,
  initialFrom: 'tourist_places_form',
  subfields: [
    { name: 'place_name', label: 'Tourist Place Name', size: 4, inputFilter: alphaTitleFilter, translateTo: 'place_name_hi' },
    { name: 'place_name_hi', label: 'पर्यटक स्थल का नाम', size: 4, style: hiInput },
    { name: 'place_image', label: 'Tourist Place Images', type: 'upload', size: 4 },
    { name: 'place_description', label: 'Tourist Place Description', type: 'textarea', size: 6, inputFilter: alphaTitleFilter, translateTo: 'place_description_hi' },
    { name: 'place_description_hi', label: 'पर्यटक स्थल विवरण', type: 'textarea', size: 6, style: hiInput },
  ],
});

const aboutTexts: FieldDef[] = [
  { name: 'about_mediator', label: 'Know About the Mediator', type: 'textarea', size: 6, inputFilter: alphaTitleFilter },
  { name: 'about_mediator_hi', label: 'मध्यस्थ के बारे में जानें', type: 'textarea', size: 6, attributes: hiTitle, autofill: translate('about_mediator') },
  { name: 'know_your_city', label: 'Know Your City', type: 'textarea', size: 6, inputFilter: alphaTitleFilter },
  { name: 'know_your_city_hi', label: 'अपने शहर को जानें', type: 'textarea', size: 6, attributes: hiTitle, autofill: translate('know_your_city') },
  { name: 'tourist_places', label: 'Tourist Places', type: 'custom', custom: touristRepeatable },
];

export const aboutUs: EntityUi = {
  route: 'about-us',
  singular: 'about us',
  plural: 'about us',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  columns: [text('state', 'State'), text('city', 'District'), { name: 'tourist_places', label: 'Tourist Places', render: (r) => textCell(r.tourist_places_text, 1000) }],
  showColumns: [
    text('state', 'State'),
    text('city', 'District'),
    // escaped => false: rendered as HTML, like Backpack
    ...(['about_mediator', 'about_mediator_hi', 'know_your_city', 'know_your_city_hi'] as const).map((n, i) => ({
      name: n,
      label: ['Know About the Mediator', 'मध्यस्थ के बारे में जानें', 'Know Your City', 'अपने शहर को जानें'][i],
      render: (r: Record<string, unknown>) => <span dangerouslySetInnerHTML={{ __html: textCell(r[n], 1000) }} />,
    })),
    {
      name: 'tourist_places',
      label: 'Tourist Places',
      render: (r) => {
        const list = r.tourist_places_list;
        if (!list || typeof list !== 'object') return '-';
        return (
          <>
            {Object.values(list as object).map((p: any, i) => (
              <div key={i} style={{ marginBottom: 20, padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
                <h5 dangerouslySetInnerHTML={{ __html: `${p?.place_name ?? ''} (${p?.place_name_hi ?? ''})` }} />
                <div dangerouslySetInnerHTML={{ __html: String(p?.place_description ?? '') }} />
                {p?.place_image ? <img src={`/${String(p.place_image).replace(/^\//, '')}`} alt={String(p.place_name ?? '')} style={{ width: 200, marginTop: 10 }} /> : null}
              </div>
            ))}
          </>
        );
      },
    },
  ],
  createFields: [stateSelect(6), { name: 'city', label: 'District', type: 'custom', size: 6, custom: citySelect('about-us-cities') }, ...aboutTexts],
  updateFields: [readonly('state', 'State', 6), readonly('city', 'District', 6), ...aboutTexts],
};

// ------------------------------------------------------------------ pincode

export const pincode: EntityUi = {
  route: 'pincode',
  singular: 'pincode',
  plural: 'pincodes',
  operations: ['list', 'create', 'update', 'show'],
  formOptions: true,
  filters: [{ name: 'state', label: 'State', type: 'select' }],
  // PinCodeCrudController: the importPincodeData top button is commented out, so the list has none
  // (the import page itself stays reachable at /pocketddadmin/import-pincode-data).
  columns: [
    text('pin_code', 'PinCode'),
    text('pincode_area', 'PinCode Area'),
    text('city', 'City'),
    text('city_hi', 'शहर'),
    text('district_code', 'District Code'),
    text('state', 'State'),
    text('state_hi', 'राज्य'),
  ],
  createFields: [
    stateSelect(4),
    { name: 'city', label: 'District', type: 'custom', size: 4, custom: citySelect('helpline-number-cities') },
    { name: 'pin_code', label: 'PinCode', size: 4, inputFilter: digits6Filter, attributes: { maxLength: '6' } },
    { name: 'state_code', label: 'State Code', type: 'custom', size: 6, custom: codeFill('state_code', lettersFilter) },
    { name: 'district_code', label: 'District Code', type: 'custom', size: 6, custom: codeFill('district_code', digitsFilter) },
  ],
  updateFields: [
    readonly('pin_code', 'PinCode', 6),
    readonly('city', 'City', 6),
    readonly('city_hi', 'शहर', 6),
    { name: 'district_code', label: 'District Code', size: 6, inputFilter: digitsFilter },
    readonly('state', 'State', 6),
    readonly('state_hi', 'राज्य', 6),
    { name: 'state_code', label: 'State Code', size: 6, inputFilter: lettersFilter },
  ],
};

export const directoryUi: EntityUi[] = [designation, administrator, cityHelplineNumber, address, aboutUs, pincode];

