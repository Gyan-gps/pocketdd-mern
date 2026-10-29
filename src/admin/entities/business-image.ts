// Port of App\Http\Controllers\Admin\BusinessImageCrudController (+ BusinessImageRequest / BusinessImageUpdateRequest).
// Operations: List, Create, Update, Show. Model BusinessImage: table `business_iamges` (sic), upload field `img`
// (withFiles disk public_path, path uploads/user_images).
// Laravel quirk: the edit form's file input is empty unless a new file is picked, and BusinessImageUpdateRequest
// requires `img` — so every edit must re-upload the image (validation.required otherwise).
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { C } from '../../db/mongo.js';
import { coerceRow, fieldById, idOptions, newRow } from './business-columns.js';

const DIR = 'uploads/user_images';

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
  validation: {
    create: {
      rules: { img: 'required|mimetypes:image/png,image/jpg,image/jpeg,image/svg', business_id: 'required' },
      messages: { 'img.mimetypes': 'Please upload the image in PNG, JPEG, or JPG format.' },
    },
    update: { rules: { img: 'required', business_id: 'required' } },
  },
  // Create: Business::orderBy('id','desc')->pluck('name','id'). Update: businesses without any image row
  // (whereNotIn all business_iamges.business_id — Laravel quirk: excludes the entry's own business too).
  formOptions: async (_req, id) => ({
    business_id: await idOptions(C.businesses, id ? { 'images.0': { $exists: false } } : {}, 'name', { _id: -1 }),
  }),
  serialize: async (row) => {
    const b = await fieldById(C.businesses, row.business_id, 'name');
    return { ...row, business_name: b ? b.v : null };
  },
  hooks: {
    beforeCreate: (data, req) => {
      const out = { ...data };
      applySingleUpload(out, req.input, 'img', DIR, null);
      return newRow('business_iamges', out);
    },
    beforeUpdate: (data, existing, req) => {
      const out = { ...data };
      applySingleUpload(out, req.input, 'img', DIR, existing.img);
      return coerceRow('business_iamges', out);
    },
  },
};
