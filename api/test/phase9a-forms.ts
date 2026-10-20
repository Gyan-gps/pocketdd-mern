// Browser-equivalent form payloads for the phase 9A Backpack screens (shared by the Laravel/Node comparison).
export type FormValue = string | { file: Buffer; name: string; type: string };
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
export const EMPTY_FILE: FormValue = { file: Buffer.alloc(0), name: '', type: 'application/octet-stream' };

/** Business create/edit form as submitted by the browser (Backpack fields in order). */
export function businessForm(over: Record<string, FormValue> = {}, edit = false): Array<[string, FormValue]> {
  const base: Record<string, FormValue> = {
    mediator: '900',
    owner_number_1: '9000000955',
    business_contact_1: '9000000956',
    business_contact_2: '',
    business_contact_3: '',
    business_contact_4: '',
    pan: '',
    aadhaar: '',
    gst: '',
    from_date: '2025-06-01',
    valid_till: '1_year',
    exp_date: '2026-06-01',
    business_email: '',
    owner_email: '',
    business_payment_mode: 'Fees',
    fees_type: 'Cash',
    business_fess: '700',
    owner_name_en: 'Parity Newowner',
    owner_name_hi: 'पैरिटी मालिक',
    business_name_en: 'Parity Delta Shop',
    business_name_hi: 'पैरिटी डेल्टा',
    address_line_1_en: 'Parity Lane 9',
    address_line_1_hi: 'पैरिटी लेन',
    state_en: 'Paritystate',
    state_hi: 'पैरिटीराज्य',
    dist_en: 'Paritycity',
    dist_hi: 'पैरिटीनगर',
    pincode_id: '900',
    pincode_hi: '999001',
    tehsil_en: '',
    tehsil_hi: '',
    area_en: '',
    area_hi: '',
    business_category_id: '900',
    category_hi: 'पैरिटी श्रेणी',
    business_sub_category_id: '900',
    sub_category_hi: 'पैरिटी उप',
    about_en: 'About Parity',
    about_hi: 'परिचय',
    logo: EMPTY_FILE,
    image_1: EMPTY_FILE,
    image_2: EMPTY_FILE,
    image_3: EMPTY_FILE,
    image_4: EMPTY_FILE,
    keywords: 'parity,delta',
    keywords_hi: 'पैरिटी',
    social_media_url: '[{"platform":"website","url":"https://parity.test/a"}]',
    slug: 'paritydeltashop',
    status: '1',
    business_sub_category_id_hidden: '',
    dist_en_hidden: '',
    tehsil_en_hidden: '',
    area_en_hidden: '',
    pincode_id_hidden: '',
  };
  if (!edit) base.is_business_approved = '1';
  return Object.entries({ ...base, ...over });
}
