// Port of App\Http\Controllers\Api\BusinessUserProfileController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request } from 'express';
import { hashMake } from '../core/auth/hash.js';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { nowDb } from '../core/time.js';
import { validateRequest } from '../core/validation/validator.js';
import {
  findActiveBusinessImageColumns,
  findFirstBusinessOfUser,
  findFirstBusinessRequestOfUser,
  findPendingBusinessRequestOfUser,
  findUserById,
  isEmailUsedByOtherUser,
  updateBusinessesOfUser,
  updateBusinessUsersOfUser,
  updateUser,
} from '../services/profile.service.js';
import { bind, isUploadedFile, phpStr } from '../utils/php/values.js';
import { createImageFromBase64 } from '../utils/base64-image.js';
import { laravelUrl, phpTruthy } from '../utils/php/compat.js';
import { serializeBusiness } from '../serializers/business.serializer.js';
import { serializeUser } from '../serializers/user.serializer.js';
import {
  UPDATE_PROFILE_MESSAGES,
  updateProfileEmailValidation,
  updateProfileNameValidation,
} from '../validators/profile.validator.js';

type PlainObject = Record<string, unknown>;

/** implode(', ', array_filter($parts)). */
const joinFiltered = (parts: unknown[]) => parts.filter(phpTruthy).map((part) => phpStr(part)).join(', ');

/** preg_replace('/<\/?p>/i', '', $user->about_us) — null subject → ''. */
const stripParagraphTags = (value: unknown) => phpStr(value).replace(/<\/?p>/gi, '');

/** POST business-user-profile-details. */
export async function getBusinessUserProfile(req: Request) {
  try {
    const userId = req.user!.id;
    console.info('Fetching Business User Profile for user_id: ' + userId);
    const user = await findUserById(userId);
    if (!user) return { status: false, msg: 'user not exist!' };

    const images: PlainObject[] = [];
    let details: PlainObject;
    const business = await findFirstBusinessOfUser(user.id);

    if (business) {
      const pending = await findPendingBusinessRequestOfUser(userId);
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
          user_description: stripParagraphTags(user.about_us),
          images: pending.business_image,
          phone: user.phone,
          is_business_request_pending: true,
          is_business_exists: false,
          // Laravel quirk: url(null) is the UrlGenerator → {}.
          user_icon: laravelUrl(req, user.user_icon),
        };
      } else {
        for (const imagePath of [business.image_1, business.image_2, business.image_3, business.image_4]) {
          if (phpTruthy(imagePath ?? null)) images.push({ url: laravelUrl(req, imagePath) });
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
          user_description: stripParagraphTags(user.about_us),
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
        user_description: stripParagraphTags(user.about_us),
        images,
        phone: user.phone,
        is_business_request_pending: false,
        is_business_exists: false,
        user_icon: laravelUrl(req, user.user_icon),
      };
    }
    return sendResponse(true, 'Business User Profile details Retrieved', { data: details });
  } catch (error) {
    console.error('Error retrieving getting Business User Profile Data', [errorMessage(error)]);
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-user-and-business-details. */
export async function getUserAndBusinessDetails(req: Request) {
  try {
    const user = req.user!;
    const details = await findActiveBusinessImageColumns(user.id);
    const businessData = await findFirstBusinessOfUser(user.id);

    let userData: unknown;
    if (details) {
      const images = [details.image_1, details.image_2, details.image_3, details.image_4]
        .filter((image) => phpTruthy(image ?? null))
        .map((image) => [laravelUrl(req, image)]);
      const businessRow: PlainObject = businessData ?? {};
      const businessModel: PlainObject = { ...details };
      businessModel.is_business_exists = true;
      // owner_name_en / owner_number_1 are not selected → the user's values.
      businessModel.name = user.name;
      businessModel.phone = user.phone;
      businessModel.email = user.email;
      businessModel.state = businessRow.state_en ?? user.state ?? null;
      businessModel.district = businessRow.dist_en ?? user.district ?? null;
      businessModel.pincode = businessRow.pincode_hi ?? user.pincode ?? null;
      businessModel.tahsil = businessRow.tehsil_en ?? user.tehsil ?? null;
      businessModel.post = businessRow.post ?? user.post_address ?? null;
      businessModel.street_address = businessRow.street_address ?? user.street_address ?? null;
      businessModel.address_line_1 = user.address_line ?? businessRow.address_line_1_en ?? null;
      businessModel.images = images;
      businessModel.description = user.about_us ?? null;
      businessModel.user_icon = phpTruthy(user.user_icon)
        ? laravelUrl(req, user.user_icon)
        : phpTruthy(businessRow.logo ?? null)
          ? laravelUrl(req, businessRow.logo)
          : null;
      // $appends business_icon: `logo` was not selected → null.
      userData = serializeBusiness(businessModel);
    } else {
      const pending = await findFirstBusinessRequestOfUser(user.id);
      const pendingRow: PlainObject = pending ?? {};
      const businessRow: PlainObject = businessData ?? {};
      userData = {
        is_business_exists: false,
        name: pendingRow.business_username ?? user.name ?? null,
        phone: user.phone,
        email: user.email,
        state: pendingRow.state ?? businessRow.state_en ?? user.state ?? null,
        district: pendingRow.district ?? businessRow.dist_en ?? user.district ?? null,
        tahsil: pendingRow.tahsil ?? businessRow.tehsil_en ?? user.tehsil ?? null,
        pincode: pendingRow.pincode ?? businessRow.pincode_hi ?? user.pincode ?? null,
        post: pendingRow.post ?? user.post_address ?? null,
        street_address: pendingRow.street_address ?? user.street_address ?? null,
        address_line_1: pendingRow.address_line ?? user.address_line ?? null,
        images: phpTruthy(pendingRow.business_image ?? null) ? laravelUrl(req, pendingRow.business_image) : [],
        description: user.about_us ?? null,
        user_icon: phpTruthy(user.user_icon) ? laravelUrl(req, user.user_icon) : null,
      };
    }
    return sendResponse(true, 'Business User details retrieved successfully.', { userData });
  } catch (error) {
    console.error('Error retrieving Business User and business details.', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

const isArrayLike = (value: unknown): value is PlainObject | unknown[] =>
  Array.isArray(value) || (!!value && typeof value === 'object' && !isUploadedFile(value));

/** `$arr[$key]` on a PHP array decoded from the request (lists and string-keyed objects). */
const offset = (array: PlainObject | unknown[], key: number) =>
  Array.isArray(array) ? array[key] : (array as PlainObject)[String(key)];

/** `isset($request->images[$key]) ? $request->images[$key] : <unset>`. */
function imageAt(images: unknown, key: number): { set: boolean; value?: unknown } {
  if (typeof images === 'string') {
    const bytes = Buffer.from(images, 'utf8');
    return key < bytes.length ? { set: true, value: bytes.subarray(key, key + 1).toString('latin1') } : { set: false };
  }
  if (isUploadedFile(images)) throw new PhpError('Cannot use object of type Illuminate\\Http\\UploadedFile as array');
  if (isArrayLike(images)) {
    const value = offset(images, key);
    return value === null || value === undefined ? { set: false } : { set: true, value };
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
    const nameValidation = await validateRequest(input, updateProfileNameValidation);
    if (nameValidation.fails()) return sendResponse(false, nameValidation.first());
    const emailValidation = await validateRequest(input, updateProfileEmailValidation);
    if (emailValidation.fails()) return sendResponse(false, emailValidation.first());
    if (input.email !== null && input.email !== undefined) {
      // Rule::unique('users', 'email')->ignore($request->user()->id)
      if (await isEmailUsedByOtherUser(input.email, userId)) {
        return sendResponse(false, UPDATE_PROFILE_MESSAGES['email.unique']!);
      }
    }

    const rawIcon = input.user_icon;
    let imageUrl: unknown = isArrayLike(rawIcon) ? (offset(rawIcon, 0) ?? null) : (rawIcon ?? null);

    const imageFields = ['image_1', 'image_2', 'image_3', 'image_4'];
    const requestValue = (key: string) => input[key] ?? null;
    const businessUserUpdates: PlainObject = {
      name: requestValue('name'),
      email: requestValue('email'),
      phone: requestValue('phone'),
      address_line_1: requestValue('address_line_1'),
      street_address: requestValue('street_address'),
      post: requestValue('post'),
      tahsil: requestValue('tahsil'),
      pincode: requestValue('pincode'),
      district: requestValue('district'),
      state: requestValue('state'),
      description: requestValue('description'),
      updated_at: nowDb(),
    };
    const businessUpdates: PlainObject = {};

    if (phpTruthy(imageUrl) && typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
      imageUrl = createImageFromBase64(imageUrl, 'user_images', { mkdir: false });
    } else if (phpTruthy(imageUrl) && typeof imageUrl === 'string') {
      const uploadsPosition = imageUrl.indexOf('uploads/');
      if (uploadsPosition !== -1) imageUrl = imageUrl.slice(uploadsPosition);
    }

    for (const [key, field] of imageFields.entries()) {
      const imageEntry = imageAt(input.images, key);
      if (imageEntry.set) {
        const imageData = isArrayLike(imageEntry.value) ? (offset(imageEntry.value, 0) ?? null) : imageEntry.value;
        if (typeof imageData === 'string' && imageData !== '' && imageData !== '0' && imageData.startsWith('data:image')) {
          businessUpdates[field] = createImageFromBase64(imageData, 'business_images', { mkdir: false });
        } else if (typeof imageData === 'string') {
          const uploadsPosition = imageData.indexOf('uploads/');
          businessUpdates[field] = uploadsPosition !== -1 ? imageData.slice(uploadsPosition) : imageData;
        } else {
          businessUpdates[field] = null;
        }
      } else {
        businessUpdates[field] = null;
      }
    }

    businessUpdates.owner_email = requestValue('email');
    businessUserUpdates.profile_img = imageUrl;

    // Every column written here is VARCHAR/TEXT: MySQL stored bound numbers/booleans as strings.
    const asStoredStrings = (values: PlainObject): PlainObject =>
      Object.fromEntries(
        Object.entries(values).map(([column, value]) => {
          const bound = bind(value);
          if (bound === null || typeof bound === 'string') return [column, bound];
          if (typeof bound === 'boolean') return [column, bound ? '1' : '0'];
          if (typeof bound === 'number') return [column, String(bound)];
          throw new Error('Array to string conversion');
        }),
      );

    // Eloquent Builder::update() also writes `<table>.updated_at`.
    await updateBusinessUsersOfUser(userId, asStoredStrings(businessUserUpdates));
    const businessUpdatesWithTimestamp = { ...businessUpdates, updated_at: nowDb() };
    await updateBusinessesOfUser(userId, asStoredStrings(businessUpdatesWithTimestamp));
    const userUpdates: PlainObject = {
      name: requestValue('name'),
      email: requestValue('email'),
      user_icon: imageUrl,
      state: requestValue('state'),
      district: requestValue('district'),
      pincode: requestValue('pincode'),
      tehsil: requestValue('tahsil'),
      post_address: requestValue('post'),
      about_us: requestValue('description'),
      street_address: requestValue('street_address'),
      address_line: requestValue('address_line_1'),
      password: await hashMake(phpStr(input.phone)),
      updated_at: nowDb(),
    };
    await updateUser(userId, asStoredStrings(userUpdates));

    const updatedUser = await findUserById(userId);
    if (!updatedUser) throw new PhpError('Attempt to assign property "user_icon" on null');
    const userData = serializeUser(updatedUser);
    userData.user_icon = phpTruthy(updatedUser.user_icon) ? laravelUrl(req, updatedUser.user_icon) : null;
    return sendResponse(true, 'Profile updated successfully.', { userData });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error updating profile: ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}
