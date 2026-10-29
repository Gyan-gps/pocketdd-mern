// Port of App\Console\Commands\TranslateCitiesToHindi (`translate:cities-hindi`).
// NOTE: not scheduled in Laravel (App\Console\Kernel is unused in Laravel 12 and routes/console.php has it commented out).
import { C, col, type Filter } from '../db/mongo.js';
import { nowDb } from '../core/time.js';
import { phpTrim } from '../utils/php/values.js';
import { transliterateEnglishToHindi } from '../utils/hindi/transliterate.js';
import { Log } from '../core/logging/log.js';
import { type CommandIO, SUCCESS } from './command-io.js';

const CI = { locale: 'en', strength: 2 } as const;
const phpEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === '0';

/** General::quickTranslate() → the decoded JSON body's data.translated_text (or null on its error responses). */
async function quickTranslate(text: string): Promise<string | null> {
  text = phpTrim(text);
  if (phpEmpty(text)) return null; // 400 {"error":"Input text is required."}
  const transliterated = await transliterateEnglishToHindi(text);
  if (transliterated === '') return null; // 500 {"error":"Transliteration failed."}
  return transliterated;
}

export async function translateCitiesHindi(io: CommandIO, opts: { sleepMs?: number; where?: Filter<any> } = {}): Promise<number> {
  const sleepMs = opts.sleepMs ?? 300;
  Log.info('TranslateCitiesToHindi Cron Started', { date: nowDb().slice(0, 10) });
  let totalTranslated = 0;

  // ->groupBy('city')->orderBy('city')->chunk(100): offset pagination.
  // `opts.where` is a test-only extra filter (not in the PHP).
  for (let page = 0; ; page++) {
    // MySQL's collation groups and orders cities case-insensitively.
    const found = await col(C.pincodes)
      .aggregate(
        [
          { $match: { city: { $nin: [null, ''] }, ...(opts.where ?? {}) } },
          { $group: { _id: '$city' } },
          { $sort: { _id: 1 } },
          { $skip: page * 100 },
          { $limit: 100 },
        ],
        { collation: CI },
      )
      .toArray();
    const cities = found.map((r) => ({ city: r._id as string }));
    if (!cities.length) break;

    for (const city of cities) {
      try {
        const translatedCity = await quickTranslate(String(city.city));
        if (phpEmpty(translatedCity)) {
          io.warn(`Translation failed for ${city.city}`);
          continue;
        }
        await col(C.pincodes).updateMany(
          { city: city.city },
          { $set: { city_hi: translatedCity, updated_at: nowDb() } },
          { collation: CI },
        );
        io.info(`${city.city} => ${translatedCity}`);
        totalTranslated++;
        if (sleepMs) await new Promise((r) => setTimeout(r, sleepMs)); // usleep(300000)
      } catch (e) {
        io.error(`Error translating ${city.city}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (cities.length < 100) break;
  }

  io.info(`Completed. Total translated cities: ${totalTranslated}`);
  return SUCCESS;
}
