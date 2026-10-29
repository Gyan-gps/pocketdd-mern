// Port of the App\Helpers\General helpers the API controllers call.
import { PhpError } from '../core/http/response.js';
import { transliterateEnglishToHindi } from './hindi/transliterate.js';
import { phpStr, phpTrim } from './php/values.js';

/**
 * `(new General)->quickTranslate($text)` as consumed by Business::insertNewBusiness():
 * `json_decode($response->getContent(), true)['data']['translated_text'] ?? null`.
 */
export async function quickTranslatedText(text: unknown): Promise<string | null> {
  if (Array.isArray(text) || (text !== null && typeof text === 'object')) {
    throw new PhpError(`trim(): Argument #1 ($string) must be of type string, array given`);
  }
  const t = phpTrim(phpStr(text));
  if (t === '' || t === '0') return null; // empty() → 400 {"error": …}
  const out = await transliterateEnglishToHindi(t);
  return out === '' ? null : out;
}

/** General::generateSeriesFromId(). */
export function generateSeriesFromId(id: number): string {
  let group = Math.trunc((id - 1) / 999);
  const number = ((id - 1) % 999) + 1;
  let letters = '';
  while (group >= 0) {
    letters = String.fromCharCode((group % 26) + 65) + letters;
    group = Math.trunc(group / 26) - 1;
  }
  return letters.padStart(2, 'A') + String(number).padStart(3, '0');
}

