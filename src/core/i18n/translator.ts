import { LanguageLine } from '../../models/index.js';

/**
 * Laravel `__()` as configured in pocketdd-admin: Spatie TranslationLoaderManager over an app with no
 * `resources/lang` files, so the only translations are rows in `language_lines`
 * (`group`, dotted `key`, `text` = {"en": "..."}). Missing keys return the key itself, exactly like
 * Laravel — which is why validation messages currently come out as e.g. `validation.required`.
 */
const LOCALE = 'en';
const TTL_MS = 60_000;

type Tree = Record<string, unknown>;
const cache = new Map<string, { at: number; tree: Tree }>();

async function loadGroup(group: string): Promise<Tree> {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tree;
  const tree: Tree = {};
  try {
    const rows = await LanguageLine.find({ group }, { key: 1, text: 1 }).lean();
    for (const row of rows) {
      let text: unknown = row.text;
      if (typeof text === 'string') text = JSON.parse(text);
      const value = (text as Record<string, unknown> | null)?.[LOCALE];
      if (value === undefined || value === null) continue;
      // Arr::set() — dotted keys become nested arrays.
      const parts = String(row.key).split('.');
      let node = tree;
      for (const part of parts.slice(0, -1)) {
        node = (node[part] = typeof node[part] === 'object' && node[part] ? node[part] : {}) as Tree;
      }
      node[parts.at(-1)!] = value;
    }
  } catch {
    // Spatie falls back to file translations (none here) when the table is unavailable.
  }
  cache.set(group, { at: Date.now(), tree });
  return tree;
}

/** `__('group.key.sub')` — returns the translation (string or nested object) or the key. */
export async function trans(fullKey: string): Promise<unknown> {
  const [group, ...rest] = fullKey.split('.');
  let node: unknown = await loadGroup(group!);
  for (const part of rest) {
    if (!node || typeof node !== 'object' || !(part in node)) return fullKey;
    node = (node as Tree)[part];
  }
  return rest.length ? node : fullKey;
}

/** String-only variant: non-string results fall back to the key. */
export async function transString(fullKey: string): Promise<string | null> {
  const translation = await trans(fullKey);
  return typeof translation === 'string' && translation !== fullKey ? translation : null;
}
