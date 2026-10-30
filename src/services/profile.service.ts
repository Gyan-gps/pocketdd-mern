// User / business queries and writes used by the business user profile endpoints (Api\BusinessUserProfileController).
import { countWhere, toRow, type Row } from '../db/mongo.js';
import { Business } from '../models/business.model.js';
import { BusinessRequest } from '../models/business-request.model.js';
import { BusinessUser } from '../models/business-user.model.js';
import { User } from '../models/user.model.js';
import type { AnyModel } from '../models/index.js';

/** `SELECT * … WHERE … LIMIT 1` (PK order). */
const findFirstRow = async (model: AnyModel, filter: Row) =>
  toRow(await model.findOne(filter, undefined, { sort: { _id: 1 } }).lean<Row>());

export const findUserById = async (userId: unknown) => toRow(await User.findOne({ _id: userId }).lean<Row>());
export const findFirstBusinessOfUser = (userId: unknown) => findFirstRow(Business, { user_id: userId });
export const findFirstBusinessRequestOfUser = (userId: unknown) => findFirstRow(BusinessRequest, { user_id: userId });
export const findPendingBusinessRequestOfUser = (userId: unknown) =>
  findFirstRow(BusinessRequest, { user_id: userId, is_business_approved: 0 });

/** Business::getUserBusiness() selects only the image columns. */
export const findActiveBusinessImageColumns = (userId: unknown) =>
  Business.findOne(
    { user_id: userId, status: 1 },
    { _id: 0, image_1: 1, image_2: 1, image_3: 1, image_4: 1 },
    { sort: { _id: -1 } },
  ).lean<Row>();

/** Rule::unique('users', 'email')->ignore($userId). */
export const isEmailUsedByOtherUser = async (email: unknown, userId: unknown) =>
  !!(await countWhere('users', 'email', email, { column: 'id', value: userId }));

// Eloquent Builder::update() of the profile columns, per table.
export const updateBusinessUsersOfUser = (userId: unknown, values: Row) =>
  BusinessUser.updateMany({ user_id: userId }, { $set: values });
export const updateBusinessesOfUser = (userId: unknown, values: Row) =>
  Business.updateMany({ user_id: userId }, { $set: values });
export const updateUser = (userId: unknown, values: Row) => User.updateOne({ _id: userId }, { $set: values });
