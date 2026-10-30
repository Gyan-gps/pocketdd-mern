// Request validation for the Slider admin screen (App\Http\Requests\SliderRequest / SliderUpdateRequest).
// Laravel quirk: no custom messages → raw `validation.*` keys; the update request requires `slider_img` too.
import type { ValidationSchema } from '../../core/validation/validator.js';

const SLIDER_RULES = {
  client_name: 'required|min:5|max:255',
  slider_img: 'required||image|mimes:png,jpg,jpeg,svg',
  from_date: 'required',
  to_date: 'required',
  page_location: 'required',
};

export const createSliderValidation: ValidationSchema = { rules: SLIDER_RULES };

export const updateSliderValidation: ValidationSchema = { rules: SLIDER_RULES };
