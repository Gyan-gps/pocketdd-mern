// Port of ApiController::unicode_to_krutidev() (pocketdd-admin). Operates on code points like PHP's mb_* functions.
import { KD_MATRAS, KD_ONE, KD_SPECIAL, KD_TWO } from './krutidev-tables.js';
import { phpTrim } from '../php/values.js';

const replaceAll = (text: string, from: string, to: string) => (from === '' ? text : text.split(from).join(to));

// mb_* helpers over code points.
const cps = (text: string) => Array.from(text);
const mbStrpos = (haystack: string, needle: string, offset = 0): number | false => {
  const points = cps(haystack);
  const needlePoints = cps(needle);
  for (let i = offset; i + needlePoints.length <= points.length; i++) {
    let matches = true;
    for (let j = 0; j < needlePoints.length; j++) if (points[i + j] !== needlePoints[j]) { matches = false; break; }
    if (matches) return i;
  }
  return false;
};
const mbSubstr = (text: string, start: number, length?: number): string => {
  const points = cps(text);
  const from = start < 0 ? Math.max(points.length + start, 0) : start;
  if (length === undefined) return points.slice(from).join('');
  const end = length < 0 ? points.length + length : from + length;
  return points.slice(from, Math.max(end, from)).join('');
};

export function unicodeToKrutidev(unicodeSubstring: string): string {
  let text = unicodeSubstring;

  // Specialty characters
  for (const [from, to] of KD_SPECIAL) text = replaceAll(text, from, to);

  // Replace Unicode with ASCII
  for (let i = 0; i < KD_ONE.length; i++) text = replaceAll(text, KD_ONE[i]!, KD_TWO[i]!);

  // Move "f" to correct position
  text = '  ' + text + '  ';
  let posF = mbStrpos(text, 'f');
  while (posF !== false) {
    text = mbSubstr(text, 0, posF - 1) + mbSubstr(text, posF, 1) + mbSubstr(text, posF - 1, 1) + mbSubstr(text, posF + 1);
    posF = mbStrpos(text, 'f', posF + 1);
  }
  text = phpTrim(text);

  // Move "half R" to correct position and replace
  text = '  ' + text + '  ';
  let posR = mbStrpos(text, 'j~');
  while (posR !== false) {
    const pos = mbStrpos(text, 'j~') as number;
    text = mbSubstr(text, 0, pos) + mbSubstr(text, pos + 2);
    const next = mbSubstr(text, posR + 1, 1);
    if (KD_MATRAS.includes(next)) {
      text = mbSubstr(text, 0, posR + 2) + 'Z' + mbSubstr(text, posR + 2);
    } else {
      text = mbSubstr(text, 0, posR + 1) + 'Z' + mbSubstr(text, posR + 1);
    }
    posR = mbStrpos(text, 'j~');
  }
  return phpTrim(text);
}
