// Port of App\Http\Controllers\Api\AuthController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import crypto from 'node:crypto';
import type { Request } from 'express';
import { hashCheck, hashMake } from '../../core/auth/hash.js';
import { createToken, deleteAllTokens } from '../../core/auth/sanctum.js';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { logApiFailure } from '../../core/logging/apiFailure.js';
import { nowDb } from '../../core/time.js';
import { appUrl, url } from '../../core/url.js';
import { validate } from '../../core/validation/validator.js';
import { all, exec, first, type Row } from '../../db/pool.js';
import { serializeUser } from '../../models/user.js';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Laravel Collection::unique() on scalars (keeps first occurrence). */
function unique<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = JSON.stringify(i ?? null);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** POST store-device-id — DeviceId::updateOrCreate(). */
export async function storeDeviceId(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { device_id: 'required' }, { 'device_id.required': 'Device ID is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const attrs = {
      device_model: str(input.device_model),
      android_version: str(input.android_version),
      app_version: str(input.app_version),
    };
    const existing = await first('SELECT * FROM device_ids WHERE device_id = ? LIMIT 1', [input.device_id]);
    let message: string;
    if (!existing) {
      const now = nowDb();
      await exec(
        `INSERT INTO device_ids (device_id, device_model, android_version, app_version, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.device_id, attrs.device_model, attrs.android_version, attrs.app_version, now, now],
      );
      console.info('New device registered.', { device_id: input.device_id, ...attrs });
      message = 'Device stored (new install)';
    } else {
      // Eloquent only writes (and touches updated_at) when an attribute actually changed.
      const dirty = Object.entries(attrs).filter(([k, val]) => str(existing[k]) !== val);
      if (dirty.length) {
        const sets = dirty.map(([k]) => `${k} = ?`).join(', ');
        await exec(`UPDATE device_ids SET ${sets}, updated_at = ? WHERE id = ?`, [
          ...dirty.map(([, val]) => val),
          nowDb(),
          existing.id,
        ]);
      }
      console.info('Device already exists and was updated.', { device_id: input.device_id, ...attrs });
      message = 'Device already exists';
    }
    return sendResponse(true, message, {});
  } catch (e) {
    console.error('error in storeDeviceId()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** GET install-count. */
export async function getInstallCount() {
  try {
    const row = await first('SELECT COUNT(*) AS c FROM device_ids');
    return sendResponse(true, 'Install count fetched', { total_installs: Number(row?.c ?? 0) });
  } catch (e) {
    console.error('error in getInstallCount()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-app-info — no try/catch in PHP: DB errors bubble up to the failure logger. */
export async function checkAppVersion() {
  const version = await first('SELECT * FROM app_versions LIMIT 1');
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

/** Http::get() to the SMS gateway; failures are only logged. */
async function sendOtpViaSms(phone: string, otp: string): Promise<void> {
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
  } catch (e) {
    console.error('Failed to send SMS', { phone, error: errorMessage(e) });
  }
}

/** POST auth/send-login-otp. */
export async function sendLoginOtp(req: Request) {
  try {
    const v = await validate(req.input, { phone: 'required|digits:10' }, {
      'phone.required': 'Phone number is required.',
      'phone.digits': 'Phone number must be 10 digits.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const phone = String(req.input.phone);
    const otp = ['7877221554', '9982499155'].includes(phone)
      ? '12345'
      : String(crypto.randomInt(0, 100000)).padStart(5, '0');

    await sendOtpViaSms(phone, otp);

    const now = nowDb();
    await exec('INSERT INTO otp_verifications (phone_number, otp, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      phone,
      otp,
      now,
      now,
    ]);
    return sendResponse(true, 'Login OTP sent successfully');
  } catch (e) {
    console.error('error in otp generation', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

/** POST verify-mobile-otp — logs in (or registers) the user and issues a Sanctum token. */
export async function verifyMobileOtp(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { phone: 'required|digits:10', client_otp: 'required' }, {
      'phone.required': 'Phone number is required.',
      'client_otp.required': 'OTP is required.',
      'phone.digits': 'Phone number must be 10 digits.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const phone = String(input.phone);
    const otp = input.client_otp;
    const fcmToken = input.fcm_token ?? null;

    const latestOtp = await first(
      'SELECT * FROM otp_verifications WHERE phone_number = ? ORDER BY id DESC LIMIT 1',
      [phone],
    );
    // PHP strict `!==`: a JSON number OTP never equals the stored string.
    if (!latestOtp || latestOtp.otp !== otp) return sendResponse(false, 'Invalid OTP.');

    const language = 'en';
    let newUser = false;
    let isBusinessExists = false;

    const existing = await first('SELECT * FROM users WHERE phone = ? LIMIT 1', [phone]);
    if (existing) {
      await exec('UPDATE users SET password = ?, updated_at = ?, fcm_token = ? WHERE id = ?', [
        await hashMake(phone),
        nowDb(),
        fcmToken,
        existing.id,
      ]);
      const business = await first('SELECT id FROM businesses WHERE user_id = ? LIMIT 1', [existing.id]);
      if (business) isBusinessExists = true;
      newUser = false;
    } else {
      const now = nowDb();
      await exec(
        `INSERT INTO users (phone, password, status, is_mobile_user, fcm_token, created_at, updated_at)
         VALUES (?, ?, 1, 1, ?, ?, ?)`,
        [phone, await hashMake(phone), fcmToken, now, now],
      );
      newUser = true;
    }

    // Auth::attempt(['phone' => $phone, 'password' => $phone, 'status' => 1])
    const user = await first('SELECT * FROM users WHERE phone = ? AND status = 1 LIMIT 1', [phone]);
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
  } catch (e) {
    console.error('error in verifyMobileOtp()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST user-logout — revokes every token of the user. */
export async function userLogout(req: Request) {
  try {
    await deleteAllTokens(Number(req.user!.id));
    return sendResponse(true, 'User logged out successfully');
  } catch (e) {
    console.error('error in userLogout', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Language switch used by most location endpoints: 'en' → English column, anything else → `_hi`. */
const col = (language: unknown, en: string) => (language === 'en' ? en : `${en}_hi`);

/** POST get-all-states — only Uttar Pradesh is exposed. */
export async function getAllStates(req: Request) {
  try {
    const language = req.input.language ?? 'en';
    const field = col(language, 'state');
    const stateName = language === 'en' ? 'Uttar Pradesh' : 'उत्तर प्रदेश';
    const rows = await all(
      `SELECT \`${field}\` AS v FROM pincodes
        WHERE \`${field}\` IS NOT NULL AND \`${field}\` != '#VALUE!' AND \`${field}\` = ?
        GROUP BY \`${field}\` ORDER BY \`${field}\` ASC`,
      [stateName],
    );
    const states = unique(rows.map((r) => r.v)).map((s) => ({ key: s, label: s }));
    return sendResponse(true, 'States list', { states });
  } catch (e) {
    console.error('error in getAllStates()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-all-states-cities. */
export async function getAllStatesCities(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { state: 'required' }, { 'state.required': 'State is required.' });
    if (v.fails()) return sendResponse(false, v.first());

    const state = input.state;
    const language = input.language ?? 'en';
    const field = col(language, 'city');
    const stateField = col(language, 'state');
    const rows = await all(
      `SELECT \`${field}\` AS v FROM pincodes
        WHERE \`${stateField}\` LIKE ? AND \`${field}\` IS NOT NULL AND \`${field}\` != '#VALUE!'
        GROUP BY \`${field}\` ORDER BY \`${field}\` ASC`,
      [`%${state}%`],
    );
    const cities = unique(rows.map((r) => r.v)).map((c) => ({ key: c, label: c }));
    return sendResponse(true, `Cities List as per ${state}`, { cities, state });
  } catch (e) {
    console.error('error in getAllStatesCities()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-all-categories. */
export async function getAllCategories(req: Request) {
  try {
    // Present in the Laravel source (AuthController.php line 516): the endpoint always fails.
    throw new Error('Testing API error logging');

    const input = req.input;
    const v = await validate(input, { cityName: 'required', language: 'required' }, {
      'cityName.required': 'Location is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const field = input.language === 'en' ? 'name' : 'name_hi';
    const rows = await all(
      `SELECT c.id, c.\`${field}\` AS name, c.slug, c.status, c.img,
              (SELECT COUNT(*) FROM business_sub_categories s WHERE s.parent_id = c.id AND s.status = 1) AS subcategories_count
         FROM business_categories c WHERE c.status = 1 ORDER BY c.\`${field}\` ASC`,
    );
    const categories = rows.map((r: Row) => ({
      ...r,
      category_icon: r.img ? appUrl(String(r.img)) : null,
      category_name: categoryName(r.name),
    }));
    return sendResponse(true, 'Categories list retrieved successfully.', { categories, cityName: input.cityName });
  } catch (e) {
    console.error('Error in getAllCategories()', { message: errorMessage(e) });
    await logApiFailure(e, req, { deviceHeader: 'x-device-id' });
    return sendCatchLog(errorMessage(e));
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
    const stateCol = col(input.language, 'state');
    const cityCol = col(input.language, 'city');
    const v = await validate(input, { state: 'required|string', city: 'required|string', language: 'required' }, {
      'state.required': 'State is required.',
      'state.exists': 'State is invalid.',
      'city.required': 'City is required.',
      'city.exists': 'City is required.',
      'language.required': 'Language is required.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const rows = await all(`SELECT * FROM pincodes WHERE \`${stateCol}\` LIKE ? AND \`${cityCol}\` LIKE ?`, [
      `%${input.state}%`,
      `%${input.city}%`,
    ]);
    const seen = new Set<string>();
    const data = rows
      .filter((r) => {
        const k = String(r.pin_code);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((r) => ({ id: r.id, pin_code: r.pin_code }));
    return sendResponse(true, 'PinCode List Fetched Successfully', { data });
  } catch (e) {
    console.error('error in getPinCodeByStateCity()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Hindi → English state/city lookup used by the tehsil endpoints. */
async function englishStateCity(input: Record<string, unknown>): Promise<{ state: unknown; city: unknown }> {
  if (input.language === 'en') return { state: input.state ?? null, city: input.city ?? null };
  const s = await first('SELECT state FROM pincodes WHERE state_hi LIKE ? LIMIT 1', [`%${input.state}%`]);
  const c = await first('SELECT city FROM pincodes WHERE city_hi = ? LIMIT 1', [input.city]);
  return { state: s?.state ?? null, city: c?.city ?? null };
}

/** POST get-tehsils-by-state-city. */
export async function getTehsilsByStateCity(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { state: 'required|string', city: 'required|string', pincode: 'required' });
    if (v.fails()) return sendResponse(false, v.first());

    const { state, city } = await englishStateCity(input);
    const record = await first('SELECT * FROM addresses WHERE state <=> ? AND city <=> ? AND pincode_id = ? LIMIT 1', [
      state,
      city,
      input.pincode ?? null,
    ]);
    if (record) {
      const tehsil = input.language === 'en' ? record.tehsil : record.tehsil_hi;
      return sendResponse(true, 'Tehsils fetched successfully', { data: tehsil });
    }
    return sendResponse(true, 'Tehsils Not Found', { data: '' });
  } catch (e) {
    console.error('error in getTehsilsByStateCity()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-tehsils. */
export async function getTehsils(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { state: 'required|string', city: 'required|string', language: 'required|in:en,hi' }, {
      'state.required': 'State is required.',
      'state.exists': 'State does not exist.',
      'city.required': 'City is required.',
      'city.exists': 'City does not exist.',
      'language.required': 'Language is required.',
      'language.in': 'Language must be either en or hi.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const field = col(input.language, 'tehsil');
    const { state, city } = await englishStateCity(input);
    const rows = await all(`SELECT \`${field}\` AS v FROM addresses WHERE city <=> ? AND state <=> ?`, [city, state]);
    const data = unique(rows.map((r) => r.v)).map((t) => ({ key: t, label: t }));
    return sendResponse(true, 'Tehsils fetched successfully', { data });
  } catch (e) {
    console.error('error in getTehsils()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** Address `area` cast => array. */
function decodeArea(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** POST get-area-by-tehsils. */
export async function getAreaByTehsils(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { state: 'required|string', city: 'required|string', language: 'required|in:en,hi', tehsil: 'required' },
      {
        'state.required': 'State is required.',
        'state.exists': 'State does not exist.',
        'city.required': 'City is required.',
        'city.exists': 'City does not exist.',
        'language.required': 'Language is required.',
        'language.in': 'Language must be either en or hi.',
        'tehsil.required': 'Tehsil is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const rows = await all('SELECT area FROM addresses WHERE state = ? AND city = ? AND tehsil = ?', [
      input.state,
      input.city,
      input.tehsil,
    ]);
    const data = rows
      .map((r) => decodeArea(r.area))
      .filter((a) => a && (typeof a !== 'object' || Object.keys(a).length)) // Collection::filter()
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
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('error in getTehsils()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST change-location-name-as-per-language — returns a bare `{state, city}` on success. */
export async function changeLocationNameAsPerLanguage(req: Request) {
  try {
    const input = req.input;
    const v = await validate(input, { language: 'required|in:en,hi' }, {
      'language.required': 'Language is required.',
      'language.in': 'Language must be either en or hi.',
    });
    if (v.fails()) return sendResponse(false, v.first());

    const stateCol = col(input.language, 'state');
    const cityCol = col(input.language, 'city');
    const cityName = String(input.cityName ?? '').trim();
    const stateName = String(input.stateName ?? '').trim();
    const cols = 'state, state_hi, city, city_hi';

    let pincode = await first(
      `SELECT ${cols} FROM pincodes WHERE TRIM(\`${stateCol}\`) = ? AND TRIM(\`${cityCol}\`) = ? LIMIT 1`,
      [stateName, cityName],
    );
    if (!pincode) {
      pincode = await first(
        `SELECT ${cols} FROM pincodes
          WHERE (TRIM(state) = ? OR TRIM(state_hi) = ?) AND (TRIM(city) = ? OR TRIM(city_hi) = ?) LIMIT 1`,
        [stateName, stateName, cityName, cityName],
      );
    }
    if (pincode) {
      return {
        state: input.language === 'en' ? pincode.state : pincode.state_hi,
        city: input.language === 'en' ? pincode.city : pincode.city_hi,
      };
    }
    return sendResponse(false, 'Location not found.');
  } catch (e) {
    console.error('error in changeLocationNameAsPerLanguage()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST popup-ads — active home popups for businesses in the city that this device has not seen. */
export async function getPopupAds(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { stateName: 'required|string', cityName: 'required|string', language: 'required|in:en,hi', device_id: 'required|string' },
      {
        'cityName.required': 'City is required.',
        'stateName.required': 'State is required.',
        'language.required': 'Language is required.',
        'device_id.required': 'Device ID is required.',
      },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const businesses = await all('SELECT id FROM businesses WHERE state_en = ? AND dist_en = ?', [
      input.stateName,
      input.cityName,
    ]);
    if (!businesses.length) return sendResponse(true, 'No popup ads found', { ads: [] });

    const ads = await all(
      `SELECT id, advt_img FROM advertisments
        WHERE ads_position = 'home' AND ads_location = 'Popup' AND status = 1
          AND client_name IN (?)
          AND id NOT IN (SELECT ad_id FROM ad_user_views WHERE device_id = ?)`,
      [businesses.map((b) => b.id), input.device_id],
    );
    return sendResponse(true, 'Popup ads fetched successfully', {
      ads: ads.map((ad) => ({ id: ad.id, advt_img: ad.advt_img ? url(req, String(ad.advt_img)) : null })),
    });
  } catch (e) {
    console.error('Error in getPopupAds()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST save-ad-view — INSERT IGNORE one row per ad. */
export async function saveAdView(req: Request) {
  try {
    const input = req.input;
    const v = await validate(
      input,
      { device_id: 'required|string', ad_ids: 'required|array', 'ad_ids.*': 'exists:advertisments,id' },
      { 'device_id.required': 'Device ID is required.', 'ad_ids.required': 'Advertisment ID is required.' },
    );
    if (v.fails()) return sendResponse(false, v.first());

    const now = nowDb();
    const ids = Object.values(input.ad_ids as Record<string, unknown>);
    const rows = ids.map((adId) => [input.device_id, adId, now, now]);
    await exec('INSERT IGNORE INTO ad_user_views (device_id, ad_id, created_at, updated_at) VALUES ?', [rows]);
    return sendResponse(true, 'Ad views saved successfully');
  } catch (e) {
    console.error('Error in saveAdView()', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}
