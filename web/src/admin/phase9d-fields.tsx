// Server-safe factories for the phase 9D field behaviours (the components live in the client module
// components/admin/Phase9dFields.tsx; registry entries are evaluated on the server too).
import type { CustomFieldProps } from '@/admin/types';
import { CodeFill, RemoteSelect, Repeatable, type RemoteSelectCfg, type RepeatableCfg } from '@/components/admin/Phase9dFields';

const enc = encodeURIComponent;

export const remoteSelect = (cfg: RemoteSelectCfg) => (p: CustomFieldProps) => <RemoteSelect p={p} cfg={cfg} />;

export const citySelect = (endpoint: string) =>
  remoteSelect({
    deps: ['state'],
    url: (v) => (v.state ? `${endpoint}/${enc(v.state)}` : null),
    pick: (j) => (j?.data ?? []).map((c: any) => ({ value: String(c.city ?? ''), label: String(c.city ?? '') })),
    first: { value: ' ', label: 'Select Any' },
    errorAlert: 'Error fetching Item(s). Please try again.',
  });

export const pincodeSelect = (endpoint: string) =>
  remoteSelect({
    deps: ['state', 'city'],
    url: (v) => (v.state && v.city ? `${endpoint}/${enc(v.state)}/${enc(v.city)}` : null),
    pick: (j) => (j?.data ?? []).map((x: any) => ({ value: String(x.id), label: String(x.pin_code ?? '') })),
    first: { value: '', label: 'Select Any' },
    errorAlert: 'Error fetching pincode. Please try again.',
  });

export const codeFill = (which: 'state_code' | 'district_code', filter: (v: string) => string) => (p: CustomFieldProps) => (
  <CodeFill p={p} which={which} deps={which === 'state_code' ? ['state'] : ['state', 'city']} filter={filter} />
);

export const repeatable = (cfg: RepeatableCfg) => (p: CustomFieldProps) => <Repeatable p={p} cfg={cfg} />;

// ------------------------------------------------------------------ oninput filters

/** .replace(/[^a-zA-Z\s,-]/g,'').replace(/\b\w/g, upper) */
export const rankFilter = (v: string) => v.replace(/[^a-zA-Z\s,-]/g, '').replace(/\b\w/g, (t) => t.toUpperCase());
/** .replace(/[^0-9,-]/g,'').replace(/,{2,}/g,',').replace(/-{2,}/g,'-') */
export const numbersFilter = (v: string) => v.replace(/[^0-9,-]/g, '').replace(/,{2,}/g, ',').replace(/-{2,}/g, '-');
/** .replace(/[^a-zA-Z0-9\s&\-().,]/g,'').replace(/\b\w/g, upper) */
export const areaFilter = (v: string) => v.replace(/[^a-zA-Z0-9\s&\-().,]/g, '').replace(/\b\w/g, (t) => t.toUpperCase());
/** .replace(/[^a-zA-Z\s]/g,'').replace(/\b\w/g, upper) */
export const alphaTitleFilter = (v: string) => v.replace(/[^a-zA-Z\s]/g, '').replace(/\b\w/g, (t) => t.toUpperCase());
export const alphaFilter = (v: string) => v.replace(/[^a-zA-Z\s]/g, '');
export const digits10Filter = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 10);
export const digits6Filter = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 6);
export const digitsFilter = (v: string) => v.replace(/[^0-9]/g, '');
export const lettersFilter = (v: string) => v.replace(/[^A-Za-z]/g, '');

/** Laravel Str::limit($v, $n, '…') (width-based; rtrim before the ellipsis). */
export function strLimit(v: string, n = 32): string {
  const chars = [...v];
  if (chars.length <= n) return v;
  return chars.slice(0, n).join('').replace(/\s+$/, '') + '…';
}

/** Backpack text/closure column: PHP empty() → '-'. */
export function textCell(v: unknown, limit?: number): string {
  if (v === null || v === undefined || v === '' || v === '0' || v === 0 || v === false) return '-';
  const s = String(v);
  return limit ? strLimit(s, limit) : s;
}
