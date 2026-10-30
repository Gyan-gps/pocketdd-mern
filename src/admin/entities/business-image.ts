// Port of App\Http\Controllers\Admin\BusinessImageCrudController (+ BusinessImageRequest / BusinessImageUpdateRequest).
// Operations: List, Create, Update, Show. Model BusinessImage: table `business_iamges` (sic), upload field `img`
// (withFiles disk public_path, path uploads/user_images).
// Laravel quirk: the edit form's file input is empty unless a new file is picked, and BusinessImageUpdateRequest
// requires `img` — so every edit must re-upload the image (validation.required otherwise).
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { Business } from '../../models/index.js';
import { createBusinessImageValidation, updateBusinessImageValidation } from '../../validators/admin/business-image.validator.js';
import { coerceRow, fieldById, idOptions, newRow } from './business-columns.js';

const UPLOAD_DIRECTORY = 'uploads/user_images';

export const businessImage: CrudConfig = {
  route: 'business-image',
  embedded: 'business_iamges',
  operations: ['list', 'create', 'update', 'show'],
  list: {
    // Columns: business_id (select2 → not searched), img (image → not searched): the search box filters nothing.
    searchable: [],
    sortable: ['business_id', 'img'],
  },
  fields: { create: ['business_id', 'img'], update: ['business_id', 'img'] },
  validation: { create: createBusinessImageValidation, update: updateBusinessImageValidation },
  // Create: Business::orderBy('id','desc')->pluck('name','id'). Update: businesses without any image row
  // (whereNotIn all business_iamges.business_id — Laravel quirk: excludes the entry's own business too).
  formOptions: async (_req, id) => ({
    business_id: await idOptions(Business, id ? { 'images.0': { $exists: false } } : {}, 'name', { _id: -1 }),
  }),
  serialize: async (row) => {
    const business = await fieldById(Business, row.business_id, 'name');
    return { ...row, business_name: business ? business.value : null };
  },
  hooks: {
    beforeCreate: (data, req) => {
      const image = { ...data };
      applySingleUpload(image, req.input, 'img', UPLOAD_DIRECTORY, null);
      return newRow('business_iamges', image);
    },
    beforeUpdate: (data, existing, req) => {
      const image = { ...data };
      applySingleUpload(image, req.input, 'img', UPLOAD_DIRECTORY, existing.img);
      return coerceRow('business_iamges', image);
    },
  },
};
