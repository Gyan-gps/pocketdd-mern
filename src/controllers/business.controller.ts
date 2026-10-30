// Port of App\Http\Controllers\Api\BusinessController (pocketdd-admin). Keep behaviour 1:1 with the PHP.
import type { Request, Response } from 'express';
import { errorMessage, PhpError, sendCatchLog, sendResponse } from '../core/http/response.js';
import { url } from '../core/url.js';
import { validate, validateRequest, type ValidationSchema } from '../core/validation/validator.js';
import { transaction } from '../db/mongo.js';
import { eloquentSave, poolDb, type Db } from '../db/eloquent.js';
import {
  countActiveBusinessesBySubCategory,
  countActiveSubCategoriesByParent,
  deleteBusinessImageRow,
  finalizeNewBusiness,
  findActiveCategories,
  findActiveSubCategories,
  findActiveUserBusiness,
  findBusinessImage,
  findBusinessRequestById,
  findCategoryByLowerName,
  findCategoryByName,
  findCategoryBySlug,
  findCategoryNameAndSlug,
  findSubCategoryByLowerName,
  findSubCategoryByName,
  findUserBusiness,
  findUserBusinessImages,
  findUserBusinessRequest,
  getUserBusinessImageColumns,
  insertNewBusiness,
  insertNewBusinessRequest,
  insertOrphanBusinessImage,
  isEmailTaken,
  isEmailTakenByOtherUser,
  isNumberTaken,
  isNumberTakenByOtherUser,
  requestValue,
  updateBusinessAndDetail,
  updateBusinessImageFile,
  userHasBusinessRequest,
} from '../services/business.service.js';
import { createImageFromBase64 } from '../utils/base64-image.js';
import { filterValidateUrl, phpLower, phpStr, strSlug } from '../utils/php/values.js';
import { phpTruthy } from '../utils/php/compat.js';
import { serializeBusiness, serializeBusinessImage, serializeCategory } from '../serializers/business.serializer.js';
import {
  addBusinessImageValidation,
  businessCategoriesValidation,
  businessSubCategoriesValidation,
  deleteBusinessImageValidation,
  newBusinessRequestValidation,
  updateBusinessImageValidation,
  updateBusinessValidation,
  updateUserBusinessDetailsValidation,
} from '../validators/business.validator.js';

type Input = Record<string, unknown>;
type ValidationClosure = (value: unknown) => Promise<string | null>;
const has = (input: Input, key: string) => Object.prototype.hasOwnProperty.call(input, key);

/**
 * Validator::make() whose rules include closures: attributes are checked in rule order and
 * `errors()->first()` is the first failing attribute's first message. A closure runs only when the
 * attribute is present and its earlier rules passed (otherwise the attribute already has an error,
 * or Laravel skips it).
 */
async function firstValidationError(
  input: Input,
  schema: ValidationSchema,
  closures: Record<string, ValidationClosure>,
): Promise<string | null> {
  for (const [attribute, rules] of Object.entries(schema.rules)) {
    const validation = await validate(input, { [attribute]: rules }, schema.messages ?? {});
    if (validation.fails()) return validation.first();
    const closure = closures[attribute];
    if (closure && has(input, attribute)) {
      const failure = await closure(input[attribute]);
      if (failure) return failure;
    }
  }
  return null;
}

/** str_starts_with($request->business_image, 'data:image') guarded by a truthiness check. */
function isDataImage(value: unknown): boolean {
  return phpTruthy(value) && phpStr(value, 'str_starts_with').startsWith('data:image');
}

const isList = (value: unknown) => Array.isArray(value) || (!!value && typeof value === 'object');

// ------------------------------------------------------------------------- categories (public)

/** POST get-all-business-categories-dropdown. */
export async function getAllBusinessCategories(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, businessCategoriesValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const nameField = input.language === 'en' ? 'name' : 'name_hi';
    const categories = await findActiveCategories();
    const subCategoryCounts = await countActiveSubCategoriesByParent();
    const rows = categories.map((category) => ({
      id: category._id,
      name: category[nameField] ?? null,
      slug: category.slug ?? null,
      status: category.status ?? null,
      img: category.img ?? null,
      subcategories_count: subCategoryCounts.get(Number(category._id)) ?? 0,
    }));
    // Laravel quirk: a Collection is always truthy, so the "No Categories" branch is unreachable.
    return sendResponse(true, 'Categories list retrieved successfully.', {
      data: rows.map(serializeCategory),
      cityName: requestValue(input, 'cityName'),
    });
  } catch (error) {
    console.error('Error in getAllCategories()', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

/** POST get-all-business-sub-categories-dropdown. */
export async function getAllBusinessSubCategories(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, businessSubCategoriesValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    // `$request->businessAdd == true` (loose comparison)
    const nameField = phpTruthy(input.businessAdd) ? 'name' : input.language === 'en' ? 'name' : 'name_hi';
    const category = await findCategoryBySlug(input.category_slug);
    if (category) {
      const subCategoryRows = await findActiveSubCategories(category.id, nameField);
      const businessCounts = await countActiveBusinessesBySubCategory();
      const subcategories = subCategoryRows.map((subCategory) => ({
        id: subCategory._id,
        name: subCategory[nameField] ?? null,
        slug: subCategory.slug ?? null,
        status: subCategory.status ?? null,
        img: subCategory.img ?? null,
        businesses_count: businessCounts.get(Number(subCategory._id)) ?? 0,
      }));
      if (subcategories.length) {
        return sendResponse(true, 'Sub-Categories retrieved.', {
          subcategories: subcategories.map(serializeCategory),
          cityName: requestValue(input, 'cityName'),
        });
      }
      return sendResponse(true, 'Sub-Categories Not Found in Records.', {
        subcategories: [],
        cityName: requestValue(input, 'cityName'),
      });
    }
    return sendResponse(false, 'Category not found.');
  } catch (error) {
    console.error('Error in getAllCategories()', { message: errorMessage(error) });
    return sendCatchLog(errorMessage(error));
  }
}

// ------------------------------------------------------------------------- business images

/** POST get-business-images — BusinessImage::getImagesOfBusiness(). */
export async function getBusinessImages(req: Request) {
  try {
    const images = await findUserBusinessImages(req.user!.id);
    return sendResponse(true, 'Business images found.', { data: images.map(serializeBusinessImage) });
  } catch (error) {
    console.error('Error updating getBusinessImages ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

/** POST add-business-images. */
export async function addBusinessImage(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, addBusinessImageValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const business = await getUserBusinessImageColumns(poolDb, req.user!.id);
    if (business) {
      const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
      // Laravel quirk: getUserBusiness() does not select `id`, so business_id is always NULL
      // (the row has no parent and is kept in `_orphans`, like the migration does).
      await insertOrphanBusinessImage(imageUrl);
      return sendResponse(true, 'Business image saved.');
    }
    return sendResponse(false, 'Business not found');
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error updating addBusinessImage ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

/** POST delete-business-image. */
export async function deleteBusinessImage(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, deleteBusinessImageValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    // find([..]) returns a Collection (always truthy) whose ->image access throws.
    if (isList(input.image_id)) throw new Error('Property [image] does not exist on this collection instance.');
    const image = await findBusinessImage(poolDb, input.image_id);
    if (image) {
      // Laravel quirk: `$getImage->image` is not a column (it is `img`), so public_path(null) is the public
      // directory itself; File::delete() on a directory fails silently and the file is never removed.
      await deleteBusinessImageRow(image);
      return sendResponse(true, 'Image removed successfully.');
    }
    return sendResponse(false, 'Image not found.');
  } catch (error) {
    console.error('Error updating deleteBusinessImage ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

/** POST update-business-image. */
export async function updateBusinessImage(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, updateBusinessImageValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const imageUrl = createImageFromBase64(input.image, 'business_images', { mkdir: true });
    await transaction(async (session) => {
      if (isList(input.image_id)) throw new Error('Method Illuminate\\Database\\Eloquent\\Collection::update does not exist.');
      const image = await findBusinessImage({ session }, input.image_id);
      // Laravel quirk: an unknown id is a fatal Error (not caught) → 500, after the file was written.
      if (!image) throw new PhpError('Call to a member function update() on null');
      await updateBusinessImageFile({ session }, image, imageUrl);
    });
    return sendResponse(true, 'Image updated successfully.');
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error updating updateBusinessImage ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

// ------------------------------------------------------------------------- update-user-business

/** POST update-user-business (updateUserBusiness1). */
export async function updateUserBusiness1(req: Request) {
  try {
    const input = req.input;
    const validation = await validateRequest(input, updateUserBusinessDetailsValidation);
    if (validation.fails()) return sendResponse(false, validation.first());

    const business = await findActiveUserBusiness(poolDb, req.user!.id);
    if (!business) return { status: false, msg: 'business not exist!' };

    await transaction(async (session) => {
      const db: Db = { session };
      const businessValues = { name: input.name, slug: strSlug(input.name), address: input.address, city: input.city };
      const detailValues: Record<string, unknown> = {
        street_address: requestValue(input, 'street_address'),
        post: requestValue(input, 'post'),
        tahsil: requestValue(input, 'tahsil'),
        pincode: requestValue(input, 'pincode'),
        district: requestValue(input, 'district'),
        state: requestValue(input, 'state'),
        business_email: requestValue(input, 'business_email'),
        business_mobile_number: requestValue(input, 'business_mobile_number'),
        description: requestValue(input, 'description'),
      };
      await updateBusinessAndDetail(db, business, businessValues, detailValues);
    });
    return sendResponse(true, 'Business profile and details updated.');
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error updating user business details ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

// ------------------------------------------------------------------------- new business request

/** POST add-new-business-request. */
export async function createNewBusinessRequest(req: Request) {
  try {
    let statusDefined = true;
    const response = await transaction(async (session) => {
      const db: Db = { session };
      const input = req.input;
      const userId = req.user!.id;
      const businessAdded = false;

      const error = await firstValidationError(input, newBusinessRequestValidation, {
        number: async (value) =>
          (await isNumberTaken(db, value)) ? 'The number is already associated with an existing business.' : null,
        business_email: async (value) =>
          (await isEmailTaken(db, value)) ? 'The email is already associated with an existing business.' : null,
        // 'regex:/^[1-9][0-9]{5}$/' (passes only for strings/numbers)
        pincode: async (value) =>
          (typeof value === 'string' || typeof value === 'number') && /^[1-9][0-9]{5}$/.test(String(value))
            ? null
            : 'Please enter a valid pincode.',
      });
      if (error !== null) return sendResponse(false, error);

      const business = await findActiveUserBusiness(db, userId);
      if (business) return sendResponse(false, 'Business User already has a business.');

      const pendingRequest = await findUserBusinessRequest(db, userId);
      if (pendingRequest) return sendResponse(false, 'Your previous business request is under review.');

      let imageUrl = '';
      if (isDataImage(input.business_image)) {
        imageUrl = createImageFromBase64(input.business_image, 'business_logo', { mkdir: true });
      }

      const nameField = input.language === 'en' ? 'name' : 'name_hi';
      const category = await findCategoryByName(db, nameField, input.business_category);
      if (!category) throw new Error('Attempt to read property "id" on null');
      const categoryId = category.id;
      // Laravel quirk: a missing business_sub_category becomes `WHERE name IS NULL`.
      const subCategory = await findSubCategoryByName(db, nameField, input.business_sub_category);
      const subCategoryId = subCategory?.id ?? null;

      const newRequestId = await insertNewBusinessRequest(db, input, userId, categoryId, subCategoryId, imageUrl);
      const businessId = await insertNewBusiness(db, input, userId, categoryId, subCategoryId, imageUrl);

      let businessStatus: unknown;
      statusDefined = false;
      const newBusinessData = newRequestId === null ? null : await findBusinessRequestById(db, newRequestId);
      if (newBusinessData) {
        businessStatus = newBusinessData.status;
        statusDefined = true;
        await eloquentSave(db, 'businesse_requests', newBusinessData, { business_id: businessId }, { massAssign: false });
      }

      await finalizeNewBusiness(db, businessId, newRequestId);
      return sendResponse(true, 'Business request submitted successfully', {
        'new-business': newRequestId,
        business_status: businessStatus,
        business_added: businessAdded,
      });
    });
    // Laravel quirk: when the request insert failed, $business_status is undefined → ErrorException
    // (thrown after the commit).
    if (!statusDefined) throw new Error('Undefined variable $business_status');
    return response;
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error Adding New Business Request: ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

// ------------------------------------------------------------------------- update-business

/** POST update-business (updateUserBusiness) — updates the user's business or creates a new request. */
export async function updateUserBusiness(req: Request) {
  try {
    return await transaction(async (session) => {
      const db: Db = { session };
      const input = req.input;
      const userId = req.user!.id;
      const existing = await findUserBusiness(db, userId);
      let businessAdded = false;

      const error = await firstValidationError(input, updateBusinessValidation(existing ? 'sometimes' : 'required'), {
        number: async (value) =>
          (await isNumberTakenByOtherUser(db, userId, value)) ? 'The number is already associated with another business.' : null,
        business_email: async (value) =>
          (await isEmailTakenByOtherUser(db, userId, value)) ? 'The email is already associated with another business.' : null,
      });
      if (error !== null) return sendResponse(false, error);

      let imageUrl: unknown = existing?.image_1 ?? null;
      if (isDataImage(input.business_image)) {
        imageUrl = createImageFromBase64(input.business_image, 'business_images', { mkdir: true });
      }

      let categoryId: unknown = null;
      let subCategoryId: unknown = null;
      const nameField = input.language === 'hi' ? 'name_hi' : 'name';
      if (phpTruthy(input.business_category)) {
        const category = await findCategoryByLowerName(db, nameField, phpLower(phpStr(input.business_category, 'strtolower')));
        if (!category) return sendResponse(false, 'Invalid Business Category');
        categoryId = category.id;
        if (phpTruthy(input.business_sub_category)) {
          const subCategory = await findSubCategoryByLowerName(
            db,
            nameField,
            phpLower(phpStr(input.business_sub_category, 'strtolower')),
          );
          subCategoryId = subCategory?.id ?? null;
        }
      }

      let message: string;
      let businessId: unknown;
      let status: unknown;
      let newRequestId: unknown = null;

      if (existing) {
        const fieldsToUpdate: Array<[string, string]> = [
          ['business_name', 'business_name_en'],
          ['business_username', 'owner_name_en'],
          ['business_email', 'business_email'],
          ['state', 'state_en'],
          ['district', 'dist_en'],
          ['pincode', 'pincode_hi'],
          ['tehsil', 'tehsil_en'],
          ['number', 'owner_number_1'],
          // Laravel quirk: the "column" is the image path itself (or '' when null); fill() drops it as an
          // unknown column, but its presence still makes $updateData non-empty.
          ['business_logo', phpStr(imageUrl)],
        ];
        const updateData: Record<string, unknown> = {};
        for (const [requestKey, column] of fieldsToUpdate) {
          if (has(input, requestKey)) updateData[column] = input[requestKey] ?? null;
        }

        if (phpTruthy(input.area) || phpTruthy(input.street_address) || phpTruthy(input.address_line_1)) {
          updateData.area_en = input.area ?? null;
          updateData.address_line_1_en = `${phpStr(input.area ?? '')},${phpStr(input.street_address ?? '')},${phpStr(input.address_line_1 ?? '')}`;
        }
        if (phpTruthy(categoryId)) {
          updateData.business_category_id = categoryId;
          updateData.business_sub_category_id = subCategoryId;
        }
        if (phpTruthy(imageUrl)) updateData.image_1 = imageUrl;

        if (Object.keys(updateData).length) {
          updateData.is_business_approved = 0;
          await eloquentSave(db, 'businesses', existing, updateData, { massAssign: true });
        }
        message = 'Business updated successfully';
        businessId = existing.id;
        status = existing.status;
      } else {
        if (await userHasBusinessRequest(db, userId)) {
          return sendResponse(false, 'Your previous business request is under review.');
        }
        if (!phpTruthy(categoryId)) return sendResponse(false, 'Business Category is required.');

        const requestId = await insertNewBusinessRequest(db, input, userId, categoryId, subCategoryId, imageUrl ?? '');
        const insertedId = await insertNewBusiness(db, input, userId, categoryId, subCategoryId, imageUrl ?? '');
        await finalizeNewBusiness(db, insertedId, requestId);

        businessAdded = true;
        message = 'Business request submitted successfully';
        businessId = insertedId;
        status = 0;
        newRequestId = requestId;
      }

      return sendResponse(true, message, {
        'new-business': newRequestId ?? null,
        business_id: businessId,
        business_status: status ?? null,
        business_added: businessAdded,
      });
    });
  } catch (error) {
    if (error instanceof PhpError) throw error;
    console.error('Error Processing User Business: ' + errorMessage(error));
    return sendCatchLog(errorMessage(error));
  }
}

// ------------------------------------------------------------------------- get-user-business-details

/** POST get-user-business-details — explicit status codes, generic 500 on errors. */
export async function getUserBusinessDetails(req: Request, res: Response) {
  try {
    const business = await findUserBusiness(poolDb, req.user!.id);
    if (!business) {
      res.status(404);
      return { status: false, message: 'Business not found.' };
    }
    const row: Record<string, unknown> = { ...business };
    if (phpTruthy(row.logo) && !filterValidateUrl(String(row.logo))) {
      // Laravel quirk: business_icon is computed from the already-absolutised logo (APP_URL/http://…).
      row.logo = url(req, String(row.logo));
    }
    const category = await findCategoryNameAndSlug(row.business_category_id);
    row.category_en = category?.name ?? null;
    row.category_slug = category?.slug ?? null;

    const addressParts = phpStr(row.address_line_1_en).split(',');
    row.street_address = addressParts[1] ?? null;
    row.address_line_1_en = addressParts[2] ?? null;
    return {
      status: true,
      message: 'Business details fetched successfully.',
      data: serializeBusiness(row, ['image_1', 'image_2', 'image_3', 'image_4']),
    };
  } catch (error) {
    console.error('Error Fetching User Business: ' + errorMessage(error));
    res.status(500);
    return { status: false, message: 'Something went wrong.' };
  }
}
