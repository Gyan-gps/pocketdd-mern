import type { ParityCase } from '../types.js';

const T = (id: number) => `${id}|p3tok${id}`;
const loc = { cityName: 'Lucknow', stateName: 'Uttar Pradesh' };

export const cases: ParityCase[] = [
  // --- get-dashboard-data
  { name: 'dashboard missing city', path: '/api/get-dashboard-data', body: { language: 'en' } },
  { name: 'dashboard missing language', path: '/api/get-dashboard-data', body: { cityName: 'Lucknow' } },
  { name: 'dashboard en no token', path: '/api/get-dashboard-data', body: { cityName: 'Lucknow', language: 'en' } },
  { name: 'dashboard hi', path: '/api/get-dashboard-data', as: 'form', body: { cityName: 'Lucknow', language: 'hi' } },
  { name: 'dashboard token with business', path: '/api/get-dashboard-data', token: T(300), body: { cityName: 'L', language: 'en' } },
  { name: 'dashboard token without business', path: '/api/get-dashboard-data', token: T(301), body: { cityName: 'L', language: 'en' } },
  { name: 'dashboard bad token', path: '/api/get-dashboard-data', token: '300|wrong', body: { cityName: 'L', language: 'en' } },
  { name: 'dashboard plain token (no id)', path: '/api/get-dashboard-data', token: 'p3tok300', body: { cityName: 'L', language: 'en' } },

  // --- get-business-subcategories
  { name: 'subcats missing slug', path: '/api/get-business-subcategories', body: { cityName: 'L', language: 'en' } },
  { name: 'subcats unknown slug', path: '/api/get-business-subcategories', body: { category_slug: 'nope', cityName: 'L', language: 'en' } },
  { name: 'subcats slug not string', path: '/api/get-business-subcategories', body: { category_slug: 5, cityName: 'L', language: 'en' } },
  { name: 'subcats missing language', path: '/api/get-business-subcategories', body: { category_slug: 'p3-electricians', cityName: 'L' } },
  { name: 'subcats en', path: '/api/get-business-subcategories', body: { category_slug: 'p3-electricians', language: 'en', ...loc } },
  { name: 'subcats en no state (whereNull)', path: '/api/get-business-subcategories', body: { category_slug: 'p3-electricians', language: 'en', cityName: 'Lucknow' } },
  { name: 'subcats hi', path: '/api/get-business-subcategories', token: T(300), body: { category_slug: 'p3-electricians', language: 'hi', cityName: 'लखनऊ', stateName: 'उत्तर प्रदेश' } },
  { name: 'subcats empty', path: '/api/get-business-subcategories', body: { category_slug: 'p3-empty', language: 'en', ...loc } },

  // --- get-dashboard-search-categories
  { name: 'search none', path: '/api/get-dashboard-search-categories', body: {} },
  { name: 'search blank (form)', path: '/api/get-dashboard-search-categories', as: 'form', body: { search: '   ' } },
  { name: 'search not string', path: '/api/get-dashboard-search-categories', body: { search: 12 } },
  { name: 'search bool', path: '/api/get-dashboard-search-categories', body: { search: true } },
  { name: 'search location not string', path: '/api/get-dashboard-search-categories', body: { search: 'wir', location: 5 } },
  { name: 'search en', path: '/api/get-dashboard-search-categories', body: { search: 'Wiring' } },
  { name: 'search hi', path: '/api/get-dashboard-search-categories', body: { search: 'Electric', language: 'hi' } },
  { name: 'search with location', path: '/api/get-dashboard-search-categories', body: { search: 'a', location: 'Kanpur', language: 'en' } },
  { name: 'search aardvark (is_business)', path: '/api/get-dashboard-search-categories', body: { search: 'aardvark' } },
  { name: 'search hindi text', path: '/api/get-dashboard-search-categories', body: { search: 'बिजली मिस्त्री', language: 'hi' } },
  { name: 'search krutidev f/r', path: '/api/get-dashboard-search-categories', body: { search: 'किताब धर्म कि र्क' } },
  { name: 'search no results', path: '/api/get-dashboard-search-categories', body: { search: 'zzqqxx-none' } },

  // --- get-all-businesses
  { name: 'businesses missing slug', path: '/api/get-all-businesses', body: { cityName: 'Lucknow', language: 'en' } },
  { name: 'businesses bad language', path: '/api/get-all-businesses', body: { slug: 'x', cityName: 'Lucknow', language: 'fr' } },
  { name: 'businesses city not string', path: '/api/get-all-businesses', body: { slug: 'x', cityName: 7, language: 'en' } },
  { name: 'businesses unknown city', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', cityName: 'Nowhere', language: 'en' } },
  { name: 'businesses unknown city hi', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', cityName: 'Nowhere', language: 'hi' } },
  { name: 'businesses unknown sub slug', path: '/api/get-all-businesses', body: { slug: 'nope', language: 'en', ...loc } },
  { name: 'businesses sub en', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', language: 'en', ...loc } },
  { name: 'businesses sub hi', path: '/api/get-all-businesses', as: 'form', body: { slug: 'p3-house-wiring', language: 'hi', cityName: 'लखनऊ', stateName: 'उत्तर प्रदेश' } },
  { name: 'businesses sub no state', path: '/api/get-all-businesses', body: { slug: 'p3-ac-repair', language: 'en', cityName: 'Lucknow' } },
  { name: 'businesses orphan sub hi', path: '/api/get-all-businesses', body: { slug: 'p3-orphan', language: 'hi', ...loc } },
  { name: 'businesses tehsil filter', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', language: 'en', tehsilName: 'Mohanlalganj', ...loc } },
  { name: 'businesses area filter', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', language: 'en', areaName: ['Hazratganj', 'X'], ...loc } },
  { name: 'businesses area string ignored', path: '/api/get-all-businesses', body: { slug: 'p3-house-wiring', language: 'en', areaName: 'Hazratganj', ...loc } },
  { name: 'businesses is_business category', path: '/api/get-all-businesses', token: T(300), body: { slug: 'p3-electricians', is_business: true, language: 'en', ...loc } },
  { name: 'businesses is_business hi', path: '/api/get-all-businesses', body: { slug: 'p3-aardvark', is_business: 1, language: 'hi', ...loc } },
  { name: 'businesses is_business "0" (form)', path: '/api/get-all-businesses', as: 'form', body: { slug: 'p3-house-wiring', is_business: '0', language: 'en', ...loc } },
  { name: 'businesses is_business unknown category', path: '/api/get-all-businesses', body: { slug: 'nope', is_business: true, language: 'en', ...loc } },

  // --- get-all-business-details
  { name: 'details missing slug', path: '/api/get-all-business-details', body: { cityName: 'L', language: 'en' } },
  { name: 'details unknown slug', path: '/api/get-all-business-details', body: { slug: 'nope', cityName: 'L', language: 'en' } },
  { name: 'details bad language', path: '/api/get-all-business-details', body: { slug: 'p3-bright-electric', cityName: 'L', language: 'xx' } },
  { name: 'details en', path: '/api/get-all-business-details', body: { slug: 'p3-bright-electric', cityName: 'L', language: 'en' } },
  { name: 'details hi', path: '/api/get-all-business-details', body: { slug: 'p3-bright-electric', cityName: 'L', language: 'hi' } },
  { name: 'details double-encoded social', path: '/api/get-all-business-details', body: { slug: 'p3-alpha-wiring', cityName: 'L', language: 'en' } },
  { name: 'details invalid social json', path: '/api/get-all-business-details', body: { slug: 'p3-aardvark-shop', cityName: 'L', language: 'hi' } },

  // --- get-about-us
  { name: 'about missing state', path: '/api/get-about-us', body: { cityName: 'Lucknow', language: 'en' } },
  { name: 'about missing city', path: '/api/get-about-us', body: { stateName: 'UP', language: 'en' } },
  { name: 'about bad language', path: '/api/get-about-us', body: { stateName: 'UP', cityName: 'Lucknow', language: 'de' } },
  { name: 'about en', path: '/api/get-about-us', body: { stateName: 'x', cityName: 'Lucknow', language: 'en' } },
  { name: 'about hi', path: '/api/get-about-us', body: { stateName: 'x', cityName: 'लखनऊ', language: 'hi' } },
  { name: 'about null places', path: '/api/get-about-us', body: { stateName: 'x', cityName: 'Kanpur', language: 'en' } },
  { name: 'about not found', path: '/api/get-about-us', body: { stateName: 'x', cityName: 'Jaipur', language: 'en' } },
  { name: 'about unknown city', path: '/api/get-about-us', body: { stateName: 'x', cityName: 'Atlantis', language: 'en' } },

  // --- search-business-sub-category (auth)
  { name: 'search sub no auth', path: '/api/search-business-sub-category', body: { search: 'a' } },
  { name: 'search sub no business user', path: '/api/search-business-sub-category', token: T(301), body: { search: 'a' } },
  { name: 'search sub no location', path: '/api/search-business-sub-category', token: T(302), body: { search: 'a' } },
  { name: 'search sub empty search', path: '/api/search-business-sub-category', token: T(300), body: {} },
  { name: 'search sub undefined method', path: '/api/search-business-sub-category', token: T(300), body: { search: 'wire' } },

  // --- get-all-business-summaries (auth)
  { name: 'summaries no auth', path: '/api/get-all-business-summaries' },
  { name: 'summaries array translation', path: '/api/get-all-business-summaries', token: T(300) },
  { name: 'summaries no business', path: '/api/get-all-business-summaries', token: T(301) },
  { name: 'summaries business without detail', path: '/api/get-all-business-summaries', token: T(302) },
  { name: 'summaries string translation', path: '/api/get-all-business-summaries', token: T(303) },
  { name: 'summaries null column', path: '/api/get-all-business-summaries', token: T(304) },
];
