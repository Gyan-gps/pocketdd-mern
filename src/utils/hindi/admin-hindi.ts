// Port of App\Helpers\General::normalizeAdminHindiField() + krutidevToUnicode() + looksLikeEnglishText()
// (pocketdd-admin/app/Helpers/General.php). Keep 1:1 with the PHP.
import * as dictionaries from './transliterate-dictionaries.js';
import { phpTrim } from '../php/values.js';
import { transliterateEnglishToHindi } from './transliterate.js';

/** PHP strtr($s, $map): longest key first at each position, replaced text is never rescanned. */
function strtr(text: string, map: Record<string, string>): string {
  const keys = Object.keys(map).filter((key) => key !== '');
  const maxLen = Math.max(0, ...keys.map((key) => key.length));
  let out = '';
  let i = 0;
  outer: while (i < text.length) {
    for (let len = Math.min(maxLen, text.length - i); len > 0; len--) {
      const piece = text.substr(i, len);
      if (Object.prototype.hasOwnProperty.call(map, piece)) {
        out += map[piece];
        i += len;
        continue outer;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

const MAP_LONG: Record<string, string> = {
  vkS: 'औ', vks: 'ओ', vk: 'आ', ',s': 'ऐ', '?k': 'घ', '/k': 'ध', Fk: 'थ', Hk: 'भ', '.k': 'ण', '[k': 'ख',
  'D+': 'ढ़', DD: 'ड़', '=k': 'क़', '=h': 'ख़', '=g': 'ग़', '=j': 'ज़', '=t': 'ड़', '=f': 'ढ़', '=n': 'फ़',
  kS: 'ौ', ks: 'ो', "'k": 'श', '"k': 'ष',
};

const MAP_SINGLE: Record<string, string> = {
  v: 'अ', b: 'इ', B: 'ई', m: 'उ', ',': 'ए', d: 'क', x: 'ग', p: 'च', N: 'छ', t: 'ज', '>': 'झ', V: 'ट',
  M: 'ड', '<': 'ढ', r: 'त', n: 'द', u: 'न', i: 'प', Q: 'फ', c: 'ब', e: 'म', ';': 'य', j: 'र', y: 'ल',
  o: 'व', l: 'स', g: 'ह', k: 'ा', f: 'ि', h: 'ी', q: 'ु', w: 'ू', s: 'े', S: 'ै', Z: 'ृ', a: 'ं',
  '~': 'ँ', '%': 'ः', '\\': '्',
};

// PCRE \s with /u (UCP): Unicode whitespace + \x85.
const WS_RUN = /[\t\n\v\f\r\p{Z}\x85᠎]+/gu;

export function krutidevToUnicode(text: string): string {
  text = strtr(text, MAP_LONG);
  text = strtr(text, MAP_SINGLE);
  text = text.replace(/(ि)([क-हक़-य़])/gu, '$2$1');
  text = text.replace(WS_RUN, ' ');
  return phpTrim(text);
}

function correctKnownTransliterationMistakes(text: string): string {
  for (const [from, to] of dictionaries.correctKnownTransliterationMistakes) text = text.split(from).join(to);
  return text;
}

function looksLikeEnglishText(text: string): boolean {
  if (/[;\\[\]?=<>%]/.test(text)) return false;
  return /^[a-zA-Z0-9\t\n\v\f\r\p{Z}\x85᠎\-&().,']+$/u.test(text);
}

/** General::normalizeAdminHindiField((string) $text). */
export async function normalizeAdminHindiField(input: string | null): Promise<string> {
  if (typeof input !== 'string') return '';
  let text = phpTrim(input);
  if (text === '') return text;
  text = correctKnownTransliterationMistakes(text);
  // /^[\p{Devanagari}\s\d\p{P}]+$/u  (\d with /u is ASCII-only in PCRE2 without UCP digits → \p{Nd})
  if (/^[\p{Script=Devanagari}\t\n\v\f\r\p{Z}\x85᠎\p{Nd}\p{P}]+$/u.test(text)) return text;
  if (looksLikeEnglishText(text)) return transliterateEnglishToHindi(text);
  const containsHindi = /\p{Script=Devanagari}/u.test(text);
  const containsLatin = /[a-zA-Z.;,/[\]\-=]+/.test(text);
  if (containsHindi && !containsLatin) return text;
  if (!containsHindi && containsLatin) return krutidevToUnicode(text);
  const parts: Array<string | Promise<string>> = [];
  let last = 0;
  for (const match of text.matchAll(/[a-zA-Z0-9.;,/[\]\-=]+/g)) {
    parts.push(text.slice(last, match.index));
    parts.push(looksLikeEnglishText(match[0]) ? transliterateEnglishToHindi(match[0]) : Promise.resolve(krutidevToUnicode(match[0])));
    last = match.index! + match[0].length;
  }
  parts.push(text.slice(last));
  return (await Promise.all(parts)).join('');
}
