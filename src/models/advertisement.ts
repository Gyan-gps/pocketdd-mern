import type { Request } from 'express';
import { C, col, intId } from '../db/mongo.js';
import { laravelUrl } from '../utils/php/compat.js';

type Doc = { _id: number; [k: string]: any };
const CI = { locale: 'en', strength: 2 };

/**
 * Advertisment::where('ads_position','inner')->where('ads_location',$loc)->where('status',1)
 *   ->get(['advt_img','client_name'])->map(fn => ['advt_img' => url(...), 'business' => Business::find(client_name)...])
 * Shared by EventController and NotificationController.
 */
export async function innerAdsWithBusiness(req: Request, adsLocation: string): Promise<Record<string, unknown>[]> {
  const ads = await col<Doc>(C.advertisements)
    .find(
      { ads_position: 'inner', ads_location: adsLocation, status: 1 },
      { projection: { _id: 0, advt_img: 1, client_name: 1 }, collation: CI, sort: { _id: 1 } },
    )
    .toArray();
  const out: Record<string, unknown>[] = [];
  for (const ad of ads) {
    const id = intId(ad.client_name);
    const business = id === null || ad.client_name === null ? null : await col<Doc>(C.businesses).findOne({ _id: id });
    out.push({
      advt_img: laravelUrl(req, ad.advt_img),
      business: business
        ? {
            id: business._id,
            business_name: business.business_name_en ?? business.business_name_hi ?? null,
            slug: business.slug,
          }
        : null,
    });
  }
  return out;
}
