// Port of App\Http\Controllers\Api\AuthController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { hashCheck, hashMake } from '../core/auth/hash.js';
import { createToken, deleteAllTokens } from '../core/auth/access-tokens.js';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { logApiFailure } from '../core/logging/api-failure.js';
import { nowDb } from '../core/time.js';
import { appUrl, url } from '../core/url.js';
import { validateRequest } from '../core/validation/validator.js';
import { like, type Row } from '../db/mongo.js';
import { newUserRow, serializeUser } from '../serializers/user.serializer.js';
import {
  countActiveSubCategories,
  countAdViews,
  countDevices,
  englishStateCity,
  findActiveCategories,
  findActiveUserByPhone,
  findAddressAreas,
  findAddressByPincode,
  findAddressFieldByStateCity,
  findAdViewsOfDevice,
  findBusinessIdOfUser,
  findBusinessIdsInCity,
  findDeviceById,
  findFirstAppVersion,
  findLatestOtp,
  findPincodeNamesByExpr,
  findPincodesByStateCity,
  findUnseenPopupAds,
  findUserByPhone,
  groupSortedPincodeValues,
  insertAdView,
  insertDevice,
  insertOtpVerification,
  insertUser,
  sendOtpSms,
  updateDevice,
  updateUser,
} from '../services/auth.service.js';
import {
  allCategoriesValidation,
  areaByTehsilsValidation,
  changeLocationNameValidation,
  pincodeByStateCityValidation,
  popupAdsValidation,
  saveAdViewValidation,
  sendLoginOtpValidation,
  statesCitiesValidation,
  storeDeviceIdValidation,
  tehsilsByStateCityValidation,
  tehsilsValidation,
  verifyMobileOtpValidation,
} from '../validators/auth.validator.js';

const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** Laravel Collection::unique() on scalars (keeps first occurrence). */
function unique<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item ?? null);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** POST store-device-id — DeviceId::updateOrCreate(). */
export async function storeDeviceId(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, storeDeviceIdValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const attributes = {
      device_model: nullableString(input.device_model),
      android_version: nullableString(input.android_version),
      app_version: nullableString(input.app_version),
    };
    const existing = await findDeviceById(input.device_id);
    let message: string;
    if (!existing) {
      const now = nowDb();
      await insertDevice({
        device_id: nullableString(input.device_id),
        device_model: attributes.device_model,
        android_version: attributes.android_version,
        app_version: attributes.app_version,
        created_at: now,
        updated_at: now,
      });
      console.info('New device registered.', { device_id: input.device_id, ...attributes });
      message = 'Device stored (new install)';
    } else {
      // Eloquent only writes (and touches updated_at) when an attribute actually changed.
      const dirty = Object.entries(attributes).filter(([key, value]) => nullableString(existing[key]) !== value);
      if (dirty.length) {
        await updateDevice(existing.id, { ...Object.fromEntries(dirty), updated_at: nowDb() });
      }
      console.info('Device already exists and was updated.', { device_id: input.device_id, ...attributes });
      message = 'Device already exists';
    }
    return sendResponse(true, message, {});
  } catch (error) {
    console.error('error in storeDeviceId()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** GET install-count. */
export async function getInstallCount() {
  try {
    const total = await countDevices();
    return sendResponse(true, 'Install count fetched', { total_installs: total });
  } catch (error) {
    console.error('error in getInstallCount()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-app-info — no try/catch in PHP: DB errors bubble up to the failure logger. */
export async function checkAppVersion() {
  const version = await findFirstAppVersion();
  if (!version) return { status: false, message: 'Version details not found.' };
  return {
    status: true,
    data: {
      is_show_in_app_update: Boolean(Number(version.is_show_in_app_update)),
      current_version_code: Math.trunc(Number(version.current_version_code)) || 0,
      current_version_name: version.current_version_name,
      is_force_update: Boolean(Number(version.is_force_update)),
      description: version.description,
    },
  };
}

/** POST auth/send-login-otp. */
export async function sendLoginOtp(req: Request) {
  try {
    const validation = await validateRequest(req.input, sendLoginOtpValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const phone = String(req.input.phone);
    const otp = ['7877221554', '9982499155'].includes(phone)
      ? '12345'
      : String(crypto.randomInt(0, 100000)).padStart(5, '0');

    await sendOtpSms(phone, otp);

    await insertOtpVerification(phone, otp);
    return sendResponse(true, 'Login OTP sent successfully');
  } catch (error) {
    console.error('error in otp generation', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

/** POST verify-mobile-otp — logs in (or registers) the user and issues a Sanctum token. */
export async function verifyMobileOtp(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, verifyMobileOtpValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const phone = String(input.phone);
    const otp = input.client_otp;
    const fcmToken = input.fcm_token ?? null;

    const latestOtp = await findLatestOtp(phone);
    // PHP strict `!==`: a JSON number OTP never equals the stored string.
    if (!latestOtp || latestOtp.otp !== otp) return sendResponse(false, 'Invalid OTP.');

    const language = 'en';
    let newUser = false;
    let isBusinessExists = false;

    const existing = await findUserByPhone(phone);
    if (existing) {
      await updateUser(existing.id, { password: await hashMake(phone), updated_at: nowDb(), fcm_token: nullableString(fcmToken) });
      const business = await findBusinessIdOfUser(existing.id);
      if (business) isBusinessExists = true;
      newUser = false;
    } else {
      const now = nowDb();
      await insertUser(
        newUserRow({
          phone,
          password: await hashMake(phone),
          status: 1,
          is_mobile_user: 1,
          fcm_token: nullableString(fcmToken),
          created_at: now,
          updated_at: now,
        }),
      );
      newUser = true;
    }

    // Auth::attempt(['phone' => $phone, 'password' => $phone, 'status' => 1])
    const user = await findActiveUserByPhone(phone);
    if (!user || !(await hashCheck(phone, user.password as string))) {
      return sendResponse(false, 'You are not registered user, Please contact to Admin for registration.');
    }

    const userJson = serializeUser(user);
    userJson.new_user = newUser;
    userJson.user_icon = user.user_icon ? url(req, String(user.user_icon)) : null;
    const token = await createToken(Number(user.id), 'auth_token');

    return sendResponse(true, 'User logged in', {
      token,
      user: userJson,
      language,
      cityName: user.district,
      stateName: user.state,
      is_business_exists: isBusinessExists,
    });
  } catch (error) {
    console.error('error in verifyMobileOtp()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST user-logout — revokes every token of the user. */
export async function userLogout(req: Request) {
  try {
    await deleteAllTokens(Number(req.user!.id));
    return sendResponse(true, 'User logged out successfully');
  } catch (error) {
    console.error('error in userLogout', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** Language switch used by most location endpoints: 'en' → English column, anything else → `_hi`. */
const languageField = (language: unknown, englishField: string) => (language === 'en' ? englishField : `${englishField}_hi`);

/** POST get-all-states — only Uttar Pradesh is exposed. */
export async function getAllStates(req: Request) {
  try {
    const language = req.input.language ?? 'en';
    const field = languageField(language, 'state');
    const stateName = language === 'en' ? 'Uttar Pradesh' : 'उत्तर प्रदेश';
    const stateNames = await groupSortedPincodeValues(field, {
      $and: [{ [field]: { $ne: null } }, { [field]: { $ne: '#VALUE!' } }, { [field]: stateName }],
    });
    const states = unique(stateNames).map((state) => ({ key: state, label: state }));
    return sendResponse(true, 'States list', { states });
  } catch (error) {
    console.error('error in getAllStates()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-all-states-cities. */
export async function getAllStatesCities(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, statesCitiesValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const state = input.state;
    const language = input.language ?? 'en';
    const field = languageField(language, 'city');
    const stateField = languageField(language, 'state');
    const cityNames = await groupSortedPincodeValues(field, {
      [stateField]: like(String(state)),
      $and: [{ [field]: { $ne: null } }, { [field]: { $ne: '#VALUE!' } }],
    });
    const cities = unique(cityNames).map((city) => ({ key: city, label: city }));
    return sendResponse(true, `Cities List as per ${state}`, { cities, state });
  } catch (error) {
    console.error('error in getAllStatesCities()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-all-categories. */
export async function getAllCategories(req: Request) {
  try {
    // Present in the Laravel source (AuthController.php line 516): the endpoint always fails.
    throw new Error('Testing API error logging');

    const input = req.input;
    const validation = await validateRequest(input, allCategoriesValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const field = input.language === 'en' ? 'name' : 'name_hi';
    const activeCategories = await findActiveCategories(field);
    const rows: Row[] = [];
    for (const category of activeCategories) {
      const subcategories_count = await countActiveSubCategories(category._id);
      rows.push({
        id: category._id,
        name: category[field],
        slug: category.slug,
        status: category.status,
        img: category.img,
        subcategories_count,
      });
    }
    const categories = rows.map((row: Row) => ({
      ...row,
      category_icon: row.img ? appUrl(String(row.img)) : null,
      category_name: categoryName(row.name),
    }));
    return sendResponse(true, 'Categories list retrieved successfully.', { categories, cityName: input.cityName });
  } catch (error) {
    console.error('Error in getAllCategories()', { message: errorMessage(error) });
    await logApiFailure(error, req, { deviceHeader: 'x-device-id' });
    return sendCatchLog(errorMessage(error));
  }
}

/** BusinessCategory::getCategoryNameAttribute(). */
export function categoryName(name: unknown): string {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') return String((name as Record<string, unknown>).en ?? '');
  return '';
}

/** POST get-pincode-by-state-city. */
export async function getPinCodeByStateCity(req: Request) {
  try {
    const input = req.input;
    const stateField = languageField(input.language, 'state');
    const cityField = languageField(input.language, 'city');
    const validation = await validateRequest(input, pincodeByStateCityValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const pincodes = await findPincodesByStateCity(stateField, cityField, String(input.state), String(input.city));
    const seen = new Set<string>();
    const data = pincodes
      .filter((pincode) => {
        const key = String(pincode.pin_code);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((pincode) => ({ id: pincode.id, pin_code: pincode.pin_code }));
    return sendResponse(true, 'PinCode List Fetched Successfully', { data });
  } catch (error) {
    console.error('error in getPinCodeByStateCity()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-tehsils-by-state-city. */
export async function getTehsilsByStateCity(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, tehsilsByStateCityValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const { state, city } = await englishStateCity(input);
    // `pincode_id = NULL` never matches.
    const address = input.pincode === null || input.pincode === undefined ? null : await findAddressByPincode(state, city, input.pincode);
    if (address) {
      const tehsil = input.language === 'en' ? address.tehsil : address.tehsil_hi;
      return sendResponse(true, 'Tehsils fetched successfully', { data: tehsil });
    }
    return sendResponse(true, 'Tehsils Not Found', { data: '' });
  } catch (error) {
    console.error('error in getTehsilsByStateCity()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-tehsils. */
export async function getTehsils(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, tehsilsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const field = languageField(input.language, 'tehsil');
    const { state, city } = await englishStateCity(input);
    const addresses = await findAddressFieldByStateCity(state, city, field);
    const data = unique(addresses.map((address) => address[field] ?? null)).map((tehsil) => ({ key: tehsil, label: tehsil }));
    return sendResponse(true, 'Tehsils fetched successfully', { data });
  } catch (error) {
    console.error('error in getTehsils()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** Address `area` cast => array. */
function decodeArea(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  // Stored natively now (a string is a decoded JSON string literal).
  return raw;
}

/** POST get-area-by-tehsils. */
export async function getAreaByTehsils(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, areaByTehsilsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const addresses = await findAddressAreas(input.state, input.city, input.tehsil);
    const data = addresses
      .map((address) => decodeArea(address.area))
      .filter((area) => area && (typeof area !== 'object' || Object.keys(area).length)) // Collection::filter()
      .flatMap((areas) => {
        const list = typeof areas === 'object' ? Object.values(areas as object) : [areas];
        return list.map((area) => {
          // PHP: string offset on a string throws TypeError (not caught by catch (Exception));
          // offsets on other scalars just yield null.
          if (typeof area === 'string') throw new PhpError('Cannot access offset of type string on string');
          if (typeof area !== 'object' || area === null) return { area_name: null };
          return { area_name: (area as Record<string, unknown>).area_name ?? null };
        });
      });

    if (!data.length) return sendResponse(true, 'Areas not found', { data: [] });
    return sendResponse(true, 'Success', { data });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('error in getTehsils()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST change-location-name-as-per-language — returns a bare `{state, city}` on success. */
export async function changeLocationNameAsPerLanguage(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, changeLocationNameValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const stateField = languageField(input.language, 'state');
    const cityField = languageField(input.language, 'city');
    const cityName = String(input.cityName ?? '').trim();
    const stateName = String(input.stateName ?? '').trim();
    // TRIM(col) = ? (MySQL TRIM strips spaces only).
    const trimmedEquals = (field: string, value: string) => ({ $eq: [{ $trim: { input: `$${field}`, chars: ' ' } }, value] });

    let pincode = await findPincodeNamesByExpr({ $and: [trimmedEquals(stateField, stateName), trimmedEquals(cityField, cityName)] });
    if (!pincode) {
      pincode = await findPincodeNamesByExpr({
        $and: [
          { $or: [trimmedEquals('state', stateName), trimmedEquals('state_hi', stateName)] },
          { $or: [trimmedEquals('city', cityName), trimmedEquals('city_hi', cityName)] },
        ],
      });
    }
    if (pincode) {
      return {
        state: input.language === 'en' ? pincode.state : pincode.state_hi,
        city: input.language === 'en' ? pincode.city : pincode.city_hi,
      };
    }
    return sendResponse(false, 'Location not found.');
  } catch (error) {
    console.error('error in changeLocationNameAsPerLanguage()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST popup-ads — active home popups for businesses in the city that this device has not seen. */
export async function getPopupAds(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, popupAdsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const businesses = await findBusinessIdsInCity(input.stateName, input.cityName);
    if (!businesses.length) return sendResponse(true, 'No popup ads found', { ads: [] });

    const seenViews = await findAdViewsOfDevice(input.device_id);
    // client_name is a varchar compared with integer ids: MySQL compared numerically.
    const businessIds = businesses.map((business) => business._id as unknown as number);
    const ads = await findUnseenPopupAds(
      businessIds,
      seenViews.map((view) => view.ad_id).filter((adId) => adId !== null && adId !== undefined),
    );
    return sendResponse(true, 'Popup ads fetched successfully', {
      ads: ads.map((ad) => ({ id: ad.id, advt_img: ad.advt_img ? url(req, String(ad.advt_img)) : null })),
    });
  } catch (error) {
    console.error('Error in getPopupAds()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST save-ad-view — INSERT IGNORE one row per ad. */
export async function saveAdView(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, saveAdViewValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const now = nowDb();
    const adIds = Object.values(input.ad_ids as Record<string, unknown>);
    // INSERT IGNORE on the unique (device_id, ad_id) key.
    for (const rawAdId of adIds) {
      const ad_id = rawAdId === null || rawAdId === undefined ? null : Number(rawAdId);
      const duplicates = await countAdViews(input.device_id, ad_id);
      if (duplicates) continue;
      await insertAdView({ device_id: nullableString(input.device_id), ad_id, created_at: now, updated_at: now });
    }
    return sendResponse(true, 'Ad views saved successfully');
  } catch (error) {
    console.error('Error in saveAdView()', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}
