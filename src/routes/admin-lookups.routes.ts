import { Router } from 'express';
import { action } from '../core/http/action.js';
import * as adminLookupsController from '../controllers/admin-lookups.controller.js';

// routes/api.php "ADMIN PANEL Routes": outside every middleware group → no auth, no failure logging.
const NO_FAILURE_LOGGING = { logFailures: false };
const ADMIN_NAMESPACE = 'Admin\\';
// Laravel route matching is case-sensitive.
const router = Router({ caseSensitive: true });

router.get('/get-business-sub-categories/:categoryId', action(ADMIN_NAMESPACE + 'BusinessCrudController@getBusinessSubCategories', adminLookupsController.getBusinessSubCategories, NO_FAILURE_LOGGING));
router.get('/get-category-hindi/:categoryId', action(ADMIN_NAMESPACE + 'BusinessCrudController@getBusinessCategoriesHindi', adminLookupsController.getBusinessCategoriesHindi, NO_FAILURE_LOGGING));
router.get('/business-city/:Id', action(ADMIN_NAMESPACE + 'BusinessDetailCrudController@getPincodeInfo', adminLookupsController.getPincodeInfo, NO_FAILURE_LOGGING));
router.get('/state-cities/:state', action(ADMIN_NAMESPACE + 'AddressCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/business-state-cities/:state', action(ADMIN_NAMESPACE + 'BusinessCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/state-city-pincode/:state/:city', action(ADMIN_NAMESPACE + 'AddressCrudController@getPincodeByStateCity', adminLookupsController.addressGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/business-state-city-pincode/:state/:city', action(ADMIN_NAMESPACE + 'BusinessCrudController@getPincodeByStateCity', adminLookupsController.businessGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/get-tehsil-area/:state/:district/:pincodeId', action(ADMIN_NAMESPACE + 'BusinessCrudController@getTehsilAndAreaByPincode', adminLookupsController.getTehsilAndAreaByPincode, NO_FAILURE_LOGGING));
router.get('/get-hindi-state/:state', action(ADMIN_NAMESPACE + 'BusinessCrudController@getHindiState', adminLookupsController.getHindiState, NO_FAILURE_LOGGING));
router.get('/get-hindi-tehsil/:state/:city/:pincode', action(ADMIN_NAMESPACE + 'BusinessCrudController@getHindiTehsil', adminLookupsController.getHindiTehsil, NO_FAILURE_LOGGING));
router.get('/get-hindi-area/:state/:city/:pincode', action(ADMIN_NAMESPACE + 'BusinessCrudController@getHindiArea', adminLookupsController.getHindiArea, NO_FAILURE_LOGGING));
router.get('/get-hindi-district/:state/:city', action(ADMIN_NAMESPACE + 'BusinessCrudController@getHindiDistrict', adminLookupsController.getHindiDistrict, NO_FAILURE_LOGGING));
router.get('/business-user-cities/:state', action(ADMIN_NAMESPACE + 'BusinessUserCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/business-user-pincode/:state/:city', action(ADMIN_NAMESPACE + 'BusinessUserCrudController@getPincodeByStateCity', adminLookupsController.businessUserGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/business-user-get-tehsil-area/:state/:city/:pincode', action(ADMIN_NAMESPACE + 'BusinessUserCrudController@getTehsilByUserCity', adminLookupsController.getTehsilByUserCity, NO_FAILURE_LOGGING));
router.get('/helpline-number-cities/:state', action(ADMIN_NAMESPACE + 'CityHelplineNumberCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/helpline-number-pincode/:state/:city', action(ADMIN_NAMESPACE + 'CityHelplineNumberCrudController@getPincodeByStateCity', adminLookupsController.helplineGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/business-event-cities/:state', action(ADMIN_NAMESPACE + 'EventCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/business-event-pincode/:state/:city', action(ADMIN_NAMESPACE + 'EventCrudController@getPincodeByStateCity', adminLookupsController.eventGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/business-event-get-tehsil-area/:state/:city/:pincode', action(ADMIN_NAMESPACE + 'EventCrudController@getTehsilByUserCity', adminLookupsController.getTehsilByUserCity, NO_FAILURE_LOGGING));
router.get('/administrator-number-cities/:state', action(ADMIN_NAMESPACE + 'AdministratorCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/administrator-number-pincode/:state/:city', action(ADMIN_NAMESPACE + 'AdministratorCrudController@getPincodeByStateCity', adminLookupsController.administratorGetPincodeByStateCity, NO_FAILURE_LOGGING));
router.get('/translate-to-hindi/:department', action('App\\Helpers\\General@quickTranslate', adminLookupsController.quickTranslate, NO_FAILURE_LOGGING));
router.get('/about-us-cities/:state', action(ADMIN_NAMESPACE + 'AboutUsCrudController@getStateCities', adminLookupsController.getStateCities, NO_FAILURE_LOGGING));
router.get('/pincode-codes/:state/:city?', action(ADMIN_NAMESPACE + 'PinCodeCrudController@getCodes', adminLookupsController.getCodes, NO_FAILURE_LOGGING));

export default router;
