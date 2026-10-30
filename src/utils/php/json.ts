// PHP json_encode() with default flags (as used by Eloquent `json`/`array` casts — Model::asJson()):
// '/' is escaped as '\/' and every non-ASCII character as a lowercase \uXXXX UTF-16 escape.
// JS arrays encode as JSON lists, plain objects as JSON objects (PHP list vs. associative array).

const NON_ASCII = /[\u0080-\uffff]/g;
const LINE_TERMINATORS = /[\u2028\u2029]/g;
const hex4 = (char: string) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');

export interface PhpJsonFlags {
  /** JSON_UNESCAPED_UNICODE */
  unescapedUnicode?: boolean;
  /** JSON_UNESCAPED_SLASHES */
  unescapedSlashes?: boolean;
}

export function phpJsonEncode(value: unknown, flags: PhpJsonFlags = {}): string {
  let json = JSON.stringify(value === undefined ? null : value) ?? 'null';
  if (!flags.unescapedSlashes) json = json.replace(/\//g, '\\/');
  // PHP escapes U+2028/U+2029 even with JSON_UNESCAPED_UNICODE (unless JSON_UNESCAPED_LINE_TERMINATORS).
  json = flags.unescapedUnicode ? json.replace(LINE_TERMINATORS, hex4) : json.replace(NON_ASCII, hex4);
  return json;
}

/** PHP `===` between two json_decode($x, true) results (arrays compare key order + strict values). */
export function phpStrictEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftEntries = Array.isArray(left) ? left.map((v, i) => [String(i), v] as const) : Object.entries(left as object);
  const rightEntries = Array.isArray(right) ? right.map((v, i) => [String(i), v] as const) : Object.entries(right as object);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([k, v], i) => rightEntries[i]![0] === k && phpStrictEqual(v, rightEntries[i]![1]));
}
