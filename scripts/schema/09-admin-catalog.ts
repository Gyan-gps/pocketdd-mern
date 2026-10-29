// catalog admin — Admin\BusinessCategory / BusinessSubCategory / Advertisment / Slider / Location CrudControllers.
// Types inferred from the PHP: form field types / FormRequest rules / list columns.
import type { SchemaPatch } from './types.js';

export const patch: SchemaPatch = {
  columns: {
    // Advertisement list/show column + required select2_from_array (Cheque|Cash|Online via UPI|NEFT|Free);
    // missing from the create_advertisments migration (added in production by hand).
    advertisments: { fees_type: 'VARCHAR(191) NULL' },
  },
};
