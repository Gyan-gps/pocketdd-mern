import { Router } from 'express';
import { action } from '../../core/http/action.js';
import * as c from './admin-lookups.controller.js';

// routes/api.php "ADMIN PANEL Routes": outside every middleware group → no auth, no failure logging.
const o = { logFailures: false };
const A = 'Admin\\';
// Laravel route matching is case-sensitive.
const router = Router({ caseSensitive: true });

router.get('/get-business-sub-categories/:categoryId', action(A + 'BusinessCrudController@getBusinessSubCategories', c.getBusinessSubCategories, o));
router.get('/get-category-hindi/:categoryId', action(A + 'BusinessCrudController@getBusinessCategoriesHindi', c.getBusinessCategoriesHindi, o));
router.get('/business-city/:Id', action(A + 'BusinessDetailCrudController@getPincodeInfo', c.getPincodeInfo, o));
router.get('/state-cities/:state', action(A + 'AddressCrudController@getStateCities', c.getStateCities, o));
router.get('/business-state-cities/:state', action(A + 'BusinessCrudController@getStateCities', c.getStateCities, o));
router.get('/state-city-pincode/:state/:city', action(A + 'AddressCrudController@getPincodeByStateCity', c.addressGetPincodeByStateCity, o));
router.get('/business-state-city-pincode/:state/:city', action(A + 'BusinessCrudController@getPincodeByStateCity', c.businessGetPincodeByStateCity, o));
router.get('/get-tehsil-area/:state/:district/:pincodeId', action(A + 'BusinessCrudController@getTehsilAndAreaByPincode', c.getTehsilAndAreaByPincode, o));
router.get('/get-hindi-state/:state', action(A + 'BusinessCrudController@getHindiState', c.getHindiState, o));
router.get('/get-hindi-tehsil/:state/:city/:pincode', action(A + 'BusinessCrudController@getHindiTehsil', c.getHindiTehsil, o));
router.get('/get-hindi-area/:state/:city/:pincode', action(A + 'BusinessCrudController@getHindiArea', c.getHindiArea, o));
router.get('/get-hindi-district/:state/:city', action(A + 'BusinessCrudController@getHindiDistrict', c.getHindiDistrict, o));
router.get('/business-user-cities/:state', action(A + 'BusinessUserCrudController@getStateCities', c.getStateCities, o));
router.get('/business-user-pincode/:state/:city', action(A + 'BusinessUserCrudController@getPincodeByStateCity', c.businessUserGetPincodeByStateCity, o));
router.get('/business-user-get-tehsil-area/:state/:city/:pincode', action(A + 'BusinessUserCrudController@getTehsilByUserCity', c.getTehsilByUserCity, o));
router.get('/helpline-number-cities/:state', action(A + 'CityHelplineNumberCrudController@getStateCities', c.getStateCities, o));
router.get('/helpline-number-pincode/:state/:city', action(A + 'CityHelplineNumberCrudController@getPincodeByStateCity', c.helplineGetPincodeByStateCity, o));
router.get('/business-event-cities/:state', action(A + 'EventCrudController@getStateCities', c.getStateCities, o));
router.get('/business-event-pincode/:state/:city', action(A + 'EventCrudController@getPincodeByStateCity', c.eventGetPincodeByStateCity, o));
router.get('/business-event-get-tehsil-area/:state/:city/:pincode', action(A + 'EventCrudController@getTehsilByUserCity', c.getTehsilByUserCity, o));
router.get('/administrator-number-cities/:state', action(A + 'AdministratorCrudController@getStateCities', c.getStateCities, o));
router.get('/administrator-number-pincode/:state/:city', action(A + 'AdministratorCrudController@getPincodeByStateCity', c.administratorGetPincodeByStateCity, o));
router.get('/translate-to-hindi/:department', action('App\\Helpers\\General@quickTranslate', c.quickTranslate, o));
router.get('/about-us-cities/:state', action(A + 'AboutUsCrudController@getStateCities', c.getStateCities, o));
router.get('/pincode-codes/:state/:city?', action(A + 'PinCodeCrudController@getCodes', c.getCodes, o));

export default router;
