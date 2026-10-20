// Port of App\Http\Controllers\Api\BusinessUserProfileController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { hashMake } from '../../core/auth/hash.js';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../../core/http/respond.js';
import { nowDb } from '../../core/time.js';
import { validate } from '../../core/validation/validator.js';
import { exec, first } from '../../db/pool.js';
import { bind, createImageFromBase64, isUploadedFile, phpStr } from '../../helpers/business.js';
import { laravelUrl, phpTruthy } from '../../helpers/php-compat.js';
import { serializeBusiness } from '../../models/business.js';
import { serializeUser } from '../../models/user.js';

type Obj = Record<string, unknown>;

/** implode(', ', array_filter($parts)). */
const joinFiltered = (parts: unknown[]) => parts.filter(phpTruthy).map((p) => phpStr(p)).join(', ');

/** preg_replace('/<\/?p>/i', '', $user->about_us) — null subject → ''. */
const stripP = (v: unknown) => phpStr(v).replace(/<\/?p>/gi, '');

/** POST business-user-profile-details. */
export async function getBusinessUserProfile(req: Request) {
  try {
    const userId = req.user!.id;
    console.info('Fetching Business User Profile for user_id: ' + userId);
    const user = await first('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!user) return { status: false, msg: 'user not exist!' };

    const images: Obj[] = [];
    let details: Obj;
    const business = await first('SELECT * FROM businesses WHERE user_id = ? LIMIT 1', [user.id]);

    if (business) {
      const pending = await first('SELECT * FROM businesse_requests WHERE user_id = ? AND is_business_approved = ? LIMIT 1', [
        userId,
        0,
      ]);
      if (pending) {
        details = {
          name: pending.business_username ?? user.name ?? null,
          business_name: pending.business_name ?? business.business_name_en ?? null,
          email: user.email,
          full_address: joinFiltered([
            pending.address_line ?? user.address_line ?? null,
            pending.street_address ?? user.street_address ?? null,
            // Laravel quirk: businesse_requests has no `post` column → always the user's post_address.
            pending.post ?? user.post_address ?? null,
            pending.tahsil,
            pending.district,
            pending.state,
          ]),
          user_description: stripP(user.about_us),
          images: pending.business_image,
          phone: user.phone,
          is_business_request_pending: true,
          is_business_exists: false,
          // Laravel quirk: url(null) is the UrlGenerator → {}.
          user_icon: laravelUrl(req, user.user_icon),
        };
      } else {
        for (const p of [business.image_1, business.image_2, business.image_3, business.image_4]) {
          if (phpTruthy(p ?? null)) images.push({ url: laravelUrl(req, p) });
        }
        details = {
          name: user.name ?? null,
          business_name: business.business_name_en ?? null,
          email: user.email,
          full_address: joinFiltered([
            user.address_line,
            user.street_address,
            user.post_address,
            user.tehsil,
            user.district,
            user.state,
          ]),
          images,
          phone: user.phone,
          user_description: stripP(user.about_us),
          is_business_request_pending: false,
          is_business_exists: true,
          user_icon: phpTruthy(user.user_icon) ? laravelUrl(req, user.user_icon) : null,
        };
      }
    } else {
      details = {
        name: user.name ?? null,
        email: user.email,
        full_address: joinFiltered([
          user.address_line,
          user.street_address,
          user.post_address,
          user.tehsil ?? null,
          user.district ?? null,
          user.state ?? null,
        ]),
        user_description: stripP(user.about_us),
        images,
        phone: user.phone,
        is_business_request_pending: false,
        is_business_exists: false,
        user_icon: laravelUrl(req, user.user_icon),
      };
    }
    return sendResponse(true, 'Business User Profile details Retrieved', { data: details });
  } catch (e) {
    console.error('Error retrieving getting Business User Profile Data', [errorMessage(e)]);
    return sendCatchLog(errorMessage(e));
  }
}

/** POST get-user-and-business-details. */
export async function getUserAndBusinessDetails(req: Request) {
  try {
    const user = req.user!;
    // Business::getUserBusiness() selects only the image columns.
    const details = await first(
      'SELECT image_1, image_2, image_3, image_4 FROM businesses WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1',
      [user.id, 1],
    );
    const businessData = await first('SELECT * FROM businesses WHERE user_id = ? LIMIT 1', [user.id]);

    let userData: unknown;
    if (details) {
      const images = [details.image_1, details.image_2, details.image_3, details.image_4]
        .filter((i) => phpTruthy(i ?? null))
        .map((img) => [laravelUrl(req, img)]);
      const bd: Obj = businessData ?? {};
      const model: Obj = { ...details };
      model.is_business_exists = true;
      // owner_name_en / owner_number_1 are not selected → the user's values.
      model.name = user.name;
      model.phone = user.phone;
      model.email = user.email;
      model.state = bd.state_en ?? user.state ?? null;
      model.district = bd.dist_en ?? user.district ?? null;
      model.pincode = bd.pincode_hi ?? user.pincode ?? null;
      model.tahsil = bd.tehsil_en ?? user.tehsil ?? null;
      model.post = bd.post ?? user.post_address ?? null;
      model.street_address = bd.street_address ?? user.street_address ?? null;
      model.address_line_1 = user.address_line ?? bd.address_line_1_en ?? null;
      model.images = images;
      model.description = user.about_us ?? null;
      model.user_icon = phpTruthy(user.user_icon)
        ? laravelUrl(req, user.user_icon)
        : phpTruthy(bd.logo ?? null)
          ? laravelUrl(req, bd.logo)
          : null;
      // $appends business_icon: `logo` was not selected → null.
      userData = serializeBusiness(model);
    } else {
      const pending = await first('SELECT * FROM businesse_requests WHERE user_id = ? LIMIT 1', [user.id]);
      const p: Obj = pending ?? {};
      const bd: Obj = businessData ?? {};
      userData = {
        is_business_exists: false,
        name: p.business_username ?? user.name ?? null,
        phone: user.phone,
        email: user.email,
        state: p.state ?? bd.state_en ?? user.state ?? null,
        district: p.district ?? bd.dist_en ?? user.district ?? null,
        tahsil: p.tahsil ?? bd.tehsil_en ?? user.tehsil ?? null,
        pincode: p.pincode ?? bd.pincode_hi ?? user.pincode ?? null,
        post: p.post ?? user.post_address ?? null,
        street_address: p.street_address ?? user.street_address ?? null,
        address_line_1: p.address_line ?? user.address_line ?? null,
        images: phpTruthy(p.business_image ?? null) ? laravelUrl(req, p.business_image) : [],
        description: user.about_us ?? null,
        user_icon: phpTruthy(user.user_icon) ? laravelUrl(req, user.user_icon) : null,
      };
    }
    return sendResponse(true, 'Business User details retrieved successfully.', { userData });
  } catch (e) {
    console.error('Error retrieving Business User and business details.', { message: errorMessage(e) });
    return sendCatchLog(errorMessage(e));
  }
}

const isArrayLike = (v: unknown): v is Obj | unknown[] =>
  Array.isArray(v) || (!!v && typeof v === 'object' && !isUploadedFile(v));

/** `$arr[$key]` on a PHP array decoded from the request (lists and string-keyed objects). */
const offset = (v: Obj | unknown[], key: number) => (Array.isArray(v) ? v[key] : (v as Obj)[String(key)]);

/** `isset($request->images[$key]) ? $request->images[$key] : <unset>`. */
function imageAt(images: unknown, key: number): { set: boolean; value?: unknown } {
  if (typeof images === 'string') {
    const bytes = Buffer.from(images, 'utf8');
    return key < bytes.length ? { set: true, value: bytes.subarray(key, key + 1).toString('latin1') } : { set: false };
  }
  if (isUploadedFile(images)) throw new PhpError('Cannot use object of type Illuminate\\Http\\UploadedFile as array');
  if (isArrayLike(images)) {
    const v = offset(images, key);
    return v === null || v === undefined ? { set: false } : { set: true, value: v };
  }
  return { set: false };
}

/** POST update-user-profile. */
export async function updateUserProfile(req: Request) {
  try {
    const input = req.input;
    const userId = req.user!.id;

    // Laravel quirk: the rule key 'images.*.mimes' with rule string 'jpeg,png,jpg,heic,heif|max:5120' makes the
    // validator call a non-existent method whenever an `images.N.mimes` key exists.
    if (isArrayLike(input.images)) {
      for (const item of Object.values(input.images)) {
        if (isArrayLike(item) && !Array.isArray(item) && Object.prototype.hasOwnProperty.call(item, 'mimes')) {
          throw new Error('Method Illuminate\\Validation\\Validator::validateJpeg,png,jpg,heic,heif does not exist.');
        }
      }
    }
    const messages = {
      'name.required': 'Please enter your name',
      'email.unique': 'This email is already in use.',
    };
    const v1 = await validate(input, { name: 'required|string' }, messages);
    if (v1.fails()) return sendResponse(false, v1.first());
    const v2 = await validate(input, { email: 'nullable|email' }, messages);
    if (v2.fails()) return sendResponse(false, v2.first());
    if (input.email !== null && input.email !== undefined) {
      // Rule::unique('users', 'email')->ignore($request->user()->id)
      const row = await first('SELECT COUNT(*) AS aggregate FROM users WHERE email = ? AND id <> ?', [input.email, userId]);
      if (Number(row?.aggregate)) return sendResponse(false, messages['email.unique']);
    }

    const rawIcon = input.user_icon;
    let imageUrl: unknown = isArrayLike(rawIcon) ? (offset(rawIcon, 0) ?? null) : (rawIcon ?? null);

    const fields = ['image_1', 'image_2', 'image_3', 'image_4'];
    const r = (k: string) => input[k] ?? null;
    const businessUserUpdates: Obj = {
      name: r('name'),
      email: r('email'),
      phone: r('phone'),
      address_line_1: r('address_line_1'),
      street_address: r('street_address'),
      post: r('post'),
      tahsil: r('tahsil'),
      pincode: r('pincode'),
      district: r('district'),
      state: r('state'),
      description: r('description'),
      updated_at: nowDb(),
    };
    const businessUpdates: Obj = {};

    if (phpTruthy(imageUrl) && typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
      imageUrl = createImageFromBase64(imageUrl, 'user_images', { mkdir: false });
    } else if (phpTruthy(imageUrl) && typeof imageUrl === 'string') {
      const pos = imageUrl.indexOf('uploads/');
      if (pos !== -1) imageUrl = imageUrl.slice(pos);
    }

    for (const [key, field] of fields.entries()) {
      const at = imageAt(input.images, key);
      if (at.set) {
        const imageData = isArrayLike(at.value) ? (offset(at.value, 0) ?? null) : at.value;
        if (typeof imageData === 'string' && imageData !== '' && imageData !== '0' && imageData.startsWith('data:image')) {
          businessUpdates[field] = createImageFromBase64(imageData, 'business_images', { mkdir: false });
        } else if (typeof imageData === 'string') {
          const pos = imageData.indexOf('uploads/');
          businessUpdates[field] = pos !== -1 ? imageData.slice(pos) : imageData;
        } else {
          businessUpdates[field] = null;
        }
      } else {
        businessUpdates[field] = null;
      }
    }

    businessUpdates.owner_email = r('email');
    businessUserUpdates.profile_img = imageUrl;

    const set = (o: Obj) => Object.keys(o).map((k) => `\`${k}\` = ?`).join(', ');
    const vals = (o: Obj) => Object.values(o).map(bind);

    // Eloquent Builder::update() also writes `<table>.updated_at`.
    await exec(`UPDATE business_users SET ${set(businessUserUpdates)} WHERE user_id = ?`, [...vals(businessUserUpdates), userId]);
    const bu = { ...businessUpdates, updated_at: nowDb() };
    await exec(`UPDATE businesses SET ${set(bu)} WHERE user_id = ?`, [...vals(bu), userId]);
    const userUpdates: Obj = {
      name: r('name'),
      email: r('email'),
      user_icon: imageUrl,
      state: r('state'),
      district: r('district'),
      pincode: r('pincode'),
      tehsil: r('tahsil'),
      post_address: r('post'),
      about_us: r('description'),
      street_address: r('street_address'),
      address_line: r('address_line_1'),
      password: await hashMake(phpStr(input.phone)),
      updated_at: nowDb(),
    };
    await exec(`UPDATE users SET ${set(userUpdates)} WHERE id = ?`, [...vals(userUpdates), userId]);

    const fresh = await first('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!fresh) throw new PhpError('Attempt to assign property "user_icon" on null');
    const userData = serializeUser(fresh);
    userData.user_icon = phpTruthy(fresh.user_icon) ? laravelUrl(req, fresh.user_icon) : null;
    return sendResponse(true, 'Profile updated successfully.', { userData });
  } catch (e) {
    if (e instanceof PhpError) throw e;
    console.error('Error updating profile: ' + errorMessage(e));
    return sendCatchLog(errorMessage(e));
  }
}
