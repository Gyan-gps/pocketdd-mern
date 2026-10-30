import { countWhere } from '../../db/mongo.js';
import { trans, transString } from '../i18n/translator.js';

/**
 * Subset of Laravel's Validator: rule strings like `required|digits:10`, `field.rule` custom messages,
 * `items.*` wildcards, and Laravel's message lookup (inline → translator → raw key; see i18n/translator). Only `firstError()` ordering matters
 * to the API (controllers return `$validator->errors()->first()`).
 */
export type Rules = Record<string, string>;
export type Messages = Record<string, string>;
type Input = Record<string, unknown>;

const IMPLICIT = new Set(['required', 'present', 'accepted', 'required_if']);

const SIZE_RULES = new Set(['max', 'min', 'size', 'between', 'gt', 'lt', 'gte', 'lte']);

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

const isFile = (value: unknown): value is UploadedFile =>
  !!value && typeof value === 'object' && 'originalname' in value && 'size' in value;
const isAssoc = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !isFile(value);
const isNumeric = (value: unknown) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(value));

/** Laravel `validateRequired`. */
function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isFile(value)) return value.originalname !== '';
  if (isAssoc(value)) return Object.keys(value).length > 0;
  return true;
}

/** Laravel `Str::snake()` then `_` → space (getDisplayableAttribute). */
function displayName(attr: string): string {
  return attr
    .replace(/\s+/g, '')
    .replace(/(.)(?=[A-Z])/g, '$1_')
    .toLowerCase()
    .replace(/_/g, ' ');
}

function getPath(input: Input, path: string): { exists: boolean; value: unknown } {
  let cur: unknown = input;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return { exists: false, value: undefined };
  }
  return { exists: true, value: cur };
}

/** Expand `items.*.id` into concrete keys present in the input (Laravel ValidationData). */
function expand(input: Input, pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern];
  const [head, ...rest] = pattern.split('.*');
  const { value } = getPath(input, head!);
  if (!value || typeof value !== 'object') return [];
  const tail = rest.join('.*');
  return Object.keys(value).flatMap((key) => expand(input, `${head}.${key}${tail}`));
}

function sizeKind(value: unknown, rules: string[]): 'numeric' | 'array' | 'file' | 'string' {
  if (isFile(value)) return 'file';
  if (Array.isArray(value)) return 'array';
  if (rules.some((rule) => rule === 'numeric' || rule === 'integer') && isNumeric(value)) return 'numeric';
  return 'string';
}

function sizeOf(value: unknown, kind: string): number {
  if (kind === 'file') return (value as UploadedFile).size / 1024;
  if (kind === 'array') return (value as unknown[]).length;
  if (kind === 'numeric') return Number(value);
  return [...String(value ?? '')].length;
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp'];

async function passes(rule: string, params: string[], value: unknown, rules: string[], input?: Input): Promise<boolean> {
  switch (rule) {
    case 'required':
      return present(value);
    case 'nullable':
    case 'sometimes':
    case 'bail':
      return true;
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value) || isAssoc(value);
    case 'numeric':
      return isNumeric(value);
    case 'integer':
      return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^[+-]?\d+$/.test(value));
    case 'boolean':
      return [true, false, 0, 1, '0', '1'].includes(value as never);
    case 'digits': {
      const digits = typeof value === 'number' ? String(value) : value;
      return typeof digits === 'string' && /^\d+$/.test(digits) && digits.length === Number(params[0]);
    }
    case 'in':
      return (typeof value === 'string' || typeof value === 'number') && params.includes(String(value));
    case 'email':
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'url':
      return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'max':
    case 'min': {
      const kind = sizeKind(value, rules);
      if (kind === 'numeric' && !isNumeric(value)) return false;
      const size = sizeOf(value, kind);
      return rule === 'max' ? size <= Number(params[0]) : size >= Number(params[0]);
    }
    case 'image':
      return isFile(value) && IMAGE_MIMES.includes(value.mimetype);
    case 'mimes': {
      if (!isFile(value)) return false;
      const ext = value.originalname.split('.').pop()?.toLowerCase() ?? '';
      const allowed = params.map((param) => param.toLowerCase());
      return allowed.includes(ext) || (ext === 'jpeg' && allowed.includes('jpg')) || (ext === 'jpg' && allowed.includes('jpeg'));
    }
    case 'after_or_equal': {
      // compareDates(): the parameter is a date, else the value of that field; null other date → passes (PHP 8 int >= null).
      if (typeof value !== 'string' && typeof value !== 'number') return false;
      const timestamp = Date.parse(String(value));
      if (Number.isNaN(timestamp)) return false;
      let other = Date.parse(params[0] ?? '');
      if (Number.isNaN(other)) {
        const otherValue = input ? getPath(input, params[0] ?? '').value : undefined;
        if (otherValue === null || otherValue === undefined) return true;
        other = Date.parse(String(otherValue));
        if (Number.isNaN(other)) return true;
      }
      return timestamp >= other;
    }
    case 'required_if': {
      // required_if:other,value… — required when the other field (string-compared) equals one of the values.
      const other = input ? getPath(input, params[0] ?? '').value : undefined;
      const otherStr = other === true ? '1' : other === false ? '0' : other === null || other === undefined ? '' : String(other);
      if (!params.slice(1).includes(otherStr)) return true;
      return present(value);
    }
    case 'size':
      return sizeOf(value, sizeKind(value, rules)) === Number(params[0]);
    case 'regex': {
      // `regex:/pattern/flags` (params re-joined: the pattern may contain commas).
      if (typeof value !== 'string' && typeof value !== 'number') return false;
      const match = /^\/(.*)\/([a-z]*)$/s.exec(params.join(','));
      if (!match) return false;
      return new RegExp(match[1]!, match[2]!.replace(/[^imsu]/g, '')).test(String(value));
    }
    case 'mimetypes': {
      // Laravel compares the server-guessed MIME type (finfo): sniff common image signatures, else the client type.
      if (!isFile(value)) return false;
      const bytes = value.buffer;
      let mime = value.mimetype;
      if (bytes && bytes.length >= 4) {
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = 'image/png';
        else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
        else if (bytes.subarray(0, 4).toString() === 'GIF8') mime = 'image/gif';
      }
      return params.includes(mime) || params.includes(`${mime.split('/')[0]}/*`);
    }
    case 'exists':
    case 'unique': {
      const [table, column] = params;
      if (rule === 'unique' && params[2] !== undefined && params[2] !== '' && params[2] !== 'NULL') {
        // unique:table,column,ignoreId[,idColumn] — Rule::unique()->ignore($id).
        const matching = await countWhere(table!, column!, value, { column: params[3] ?? 'id', value: params[2] });
        return matching === 0;
      }
      const count = await countWhere(table!, column!, value);
      return rule === 'exists' ? count > 0 : count === 0;
    }
    default:
      throw new Error(`Unsupported validation rule: ${rule}`);
  }
}

/** Validator::getMessage() + makeReplacements(). */
async function message(
  attr: string,
  pattern: string,
  rule: string,
  params: string[],
  value: unknown,
  rules: string[],
  custom: Messages,
): Promise<string> {
  // getFromLocalArray() keys: "attr.rule", "rule", then the bare attribute (Laravel 10+).
  let template = custom[`${attr}.${rule}`] ?? custom[`${pattern}.${rule}`] ?? custom[rule] ?? custom[attr];
  if (template === undefined) {
    const customLine = await trans(`validation.custom.${pattern}.${rule}`);
    if (typeof customLine === 'string' && customLine !== `validation.custom.${pattern}.${rule}`) template = customLine;
  }
  if (template === undefined) {
    const key = SIZE_RULES.has(rule) ? `validation.${rule}.${sizeKind(value, rules)}` : `validation.${rule}`;
    const line = await trans(key);
    template = typeof line === 'string' ? line : key;
  }
  const display = (await transString(`validation.attributes.${attr}`)) ?? displayName(attr);
  return template
    .replace(/:attribute/g, display)
    .replace(/:Attribute/g, display.charAt(0).toUpperCase() + display.slice(1))
    .replace(/:ATTRIBUTE/g, display.toUpperCase())
    .replace(/:digits/g, params[0] ?? '')
    .replace(/:max/g, params[0] ?? '')
    .replace(/:min/g, params[0] ?? '')
    .replace(/:values/g, params.join(', '))
    // replaceInputPlaceholder(): scalar/null values only (getDisplayableValue: null → 'empty', bool → 'true'/'false').
    .replace(/:input/g, () =>
      value === null || value === undefined ? 'empty' : typeof value === 'boolean' ? String(value) : typeof value === 'object' ? ':input' : String(value),
    );
}

export class ValidationResult {
  constructor(private readonly errors: Map<string, string[]>) {}

  fails(): boolean {
    return this.errors.size > 0;
  }

  /** `$validator->errors()->first()`. */
  first(): string {
    for (const msgs of this.errors.values()) if (msgs.length) return msgs[0]!;
    return '';
  }

  all(): Record<string, string[]> {
    return Object.fromEntries(this.errors);
  }
}

/** `Validator::make($input, $rules, $messages)` — runs every rule, keeps Laravel's error order. */
export async function validate(input: Input, rules: Rules, custom: Messages = {}): Promise<ValidationResult> {
  const errors = new Map<string, string[]>();
  // ValidationRuleParser::explodeRules(): wildcard rules are unset and their expansions appended after
  // the explicit ones, so `items.*.x` errors always follow plain-attribute errors.
  const entries = Object.entries(rules);
  const ordered = [...entries.filter(([key]) => !key.includes('*')), ...entries.filter(([key]) => key.includes('*'))];
  for (const [pattern, ruleString] of ordered) {
    const list = ruleString.split('|').filter(Boolean);
    const nullable = list.includes('nullable');
    const bail = list.includes('bail');
    for (const attr of expand(input, pattern)) {
      const { exists, value } = getPath(input, attr);
      for (const raw of list) {
        const [rule, paramStr = ''] = raw.split(/:(.*)/s) as [string, string?];
        const params = paramStr ? paramStr.split(',') : [];
        // Non-implicit rules are skipped for absent attributes, and for null when `nullable`.
        if (!IMPLICIT.has(rule) && (!exists || (nullable && value === null))) continue;
        // hasNotFailedPreviousRuleIfPresenceRule(): unique/exists only run when no earlier rule failed.
        if ((rule === 'unique' || rule === 'exists') && errors.has(attr)) continue;
        if (await passes(rule, params, value, list, input)) continue;
        const msgs = errors.get(attr) ?? [];
        msgs.push(await message(attr, pattern, rule, params, value, list, custom));
        errors.set(attr, msgs);
        if (bail || rule === 'required' || rule === 'required_if') break;
      }
    }
  }
  return new ValidationResult(errors);
}

/** A request's rules and custom messages, declared in src/validators/<feature>.validator.ts. */
export interface ValidationSchema {
  rules: Rules;
  messages?: Messages;
}

/** Validate `input` against a schema from src/validators (same as `validate(input, rules, messages)`). */
export function validateRequest(input: Input, schema: ValidationSchema): Promise<ValidationResult> {
  return validate(input, schema.rules, schema.messages ?? {});
}
