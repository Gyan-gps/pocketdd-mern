// Port of App\Console\Commands\TranslateCitiesToHindi (`translate:cities-hindi`).
// NOTE: not scheduled in Laravel (App\Console\Kernel is unused in Laravel 12 and routes/console.php has it commented out).
import { type Filter } from '../db/mongo.js';
import { CASE_INSENSITIVE } from '../db/eloquent.js';
import { Pincode } from '../models/index.js';
import { nowDb } from '../core/time.js';
import { phpTrim } from '../utils/php/values.js';
import { transliterateEnglishToHindi } from '../utils/hindi/transliterate.js';
import { Log } from '../core/logging/log.js';
import { type CommandIO, SUCCESS } from './command-io.js';

const phpEmpty = (value: unknown) => value === null || value === undefined || value === '' || value === '0';

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
    const found = await Pincode.aggregate<{ _id: string }>([
      { $match: { city: { $nin: [null, ''] }, ...(opts.where ?? {}) } as Record<string, unknown> },
      { $group: { _id: '$city' } },
      { $sort: { _id: 1 } },
      { $skip: page * 100 },
      { $limit: 100 },
    ]).option({ collation: CASE_INSENSITIVE });
    const cities = found.map((group) => ({ city: group._id }));
    if (!cities.length) break;

    for (const city of cities) {
      try {
        const translatedCity = await quickTranslate(String(city.city));
        if (phpEmpty(translatedCity)) {
          io.warn(`Translation failed for ${city.city}`);
          continue;
        }
        await Pincode.updateMany(
          { city: city.city },
          { $set: { city_hi: translatedCity, updated_at: nowDb() } },
          { collation: CASE_INSENSITIVE },
        );
        io.info(`${city.city} => ${translatedCity}`);
        totalTranslated++;
        if (sleepMs) await new Promise((resolve) => setTimeout(resolve, sleepMs)); // usleep(300000)
      } catch (error) {
        io.error(`Error translating ${city.city}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (cities.length < 100) break;
  }

  io.info(`Completed. Total translated cities: ${totalTranslated}`);
  return SUCCESS;
}
