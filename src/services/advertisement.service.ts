// Advertisement queries shared by the event and notification endpoints.
import type { Request } from 'express';
import { intId } from '../db/mongo.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { Advertisement } from '../models/advertisement.model.js';
import { Business } from '../models/business.model.js';
import { laravelUrl } from '../utils/php/compat.js';

/**
 * Advertisment::where('ads_position','inner')->where('ads_location',$location)->where('status',1)
 *   ->get(['advt_img','client_name'])->map(fn => ['advt_img' => url(...), 'business' => Business::find(client_name)...])
 */
export async function innerAdsWithBusiness(req: Request, adsLocation: string): Promise<Record<string, unknown>[]> {
  const advertisements = await Advertisement.find(
    { ads_position: 'inner', ads_location: adsLocation, status: 1 },
    { _id: 0, advt_img: 1, client_name: 1 },
    { collation: CASE_INSENSITIVE, sort: { _id: 1 } },
  ).lean();
  const results: Record<string, unknown>[] = [];
  for (const advertisement of advertisements) {
    const businessId = intId(advertisement.client_name);
    const business =
      businessId === null || advertisement.client_name === null ? null : await Business.findOne({ _id: businessId }).lean();
    results.push({
      advt_img: laravelUrl(req, advertisement.advt_img),
      business: business
        ? {
            id: business._id,
            business_name: business.business_name_en ?? business.business_name_hi ?? null,
            slug: business.slug,
          }
        : null,
    });
  }
  return results;
}
