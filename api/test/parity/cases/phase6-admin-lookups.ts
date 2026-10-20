import type { ParityCase } from '../types.js';

const S = encodeURIComponent('Phase Six State');
const A = encodeURIComponent('Alpha City');
const B = encodeURIComponent('Beta Town');
const UP = encodeURIComponent('Uttar Pradesh');
const get = (name: string, path: string): ParityCase => ({ name, method: 'GET', path: `/api/${path}` });

const departments = [
  // dictionaries
  'Police', 'Health Department', 'Education', 'Bakery', 'Doctors', 'Electricity Board', 'Water Supply',
  'Fire Brigade', 'Municipal Corporation', 'Revenue', 'Transport', 'Hospital', 'School', 'Coaching',
  'Architect', 'architects', 'Architecture', 'Baverages', 'beverage', 'Groceries', 'Resturant', 'Vegetables',
  'Sharma Traders', 'Gupta Pvt Ltd', 'Pvt. Ltd.', 'ABC LLP', 'Verma & Sons', 'Singh Brothers', 'Patel',
  'Advocate', 'Surgeon', 'Engineer', 'Teacher', 'Manager', 'Clerk', 'Officer', 'Painter', 'Mason',
  // acronyms (case-sensitive)
  'IT', 'It', 'it', 'GST Office', 'CCTV', 'NGO', 'UPI', 'USA', 'UP', 'Up', 'PWD', 'RTO', 'BSNL',
  // phrases / common words
  'Every Body', 'every day', 'EVERY ONE', 'Everyday Fresh', 'Open Daily', 'Day Night', 'Offline Store',
  'Homemade', 'Monthly', 'Tomorrow', 'everybodys', 'every thing!',
  // Google fallback words + scoring branches
  'Train', 'Tractor', 'Conversion', 'Television', 'Take', 'Will', 'Kaam', 'Karte', 'Raho', 'Follow',
  'Head', 'Lecturer', 'Enginner', 'Yadav', 'Mishra', 'Agriculture', 'Irrigation', 'Forest', 'Panchayat',
  'Tehsil', 'Collectorate', 'Treasury', 'Animal Husbandry', 'Food & Civil Supplies', 'Women and Child Development',
  // punctuation / mixed / non-latin / edge
  'Police-Station', "O'Brien", 'Ward 12', '123', 'C++', 'Dr.Sharma', '(Police)', 'Police, Fire',
  'पुलिस', 'पुलिस Station', '  Police  ', 'Police   Station', 'a', 'X', 'Café', '0', '00', ' 0 ', 'Tab\tSep',
];

export const cases: ParityCase[] = [
  // --- sub categories / category hindi
  get('sub-categories found', 'get-business-sub-categories/600'),
  get('sub-categories none', 'get-business-sub-categories/699'),
  get('sub-categories non-numeric id', 'get-business-sub-categories/abc'),
  get('category hindi found', 'get-category-hindi/600'),
  get('category hindi null → 404', 'get-category-hindi/601'),
  get("category hindi '0' → 404", 'get-category-hindi/602'),
  get('category hindi missing → 404', 'get-category-hindi/699'),

  // --- business-city
  get('business-city found', 'business-city/600'),
  get("business-city state '0' → null", 'business-city/606'),
  get('business-city not found', 'business-city/699'),
  get('business-city non-numeric', 'business-city/xyz'),

  // --- getStateCities (7 controllers)
  ...['state-cities', 'business-state-cities', 'business-user-cities', 'helpline-number-cities', 'business-event-cities',
    'administrator-number-cities', 'about-us-cities'].flatMap((r) => [
    get(`${r} phase6`, `${r}/${S}`),
    get(`${r} none`, `${r}/Nowhere`),
  ]),
  get('state-cities UP', `state-cities/${UP}`),

  // --- getPincodeByStateCity
  ...['state-city-pincode', 'business-state-city-pincode', 'business-user-pincode', 'helpline-number-pincode',
    'business-event-pincode', 'administrator-number-pincode'].flatMap((r) => [
    get(`${r} alpha`, `${r}/${S}/${A}`),
    get(`${r} beta`, `${r}/${S}/${B}`),
    get(`${r} none`, `${r}/${S}/Nowhere`),
    get(`${r} UP Lucknow`, `${r}/${UP}/Lucknow`),
  ]),

  // --- tehsil/area
  get('tehsil-area list areas', `get-tehsil-area/${S}/${A}/600`),
  get('tehsil-area object areas', `get-tehsil-area/${S}/${A}/603`),
  get('tehsil-area scalar area', `get-tehsil-area/${S}/${B}/604`),
  get('tehsil-area empty list', `get-tehsil-area/${S}/Gamma/605`),
  get('tehsil-area not found', `get-tehsil-area/${S}/${A}/699`),
  get('tehsil-area UP', `get-tehsil-area/${UP}/Lucknow/1`),
  get('tehsil-area UP object', `get-tehsil-area/${UP}/Lucknow/3`),

  // --- hindi lookups
  get('hindi-state found', `get-hindi-state/${S}`),
  get('hindi-state not found (still 200)', 'get-hindi-state/Nowhere'),
  get("hindi-state '0' → 404", 'get-hindi-state/0'),
  get('hindi-state hindi param', `get-hindi-state/${encodeURIComponent('उत्तर प्रदेश')}`),
  get('hindi-district found', `get-hindi-district/${S}/${A}`),
  get("hindi-district '0' → 404", `get-hindi-district/${S}/${B}`),
  get("hindi-district '' → 404", `get-hindi-district/${S}/Gamma`),
  get('hindi-district missing', `get-hindi-district/${S}/Nowhere`),
  get('hindi-district UP', `get-hindi-district/${UP}/Lucknow`),
  get('hindi-tehsil found', `get-hindi-tehsil/${S}/${A}/600`),
  get("hindi-tehsil '0'", `get-hindi-tehsil/${S}/${A}/603`),
  get('hindi-tehsil null first row', `get-hindi-tehsil/${S}/${B}/604`),
  get("hindi-tehsil ''", `get-hindi-tehsil/${S}/Gamma/605`),
  get('hindi-tehsil missing', `get-hindi-tehsil/${S}/${A}/699`),
  get('hindi-area merged', `get-hindi-area/${S}/${A}/600`),
  get('hindi-area object/scalars', `get-hindi-area/${S}/${A}/603`),
  get('hindi-area scalar + null', `get-hindi-area/${S}/${B}/604`),
  get('hindi-area empty list', `get-hindi-area/${S}/Gamma/605`),
  get('hindi-area no records (undefined var)', `get-hindi-area/${S}/${A}/699`),
  get('hindi-area UP', `get-hindi-area/${UP}/Lucknow/1`),

  // --- getTehsilByUserCity
  ...['business-user-get-tehsil-area', 'business-event-get-tehsil-area'].flatMap((r) => [
    get(`${r} found`, `${r}/${S}/${A}/600`),
    get(`${r} null tehsil`, `${r}/${S}/${B}/604`),
    get(`${r} missing`, `${r}/${S}/${A}/699`),
  ]),

  // --- pincode-codes
  get('codes state only', `pincode-codes/${S}`),
  get('codes state+city', `pincode-codes/${S}/${B}`),
  get('codes city none', `pincode-codes/${S}/Nowhere`),
  get('codes state none', 'pincode-codes/Nowhere'),
  get("codes city '0' ignored", `pincode-codes/${encodeURIComponent('Phase Six Empty')}/0`),

  // --- translate-to-hindi
  ...departments.map((d) => get(`translate "${d}"`, `translate-to-hindi/${encodeURIComponent(d)}`)),
  get('translate plus sign kept', 'translate-to-hindi/Police+Station'),
];
