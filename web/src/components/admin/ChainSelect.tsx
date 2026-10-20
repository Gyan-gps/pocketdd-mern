'use client';
// staff & events admin field behaviours: ports of public/assets/js/getUserBranch.js and getEventCity.js
// (state → district → pincode_id → tahsil chained dropdowns fed by the public /api lookup routes).
import { useEffect, useRef, useState } from 'react';
import type { CustomFieldProps, FieldDef, Option } from '@/admin/types';

export interface ChainSpec {
  /** Fields whose values feed the lookup (all must be non-empty). */
  deps: string[];
  url: (v: Record<string, string>) => string;
  map: (json: any) => Option[];
  /** First option inserted before the results (e.g. "Select Any"), null = none. */
  placeholder?: Option | null;
  /** Select the first result (tahsil: the single returned tehsil is `selected`). */
  autoSelect?: boolean;
}

export function ChainSelect({ field, values, set, spec, initial, formOptions }: CustomFieldProps & { spec?: ChainSpec }) {
  const [opts, setOpts] = useState<Option[]>(() => {
    const cur = values[field.name] ?? '';
    // Edit pages: keep the stored value visible until the lookup answers (getEventCity.js restore).
    const label = String(initial[`${field.name}_label`] ?? cur);
    return cur ? [{ value: cur, label }] : [];
  });
  const depKey = spec ? spec.deps.map((d) => values[d] ?? '').join('\u0000') : '';
  const first = useRef(true);
  useEffect(() => {
    if (!spec) return;
    const v = Object.fromEntries(spec.deps.map((d) => [d, (values[d] ?? '').trim()]));
    if (spec.deps.some((d) => !v[d])) return;
    let live = true;
    fetch(spec.url(v))
      .then((r) => r.json())
      .then((json) => {
        if (!live) return;
        const list = spec.map(json);
        setOpts([...(spec.placeholder ? [spec.placeholder] : []), ...list]);
        const cur = values[field.name] ?? '';
        if (spec.autoSelect) set(field.name, list[0]?.value ?? '');
        else if (!first.current || !list.some((o) => o.value === cur)) set(field.name, spec.placeholder?.value ?? list[0]?.value ?? '');
        first.current = false;
      })
      .catch(() => alert('Error fetching Item(s). Please try again.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);
  const list = spec ? opts : (formOptions?.[field.name] ?? []);
  return (
    <select id={field.name} name={field.name} value={values[field.name] ?? ''} onChange={(e) => set(field.name, e.target.value)} {...field.attributes}>
      {!spec && <option value="">-</option>}
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

