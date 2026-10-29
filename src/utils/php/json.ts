// PHP json_encode() with default flags (as used by Eloquent `json`/`array` casts — Model::asJson()):
// '/' is escaped as '\/' and every non-ASCII character as a lowercase \uXXXX UTF-16 escape.
// JS arrays encode as JSON lists, plain objects as JSON objects (PHP list vs. associative array).

const NON_ASCII = /[\u0080-\uffff]/g;
const LINE_TERMINATORS = /[\u2028\u2029]/g;
const hex4 = (c: string) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');

export interface PhpJsonFlags {
  /** JSON_UNESCAPED_UNICODE */
  unescapedUnicode?: boolean;
  /** JSON_UNESCAPED_SLASHES */
  unescapedSlashes?: boolean;
}

export function phpJsonEncode(value: unknown, flags: PhpJsonFlags = {}): string {
  let s = JSON.stringify(value === undefined ? null : value) ?? 'null';
  if (!flags.unescapedSlashes) s = s.replace(/\//g, '\\/');
  // PHP escapes U+2028/U+2029 even with JSON_UNESCAPED_UNICODE (unless JSON_UNESCAPED_LINE_TERMINATORS).
  s = flags.unescapedUnicode ? s.replace(LINE_TERMINATORS, hex4) : s.replace(NON_ASCII, hex4);
  return s;
}

/** PHP `===` between two json_decode($x, true) results (arrays compare key order + strict values). */
export function phpStrictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const ea = Array.isArray(a) ? a.map((v, i) => [String(i), v] as const) : Object.entries(a as object);
  const eb = Array.isArray(b) ? b.map((v, i) => [String(i), v] as const) : Object.entries(b as object);
  if (ea.length !== eb.length) return false;
  return ea.every(([k, v], i) => eb[i]![0] === k && phpStrictEqual(v, eb[i]![1]));
}
