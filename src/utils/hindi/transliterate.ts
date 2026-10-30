// Port of App\Helpers\General::transliterateEnglishToHindi (+ the private helpers it uses) from pocketdd-admin.
// Keep 1:1 with the PHP; dictionaries live in transliterate-dictionaries.ts (generated from General.php).
import * as dictionaries from './transliterate-dictionaries.js';
import { phpTrim } from '../php/values.js';

/** PHP urlencode(): RFC1738 (space → '+', only [A-Za-z0-9_.-] left as-is). */
export function phpUrlencode(text: string): string {
  return encodeURIComponent(text)
    .replace(/[!'()*~]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

// PCRE `\s` with /u (PHP enables UCP): Z categories + \t\n\v\f\r + \x85 + ᠎ (JS `\s` differs: has ﻿, lacks \x85).
const WS = '[\\t\\n\\v\\f\\r\\p{Z}\\x85\\u180E]';
const SPLIT_WS = new RegExp(`(${WS}+)`, 'u');
const ONLY_WS = new RegExp(`^${WS}+$`, 'u');

/** mb_strlen() — code points. */
const mbLen = (text: string) => [...text].length;

/** str_replace(array_keys($r), array_values($r), $text) — sequential, each pair over the whole string. */
function correctKnownTransliterationMistakes(text: string): string {
  for (const [from, to] of dictionaries.correctKnownTransliterationMistakes) text = text.split(from).join(to);
  return text;
}

function applyCommonEnglishPhraseOverrides(text: string): string {
  for (const [phrase, hindi] of dictionaries.commonEnglishPhraseOverrides) {
    const phrasePattern = new RegExp(`(?<!\\p{L})${escapeRegex(phrase)}(?!\\p{L})`, 'giu');
    text = text.replace(phrasePattern, () => hindi);
  }
  return text;
}

export function transliterateEnglishToHindi(text: string): Promise<string> {
  return transliterate(text);
}

async function transliterate(input: string): Promise<string> {
  let text = phpTrim(input);
  if (text === '') return text;

  text = applyCommonEnglishPhraseOverrides(text);

  // preg_split('/(\s+)/u', ..., PREG_SPLIT_DELIM_CAPTURE)
  const parts = text.split(SPLIT_WS);
  let result = '';
  for (const part of parts) {
    if (part === '' || ONLY_WS.test(part)) {
      result += part;
      continue;
    }
    const match = part.match(/^([a-zA-Z0-9'-]+)(.*)$/u);
    if (match) {
      result += (await transliterateEnglishWord(match[1])) + match[2];
      continue;
    }
    result += part;
  }

  return phpTrim(correctKnownTransliterationMistakes(result));
}

async function transliterateEnglishWord(word: string): Promise<string> {
  // strtolower(rtrim($word, '.')) — ASCII-only lowercase (PHP 8).
  const lookup = word.replace(/\.+$/, '').replace(/[A-Z]/g, (char) => char.toLowerCase());

  for (const dict of [
    dictionaries.businessSuffixOverrides,
    dictionaries.architectWordOverrides,
    dictionaries.businessCategoryWordOverrides,
    dictionaries.commonEnglishWordOverrides,
  ]) {
    const hit = dict.get(lookup);
    if (hit !== undefined) return hit;
  }

  if (/^[A-Z]{2,6}$/.test(word)) {
    const hit = dictionaries.transliterationAcronyms.get(word);
    if (hit !== undefined) return hit;
  }

  for (const dict of [
    dictionaries.indianSurnameOverrides,
    dictionaries.jobTitleOverrides,
    dictionaries.hinglishRomanOverrides,
    dictionaries.transliterationOverrides,
  ]) {
    const hit = dict.get(lookup);
    if (hit !== undefined) return hit;
  }

  const candidates = await fetchGoogleTransliterationCandidates(word);
  if (candidates.length === 0) return word;

  const best = pickBestTransliterationCandidate(word, candidates);

  // Never return plain English when input was Latin — prefer first Google option
  if (/^[a-zA-Z]+$/.test(best)) {
    for (const candidate of candidates) {
      if (/\p{Script=Devanagari}/u.test(candidate)) return candidate;
    }
  }
  return best;
}

/** @file_get_contents() of Google Input Tools (default_socket_timeout = 60s; false on failure / HTTP >= 400). */
async function fetchGoogleTransliterationCandidates(word: string): Promise<string[]> {
  const url = 'https://inputtools.google.com/request?text=' + phpUrlencode(word) + '&itc=hi-t-i0-und&num=5';
  let response: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return [];
    response = await res.text();
  } catch {
    return [];
  }
  if (!response || response === '0') return [];

  let data: unknown;
  try {
    data = JSON.parse(response);
  } catch {
    return [];
  }
  const at = (container: unknown, index: number): unknown =>
    container !== null && typeof container === 'object' ? (container as Record<string, unknown>)[index] : undefined;
  if ((at(data, 0) ?? '') !== 'SUCCESS') return [];
  const list = at(at(at(data, 1), 0), 1);
  // isset() && is_array() — a decoded JSON object is a PHP array too.
  if (list === null || list === undefined || typeof list !== 'object') return [];
  const values = Array.isArray(list) ? list : Object.values(list as object);
  return values.filter((value): value is string => typeof value === 'string' && value !== '');
}

function pickBestTransliterationCandidate(english: string, candidates: string[]): string {
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY; // PHP_INT_MIN
  for (const candidate of candidates) {
    const score = scoreTransliterationCandidate(english, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function scoreTransliterationCandidate(english: string, hindi: string): number {
  let score = 0;
  const englishLower = phpTrim(english).replace(/[A-Z]/g, (char) => char.toLowerCase());
  const hindiMatches = (pattern: RegExp) => pattern.test(hindi);

  if (englishLower === 'it' && english !== 'IT') {
    if (hindiMatches(/^इट$/u)) score += 40;
    if (hindiMatches(/आईटी/u)) score -= 50;
  }

  if (englishLower === 'take') {
    if (hindiMatches(/^टेक$/u)) score += 30;
    if (hindiMatches(/टाके/u)) score -= 20;
  }

  if (englishLower === 'will') {
    if (hindiMatches(/^विल$/u)) score += 30;
    if (hindiMatches(/ल्ल/u)) score -= 25;
  }

  if (englishLower === 'kaam' && hindiMatches(/^काम$/u)) score += 35;
  if (englishLower === 'kaam' && hindiMatches(/कायम/u)) score -= 35;

  if (englishLower.startsWith('follow') && hindiMatches(/फॉलो/u)) score += 30;
  if (englishLower.startsWith('follow') && hindiMatches(/फोल्लोव|फोल्लो/u)) score -= 35;

  if (englishLower === 'karte' && hindiMatches(/^करते$/u)) score += 30;
  if (englishLower === 'karte' && hindiMatches(/कर्ते/u)) score -= 25;

  if (englishLower === 'raho' && hindiMatches(/^रहो$/u)) score += 30;
  if (englishLower === 'raho' && hindiMatches(/राहो/u)) score -= 25;

  if (englishLower === 'pvt' || englishLower === 'ltd') {
    if (englishLower === 'pvt' && hindiMatches(/प्राइवेट/u)) score += 40;
    if (englishLower === 'ltd' && hindiMatches(/लिमिटेड/u)) score += 40;
    if (hindiMatches(/पीवीटी|एलटीडी/u)) score -= 30;
  }

  if (/(sharma|verma|gupta|mishra|yadav|singh|patel)$/i.test(englishLower)) {
    if (hindiMatches(/र्मा$/u)) score += 25;
    if (hindiMatches(/ार्मा/u)) score -= 30;
    if (englishLower === 'singh' && hindiMatches(/^सिंह$/u)) score += 30;
    if (englishLower === 'patel' && hindiMatches(/^पटेल$/u)) score += 30;
    if (englishLower === 'yadav' && hindiMatches(/^यादव$/u)) score += 30;
  }

  if (englishLower === 'advocate' && hindiMatches(/^एडवोकेट$/u)) score += 35;
  if (englishLower === 'advocate' && hindiMatches(/अधिवक्ता/u)) score -= 40;
  if (englishLower === 'surgeon' && hindiMatches(/^सर्जन$/u)) score += 35;
  if (englishLower === 'mason' && hindiMatches(/^मेसन$/u)) score += 30;
  if (englishLower === 'mason' && hindiMatches(/मासों/u)) score -= 35;
  if (englishLower === 'head' && hindiMatches(/^हेड$/u)) score += 30;
  if (englishLower === 'head' && hindiMatches(/हेअड/u)) score -= 25;
  if (['enginner', 'engneer', 'enginear'].includes(englishLower) && hindiMatches(/इंजीनियर/u)) score += 40;
  if (englishLower === 'officer' && hindiMatches(/^ऑफिसर$/u)) score += 25;
  if (englishLower === 'lecturer' && hindiMatches(/^लेक्चरर$/u)) score += 25;
  if (englishLower === 'painter' && hindiMatches(/^पेंटर$/u)) score += 25;

  if (/^architect/.test(englishLower)) {
    if (hindiMatches(/आर्किटेक्ट/u)) score += 45;
    if (hindiMatches(/आर्चीटेक्ट|आर्चिटेक्ट/u)) score -= 45;
  }

  if (/^(beverage|baverage|bevarage|beverges|baverages|bevarages|beverages)$/i.test(englishLower)) {
    if (hindiMatches(/बेवरेज/u)) score += 45;
    if (hindiMatches(/बेवरीज|बेवेरागेस|बवेरागेस|बवेरगे/u)) score -= 45;
  }

  if (/^every(day|one|thing|where|body)?s?$/i.test(englishLower)) {
    if (hindiMatches(/एवरी|एव्री/u)) score += 45;
    if (hindiMatches(/एवेर्य्|एवेर्य/u)) score -= 45;
  }

  if (englishLower === 'day' && hindiMatches(/^डे$/u)) score += 35;
  if (englishLower === 'day' && hindiMatches(/दाय|दिन/u)) score -= 35;

  if (englishLower === 'daily' && hindiMatches(/^डेली$/u)) score += 35;
  if (englishLower === 'daily' && hindiMatches(/डािलय|दैनिक/u)) score -= 35;

  if (englishLower === 'night' && hindiMatches(/^नाइट$/u)) score += 35;
  if (englishLower === 'night' && hindiMatches(/निगहत|रात/u)) score -= 35;

  if (englishLower === 'offline' && hindiMatches(/ऑफलाइन/u)) score += 35;
  if (englishLower === 'offline' && hindiMatches(/ओफ़्फ़्ल|ऑफ्लइ/u)) score -= 35;

  // Reject garbled matra-only / broken Devanagari
  if (hindiMatches(/^[ऺ-ॏऀ-ः]/u)) score -= 50;

  // strlen() — bytes; the English word is ASCII here.
  const enLen = Buffer.byteLength(englishLower, 'utf8');
  if (enLen <= 5 && hindiMatches(/^(और|उप|जो|मन|इस|मई|नई|उस|तहत|बात|लिखे|कायम|कर्ते|राहो|फोल्लोव)$/u)) score -= 40;

  if (/^[a-zA-Z]+$/.test(hindi)) score -= 100;

  if (enLen <= 4) {
    if (mbLen(hindi) > enLen + 3) score -= 15;
    if (hindiMatches(/(.)\1{2,}/u)) score -= 20;
  }

  if (/^tr/i.test(english)) {
    if (hindi.startsWith('ट्र')) score += 25;
    if (hindi.startsWith('त्रि')) score -= 25;
    if (englishLower === 'train' && hindiMatches(/^ट्रेन/u)) score += 20;
  }

  if (hindiMatches(/रेलगाड़ी|विद्यालय|पुस्तकालय|सिखाना/u)) score -= 50;

  if (englishLower.startsWith('conv') || englishLower.includes('vers')) {
    if (hindiMatches(/कन्व/u)) score += 20;
    if (hindiMatches(/कंवर/u)) score -= 25;
  }

  if (/(tion|sion)s?$/i.test(english)) {
    if (hindiMatches(/शन/u)) score += 15;
    if (hindiMatches(/र्ज/u)) score += 10;
    if (hindiMatches(/सीओं/u)) score -= 30;
    if (hindiMatches(/सिओं/u)) score -= 25;
  }

  const ratio = mbLen(hindi) / Math.max(1, enLen);
  if (ratio >= 1.0 && ratio <= 2.2) score += 5;
  if (ratio > 2.5) score -= Math.trunc((ratio - 2.5) * 10);

  return score;
}
