// Queries and side effects used by the auth / location / device endpoints (Api\AuthController).
import { errorMessage } from '../core/http/response.js';
import { nowDb } from '../core/time.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { insertRow, like, toRow, toRows, type Row } from '../db/mongo.js';
import { AdUserView } from '../models/ad-user-view.model.js';
import { Address } from '../models/address.model.js';
import { Advertisement } from '../models/advertisement.model.js';
import { AppVersion } from '../models/app-version.model.js';
import { Business } from '../models/business.model.js';
import { BusinessCategory } from '../models/business-category.model.js';
import { BusinessSubCategory } from '../models/business-sub-category.model.js';
import { DeviceId } from '../models/device-id.model.js';
import { OtpVerification } from '../models/otp-verification.model.js';
import { Pincode } from '../models/pincode.model.js';
import { User } from '../models/user.model.js';

/** MySQL `col = ?` also matched '5' against 5. */
export const looseValues = (value: unknown) => {
  const numeric =
    typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
  return numeric === null ? [value] : [value, numeric];
};

/** `SELECT field … FROM pincodes WHERE … GROUP BY field ORDER BY field ASC` (case-insensitive like MySQL). */
export async function groupSortedPincodeValues(field: string, match: Row): Promise<unknown[]> {
  const groups = await Pincode.aggregate([{ $match: match }, { $group: { _id: `$${field}` } }, { $sort: { _id: 1 } }]).option({
    collation: CASE_INSENSITIVE,
  });
  return groups.map((group) => group._id);
}

// ---------------------------------------------------------------------------------------------- devices

export async function findDeviceById(deviceId: unknown) {
  return toRow(
    await DeviceId.findOne({ device_id: { $in: looseValues(deviceId) } }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean(),
  );
}

export function insertDevice(row: Row) {
  return insertRow(DeviceId.collection.collectionName, row);
}

export function updateDevice(id: unknown, changes: Row) {
  return DeviceId.updateOne({ _id: id }, { $set: changes });
}

export function countDevices() {
  return DeviceId.countDocuments();
}

export async function findFirstAppVersion() {
  return toRow(await AppVersion.findOne({}, null, { sort: { _id: 1 } }).lean());
}

// ---------------------------------------------------------------------------------------------- OTP / login

/** Http::get() to the SMS gateway; failures are only logged. */
export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  try {
    const params = new URLSearchParams({
      username: 'pocketdd.trans',
      password: 'Aap8T',
      unicode: 'false',
      from: 'PCKTDD',
      to: phone,
      dltprincipalEntityId: '1701177038480287944',
      dltContentId: '1707177048941889259',
      text: `${otp} is your OTP to securely login to PocketDD. Valid for 10 minutes. Never share your OTP with anyone.`,
    });
    await fetch(`https://msg.smsguruonline.com/fe/api/v1/send?${params}`, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    console.error('Failed to send SMS', { phone, error: errorMessage(error) });
  }
}

export function insertOtpVerification(phone: string, otp: string) {
  const now = nowDb();
  return insertRow(OtpVerification.collection.collectionName, { phone_number: phone, otp, created_at: now, updated_at: now });
}

export async function findLatestOtp(phone: string) {
  return toRow(await OtpVerification.findOne({ phone_number: phone }, null, { collation: CASE_INSENSITIVE, sort: { _id: -1 } }).lean());
}

export async function findUserByPhone(phone: string) {
  return toRow(await User.findOne({ phone }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean());
}

export async function findActiveUserByPhone(phone: string) {
  return toRow(await User.findOne({ phone, status: 1 }, null, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean());
}

export function updateUser(id: unknown, changes: Row) {
  return User.updateOne({ _id: id }, { $set: changes });
}

export function insertUser(row: Row) {
  return insertRow(User.collection.collectionName, row);
}

export function findBusinessIdOfUser(userId: unknown) {
  return Business.findOne({ user_id: userId }, { _id: 1 }).lean();
}

// ---------------------------------------------------------------------------------------------- categories

export function findActiveCategories(orderByField: string) {
  return BusinessCategory.find({ status: 1 }, null, { collation: CASE_INSENSITIVE, sort: { [orderByField]: 1, _id: 1 } }).lean<Row[]>();
}

export function countActiveSubCategories(categoryId: unknown) {
  return BusinessSubCategory.countDocuments({ parent_id: categoryId, status: 1 });
}

// ---------------------------------------------------------------------------------------------- locations

export async function findPincodesByStateCity(stateField: string, cityField: string, state: string, city: string) {
  return toRows(await Pincode.find({ [stateField]: like(state), [cityField]: like(city) }, null, { sort: { _id: 1 } }).lean());
}

/** Hindi → English state/city lookup used by the tehsil endpoints. */
export async function englishStateCity(input: Record<string, unknown>): Promise<{ state: unknown; city: unknown }> {
  if (input.language === 'en') return { state: input.state ?? null, city: input.city ?? null };
  const statePincode = await Pincode.findOne({ state_hi: like(String(input.state)) }, { state: 1 }, { sort: { _id: 1 } }).lean<Row>();
  const cityPincode = await Pincode.findOne(
    { city_hi: { $in: looseValues(input.city ?? null) } },
    { city: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Row>();
  return { state: statePincode?.state ?? null, city: cityPincode?.city ?? null };
}

export function findAddressByPincode(state: unknown, city: unknown, pincode: unknown) {
  return Address.findOne(
    { state: state ?? null, city: city ?? null, pincode_id: { $in: looseValues(pincode) } },
    null,
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Row>();
}

export function findAddressFieldByStateCity(state: unknown, city: unknown, field: string) {
  return Address.find({ city: city ?? null, state: state ?? null }, { [field]: 1 }, { collation: CASE_INSENSITIVE, sort: { _id: 1 } }).lean<
    Row[]
  >();
}

export function findAddressAreas(state: unknown, city: unknown, tehsil: unknown) {
  return Address.find(
    { state: { $in: looseValues(state) }, city: { $in: looseValues(city) }, tehsil: { $in: looseValues(tehsil) } },
    { area: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Row[]>();
}

/** First pincode matching an `$expr`, with both language names of its state and city. */
export function findPincodeNamesByExpr(expression: Row) {
  return Pincode.findOne(
    { $expr: expression },
    { _id: 0, state: 1, state_hi: 1, city: 1, city_hi: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean<Row>();
}

// ---------------------------------------------------------------------------------------------- ads

export function findBusinessIdsInCity(stateName: unknown, cityName: unknown) {
  return Business.find(
    { state_en: { $in: looseValues(stateName) }, dist_en: { $in: looseValues(cityName) } },
    { _id: 1 },
    { collation: CASE_INSENSITIVE },
  ).lean<Row[]>();
}

export function findAdViewsOfDevice(deviceId: unknown) {
  return AdUserView.find({ device_id: { $in: looseValues(deviceId) } }, { ad_id: 1 }, { collation: CASE_INSENSITIVE }).lean<Row[]>();
}

/** Active home popups of the given businesses, excluding already seen ads. */
export async function findUnseenPopupAds(businessIds: number[], seenAdIds: unknown[]) {
  return toRows(
    await Advertisement.find(
      {
        ads_position: 'home',
        ads_location: 'Popup',
        status: 1,
        $expr: { $in: [{ $convert: { input: '$client_name', to: 'double', onError: null, onNull: null } }, businessIds] },
        _id: { $nin: seenAdIds },
      },
      { _id: 1, advt_img: 1 },
      { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
    ).lean(),
  );
}

export function countAdViews(deviceId: unknown, adId: number | null) {
  return AdUserView.countDocuments({ device_id: { $in: looseValues(deviceId) }, ad_id: adId }, { collation: CASE_INSENSITIVE, limit: 1 });
}

export function insertAdView(row: Row) {
  return insertRow(AdUserView.collection.collectionName, row);
}
