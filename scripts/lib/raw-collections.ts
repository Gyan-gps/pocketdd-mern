// Raw collection access for the MySQL migration script and the test fixtures, which work below the model layer
// (they write documents exactly as migrated). Application code uses the Mongoose models in src/models instead.
import type { Collection, Document } from 'mongodb';
import { connectDatabase, disconnectDatabase, mongoose } from '../../src/config/database.js';
import type { Row } from '../../src/db/mongo.js';

/** Connect (idempotent). */
export async function connectMongo(): Promise<void> {
  await connectDatabase();
}

/** Close the connection. */
export async function closeMongo() {
  await disconnectDatabase();
}

/**
 * Raw collection handle; operations issued before the connection opens are buffered by Mongoose.
 */
export function col<T extends Document = Row>(name: string): Collection<T> {
  void connectDatabase();
  return mongoose.connection.collection(name) as unknown as Collection<T>;
}

/**
 * Collection names (old MySQL table → collection).
 */
export const C = {
  users: 'users',
  tokens: 'personal_access_tokens',
  businesses: 'businesses', // + details[], images[], locations[], owners[]
  businessCategories: 'business_categories',
  businessSubCategories: 'business_sub_categories',
  businessUsers: 'business_users', // + locations[] (was business_users_location)
  businessRequests: 'business_requests', // was businesse_requests
  locations: 'locations',
  pincodes: 'pincodes',
  addresses: 'addresses',
  advertisements: 'advertisements', // was advertisments; + subcategories[] (was advertisment_subcategory)
  adUserViews: 'ad_user_views',
  events: 'events', // + details[] (was event_details), locations[] (was event_locations)
  departments: 'departments',
  designations: 'designations',
  administrators: 'administrators',
  cityHelplines: 'city_helpline_numbers',
  aboutUs: 'about_uses',
  sliders: 'sliders',
  userNotifications: 'user_notifications',
  deviceIds: 'device_ids',
  otpVerifications: 'otp_verifications',
  apiFailures: 'api_failures',
  jobs: 'jobs', // was node_jobs
  languageLines: 'language_lines',
  appVersions: 'app_versions',
  counters: 'counters',
} as const;

/**
 * Embedded child arrays: old table → where its rows live now. `fk` is the old parent-id column.
 */
export const EMBEDDED = {
  business_details: { parent: C.businesses, field: 'details', fk: 'business_id' },
  business_iamges: { parent: C.businesses, field: 'images', fk: 'business_id' },
  business_locations: { parent: C.businesses, field: 'locations', fk: 'business_id' },
  business_owners: { parent: C.businesses, field: 'owners', fk: 'business_id' },
  business_users_location: { parent: C.businessUsers, field: 'locations', fk: 'business_user_id' },
  advertisment_subcategory: { parent: C.advertisements, field: 'subcategories', fk: 'advertisment_id' },
  event_details: { parent: C.events, field: 'details', fk: 'event_id' },
  event_locations: { parent: C.events, field: 'locations', fk: 'event_id' },
} as const;
export type EmbeddedTable = keyof typeof EMBEDDED;

/**
 * Old MySQL table name → collection (for `exists:`/`unique:` rules and other table-name strings).
 */
export const TABLE_COLLECTION: Record<string, string> = {
  ...Object.fromEntries(Object.values(C).map((name) => [name, name])),
  businesse_requests: C.businessRequests,
  advertisments: C.advertisements,
  node_jobs: C.jobs,
};

