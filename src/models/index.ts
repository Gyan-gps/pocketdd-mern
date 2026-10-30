// Every Mongoose model, plus the lookups that map the old Laravel/MySQL table names onto them.
import type { Model, Schema } from 'mongoose';
import { AboutUs } from './about-us.model.js';
import { AdUserView } from './ad-user-view.model.js';
import { Address } from './address.model.js';
import { Administrator } from './administrator.model.js';
import { Advertisement } from './advertisement.model.js';
import { ApiFailure } from './api-failure.model.js';
import { AppVersion } from './app-version.model.js';
import { Business } from './business.model.js';
import { BusinessCategory } from './business-category.model.js';
import { BusinessRequest } from './business-request.model.js';
import { BusinessSubCategory } from './business-sub-category.model.js';
import { BusinessUser } from './business-user.model.js';
import { CityHelplineNumber } from './city-helpline-number.model.js';
import { Counter } from './counter.model.js';
import { Department } from './department.model.js';
import { Designation } from './designation.model.js';
import { DeviceId } from './device-id.model.js';
import { Event } from './event.model.js';
import { LanguageLine } from './language-line.model.js';
import { Location } from './location.model.js';
import { OrphanRow } from './orphan-row.model.js';
import { OtpVerification } from './otp-verification.model.js';
import { PersonalAccessToken } from './personal-access-token.model.js';
import { Pincode } from './pincode.model.js';
import { QueueJob } from './queue-job.model.js';
import { Slider } from './slider.model.js';
import { User } from './user.model.js';
import { UserNotification } from './user-notification.model.js';

export {
  AboutUs,
  AdUserView,
  Address,
  Administrator,
  Advertisement,
  ApiFailure,
  AppVersion,
  Business,
  BusinessCategory,
  BusinessRequest,
  BusinessSubCategory,
  BusinessUser,
  CityHelplineNumber,
  Counter,
  Department,
  Designation,
  DeviceId,
  Event,
  LanguageLine,
  Location,
  OrphanRow,
  OtpVerification,
  PersonalAccessToken,
  Pincode,
  QueueJob,
  Slider,
  User,
  UserNotification,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModel = Model<any>;

/** Models of the migrated MySQL tables (excludes the internal `counters` / `_orphans` collections). */
export const TABLE_MODELS: AnyModel[] = [
  User, PersonalAccessToken, Business, BusinessCategory, BusinessSubCategory, BusinessUser, BusinessRequest, Location,
  Pincode, Address, Advertisement, AdUserView, Event, Department, Designation, Administrator, CityHelplineNumber,
  AboutUs, Slider, UserNotification, DeviceId, OtpVerification, ApiFailure, QueueJob, LanguageLine, AppVersion,
];

export const ALL_MODELS: AnyModel[] = [...TABLE_MODELS, Counter, OrphanRow];

/** Old MySQL table name of a model (`advertisments` for Advertisement, `businesse_requests`, …). */
export const sqlTableOf = (model: AnyModel): string => (model.schema as Schema & { options: { sqlTable: string } }).options.sqlTable;

/** Old MySQL table name → model. */
export const MODEL_BY_TABLE: Record<string, AnyModel> = Object.fromEntries(TABLE_MODELS.map((model) => [sqlTableOf(model), model]));

/** Collection name → model. */
export const MODEL_BY_COLLECTION: Record<string, AnyModel> = Object.fromEntries(ALL_MODELS.map((model) => [model.collection.collectionName, model]));

/** Child tables stored as embedded arrays: old table → parent model, array field and old parent-id column. */
export interface EmbeddedTableInfo {
  table: string;
  parentModel: AnyModel;
  field: string;
  foreignKey: string;
  schema: Schema;
}

export const EMBEDDED_TABLES: Record<string, EmbeddedTableInfo> = Object.fromEntries(
  TABLE_MODELS.flatMap((parentModel) =>
    Object.entries(parentModel.schema.paths)
      .filter(([, path]) => (path.options as { embeddedTable?: string }).embeddedTable)
      .map(([field, path]) => {
        const options = path.options as { embeddedTable: string; foreignKey: string; type: Schema[] };
        return [
          options.embeddedTable,
          { table: options.embeddedTable, parentModel, field, foreignKey: options.foreignKey, schema: options.type[0]! },
        ];
      }),
  ),
);

/** Model for a collection name or an old table name. Throws for unknown names (a programming error). */
export function modelFor(name: string): AnyModel {
  const model = MODEL_BY_COLLECTION[name] ?? MODEL_BY_TABLE[name];
  if (!model) throw new Error(`No model for collection or table "${name}"`);
  return model;
}
