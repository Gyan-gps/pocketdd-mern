// Phase 9C field factories + lookup chains (server-safe; the select itself is the client ChainSelect).
import { ChainSelect, type ChainSpec } from '@/components/admin/Phase9cFields';
import type { FieldDef, Option } from '@/admin/types';

/** A select fed by a lookup chain (`spec`) or, without one, by the entity's form-options (state list). */
export const chainField = (f: Omit<FieldDef, 'type' | 'custom'>, spec?: ChainSpec): FieldDef => ({
  ...f,
  type: 'custom',
  custom: (p) => <ChainSelect {...p} spec={spec} />,
});

/** Backpack `time` field (event_time column type). */
export const timeField = (f: Omit<FieldDef, 'type' | 'custom'>): FieldDef => ({
  ...f,
  type: 'custom',
  custom: ({ field, values, set }) => (
    <input type="time" id={field.name} name={field.name} value={(values[field.name] ?? '').slice(0, 5)} onChange={(e) => set(field.name, e.target.value)} />
  ),
});

const enc = encodeURIComponent;
const cities = (json: any): Option[] => (json?.data ?? []).map((c: any) => ({ value: String(c.city), label: String(c.city) }));
const pins = (json: any): Option[] => (json?.data ?? []).map((p: any) => ({ value: String(p.id), label: String(p.pin_code) }));
const tehsil = (json: any): Option[] => (json?.tehsil ? [{ value: String(json.tehsil), label: String(json.tehsil) }] : []);

/** getUserBranch.js — note the district "Select Any" option has value " " (trimmed to NULL on submit). */
export const staffChain = {
  district: { deps: ['state'], url: (v) => `/api/business-user-cities/${enc(v.state!)}`, map: cities, placeholder: { value: ' ', label: 'Select Any' } } as ChainSpec,
  pincode_id: { deps: ['state', 'district'], url: (v) => `/api/business-user-pincode/${enc(v.state!)}/${enc(v.district!)}`, map: pins, placeholder: { value: '', label: 'Select Any' } } as ChainSpec,
  tahsil: { deps: ['state', 'district', 'pincode_id'], url: (v) => `/api/business-user-get-tehsil-area/${enc(v.state!)}/${enc(v.district!)}/${enc(v.pincode_id!)}`, map: tehsil, autoSelect: true } as ChainSpec,
};

/** getEventCity.js (tehsil lookup reuses the business-user route, as the script does). */
export const eventChain = {
  district: { deps: ['state'], url: (v) => `/api/business-event-cities/${enc(v.state!)}`, map: cities, placeholder: { value: '', label: 'Select Any' } } as ChainSpec,
  pincode_id: { deps: ['state', 'district'], url: (v) => `/api/business-event-pincode/${enc(v.state!)}/${enc(v.district!)}`, map: pins, placeholder: { value: '', label: 'Select Any' } } as ChainSpec,
  tahsil: { deps: ['state', 'district', 'pincode_id'], url: (v) => `/api/business-user-get-tehsil-area/${enc(v.state!)}/${enc(v.district!)}/${enc(v.pincode_id!)}`, map: tehsil, autoSelect: true } as ChainSpec,
};
