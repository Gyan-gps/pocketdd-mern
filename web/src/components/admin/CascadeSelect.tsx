'use client';

// Business form widget scripts (public/assets/js/getBusinessCity.js, get_sub_category.js): cascading selects fed
// by the public lookup routes, keeping the entry's current value on the edit page (the *_hidden fields' role).
import { useEffect, useState } from 'react';
import type { CustomFieldProps, Option } from '@/admin/types';

export interface CascadeCfg {
  deps: string[];
  url: (v: Record<string, string>) => string | null;
  pick: (json: any) => Option[];
  first?: Option;
  /** another field filled from the selected option (e.g. pincode_hi ← pin code text). */
  mirrorLabelTo?: string;
}

export function CascadeSelect({ p, cfg }: { p: CustomFieldProps; cfg: CascadeCfg }) {
  const [opts, setOpts] = useState<Option[]>([]);
  const key = cfg.deps.map((d) => p.values[d] ?? '').join('\u0001');
  useEffect(() => {
    const url = cfg.url(p.values);
    if (!url) return setOpts([]);
    let alive = true;
    fetch(`/api/${url}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list = cfg.pick(j);
        setOpts(cfg.first ? [cfg.first, ...list] : list);
        const cur = p.values[p.field.name] ?? '';
        if (!list.some((o) => o.value === cur)) p.set(p.field.name, cfg.first?.value ?? list[0]?.value ?? '');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const err = p.errors?.[p.field.name]?.[0];
  return (
    <select
      id={p.field.name}
      name={p.field.name}
      className={err ? 'invalid' : undefined}
      value={p.values[p.field.name] ?? ''}
      onChange={(e) => {
        p.set(p.field.name, e.target.value);
        if (cfg.mirrorLabelTo) p.set(cfg.mirrorLabelTo, opts.find((o) => o.value === e.target.value)?.label ?? '');
      }}
    >
      {opts.length === 0 && <option value="">-</option>}
      {opts.map((o, i) => (
        <option key={`${o.value}-${i}`} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
