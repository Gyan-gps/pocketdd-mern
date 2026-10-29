// Port of ApiController::unicode_to_krutidev() (pocketdd-admin). Operates on code points like PHP's mb_* functions.
import { KD_MATRAS, KD_ONE, KD_SPECIAL, KD_TWO } from './krutidev-tables.js';
import { phpTrim } from '../php/values.js';

const replaceAll = (s: string, from: string, to: string) => (from === '' ? s : s.split(from).join(to));

// mb_* helpers over code points.
const cps = (s: string) => Array.from(s);
const mbStrpos = (s: string, needle: string, offset = 0): number | false => {
  const arr = cps(s);
  const n = cps(needle);
  for (let i = offset; i + n.length <= arr.length; i++) {
    let ok = true;
    for (let j = 0; j < n.length; j++) if (arr[i + j] !== n[j]) { ok = false; break; }
    if (ok) return i;
  }
  return false;
};
const mbSubstr = (s: string, start: number, length?: number): string => {
  const arr = cps(s);
  const st = start < 0 ? Math.max(arr.length + start, 0) : start;
  if (length === undefined) return arr.slice(st).join('');
  const end = length < 0 ? arr.length + length : st + length;
  return arr.slice(st, Math.max(end, st)).join('');
};

export function unicodeToKrutidev(unicodeSubstring: string): string {
  let m = unicodeSubstring;

  // Specialty characters
  for (const [a, b] of KD_SPECIAL) m = replaceAll(m, a, b);

  // Replace Unicode with ASCII
  for (let i = 0; i < KD_ONE.length; i++) m = replaceAll(m, KD_ONE[i]!, KD_TWO[i]!);

  // Move "f" to correct position
  m = '  ' + m + '  ';
  let posF = mbStrpos(m, 'f');
  while (posF !== false) {
    m = mbSubstr(m, 0, posF - 1) + mbSubstr(m, posF, 1) + mbSubstr(m, posF - 1, 1) + mbSubstr(m, posF + 1);
    posF = mbStrpos(m, 'f', posF + 1);
  }
  m = phpTrim(m);

  // Move "half R" to correct position and replace
  m = '  ' + m + '  ';
  let posR = mbStrpos(m, 'j~');
  while (posR !== false) {
    const pos = mbStrpos(m, 'j~') as number;
    m = mbSubstr(m, 0, pos) + mbSubstr(m, pos + 2);
    const next = mbSubstr(m, posR + 1, 1);
    if (KD_MATRAS.includes(next)) {
      m = mbSubstr(m, 0, posR + 2) + 'Z' + mbSubstr(m, posR + 2);
    } else {
      m = mbSubstr(m, 0, posR + 1) + 'Z' + mbSubstr(m, posR + 1);
    }
    posR = mbStrpos(m, 'j~');
  }
  return phpTrim(m);
}
