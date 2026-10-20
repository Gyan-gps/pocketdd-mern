'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Option } from '@/admin/types';

export interface FilterDef {
  name: string;
  label: string;
  type: 'select' | 'date_range';
}

/**
 * Backpack filters navbar (crud/inc/filters_navbar.blade.php): borderless "Label ▾" toggles; choosing an
 * option applies it immediately, and "Remove filters" appears once any filter is active.
 */
export function FilterBar({ filters, options }: { filters: FilterDef[]; options: Record<string, Option[]> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const apply = (name: string, value?: string) => {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(name, value);
    else q.delete(name);
    q.delete('page');
    q.delete('saved');
    setOpen(null);
    router.replace(`${pathname}?${q}`);
  };
  const removeAll = () => {
    const q = new URLSearchParams(params.toString());
    for (const f of filters) q.delete(f.name);
    q.delete('page');
    router.replace(`${pathname}?${q}`);
  };
  const anyActive = filters.some((f) => params.get(f.name));

  return (
    <div ref={ref} className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <i className="la la-filter text-primary" aria-hidden />
      {filters.map((f) => {
        const active = params.get(f.name);
        return (
          <div key={f.name} className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open === f.name}
              onClick={() => setOpen((o) => (o === f.name ? null : f.name))}
              className={`flex cursor-pointer items-center gap-1.5 ${active ? 'font-medium text-primary' : 'text-ink/80'}`}
            >
              {f.label}
              <span className="text-[0.6rem]" aria-hidden>
                ▼
              </span>
            </button>
            {open === f.name && (
              <div className="absolute top-full left-0 z-20 mt-1 max-h-72 min-w-48 overflow-auto rounded border border-line bg-white py-1 shadow-md">
                {f.type === 'date_range' ? (
                  <form
                    className="flex flex-col gap-2 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const from = String(fd.get('from') ?? '');
                      const to = String(fd.get('to') ?? '');
                      apply(f.name, from || to ? JSON.stringify({ from, to }) : undefined);
                    }}
                  >
                    <input type="date" name="from" aria-label={`${f.label} from`} className="form-control" />
                    <input type="date" name="to" aria-label={`${f.label} to`} className="form-control" />
                    <button className="btn btn-primary justify-center" type="submit">
                      Apply
                    </button>
                  </form>
                ) : (
                  <ul role="listbox" aria-label={f.label}>
                    <li>
                      <button type="button" onClick={() => apply(f.name)} className="w-full cursor-pointer px-4 py-1.5 text-left text-muted hover:bg-addon">
                        -
                      </button>
                    </li>
                    {(options[f.name] ?? []).map((o) => (
                      <li key={o.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active === o.value}
                          onClick={() => apply(f.name, o.value)}
                          className={`w-full cursor-pointer px-4 py-1.5 text-left ${active === o.value ? 'bg-primary text-white' : 'hover:bg-addon'}`}
                        >
                          {o.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
      {anyActive && (
        <button type="button" onClick={removeAll} className="btn-link">
          <i className="la la-eraser" aria-hidden /> Remove filters
        </button>
      )}
    </div>
  );
}
