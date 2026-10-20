import type { Request } from 'express';
import { all, first } from '../db/pool.js';
import { laravelUrl } from '../helpers/phase5.js';

/**
 * Advertisment::where('ads_position','inner')->where('ads_location',$loc)->where('status',1)
 *   ->get(['advt_img','client_name'])->map(fn => ['advt_img' => url(...), 'business' => Business::find(client_name)...])
 * Shared by EventController and NotificationController.
 */
export async function innerAdsWithBusiness(req: Request, adsLocation: string): Promise<Record<string, unknown>[]> {
  const ads = await all(
    'SELECT advt_img, client_name FROM advertisments WHERE ads_position = ? AND ads_location = ? AND status = ?',
    ['inner', adsLocation, 1],
  );
  const out: Record<string, unknown>[] = [];
  for (const ad of ads) {
    const business = await first('SELECT * FROM businesses WHERE id = ? LIMIT 1', [ad.client_name]);
    out.push({
      advt_img: laravelUrl(req, ad.advt_img),
      business: business
        ? {
            id: business.id,
            business_name: business.business_name_en ?? business.business_name_hi ?? null,
            slug: business.slug,
          }
        : null,
    });
  }
  return out;
}
