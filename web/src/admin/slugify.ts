// Subset of simov/slugify (used by Backpack's `slug` field JS) for Latin input.
export function slugify(
  input: string,
  opts: { separator?: string; lower?: boolean; strict?: boolean; trim?: boolean; remove?: RegExp } = {},
): string {
  const replacement = opts.separator ?? '-';
  let s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(opts.remove ?? /[^\w\s$*_+~.()'"!\-:@]+/g, '');
  if (opts.strict) s = s.replace(/[^A-Za-z0-9\s]/g, '');
  if (opts.trim !== false) s = s.trim();
  s = s.replace(/\s+/g, replacement);
  return opts.lower ? s.toLowerCase() : s;
}
