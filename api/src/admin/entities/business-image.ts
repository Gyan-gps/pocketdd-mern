// Port of App\Http\Controllers\Admin\BusinessImageCrudController (+ BusinessImageRequest / BusinessImageUpdateRequest).
// Operations: List, Create, Update, Show. Model BusinessImage: table `business_iamges` (sic), upload field `img`
// (withFiles disk public_path, path uploads/user_images).
// Laravel quirk: the edit form's file input is empty unless a new file is picked, and BusinessImageUpdateRequest
// requires `img` — so every edit must re-upload the image (validation.required otherwise).
import type { CrudConfig } from '../crud.js';
import { applySingleUpload } from '../uploads.js';
import { namesById, pluckOptions } from '../support/business-helpers.js';

const DIR = 'uploads/user_images';

export const businessImage: CrudConfig = {
  route: 'business-image',
  table: 'business_iamges',
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
    business_id: id
      ? await pluckOptions(
          'SELECT id AS v, name AS l FROM businesses WHERE id NOT IN (SELECT business_id FROM business_iamges) ORDER BY id DESC',
        )
      : await pluckOptions('SELECT id AS v, name AS l FROM businesses ORDER BY id DESC'),
  }),
  serialize: async (row) => {
    const names = await namesById('businesses', 'name', [row.business_id]);
    return { ...row, business_name: names.get(String(row.business_id)) ?? null };
  },
  hooks: {
    beforeCreate: (data, req) => {
      const out = { ...data };
      applySingleUpload(out, req.input, 'img', DIR, null);
      return out;
    },
    beforeUpdate: (data, existing, req) => {
      const out = { ...data };
      applySingleUpload(out, req.input, 'img', DIR, existing.img);
      return out;
    },
  },
};
