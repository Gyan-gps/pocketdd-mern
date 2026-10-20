'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? q.set(k, v) : q.delete(k));
    q.delete('saved');
    router.replace(`${pathname}?${q}`);
  };
}

/** Backpack DataTables search box: filters as you type (debounced) and resets to page 1. */
export function ListSearch({ initial }: { initial?: string }) {
  const update = useQueryUpdater();
  const [value, setValue] = useState(initial ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="relative w-full sm:w-auto sm:min-w-[268px]">
      <i className="la la-search pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-muted" aria-hidden />
      <input
        type="search"
        aria-label="Search"
        placeholder="Search..."
        className="form-control pl-9!"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => update({ search: v.trim() || undefined, page: undefined }), 400);
        }}
      />
    </div>
  );
}

/** "[25 ▾] entries per page" (config/backpack/operations/list.php pageLengthMenu). */
export function PageLengthSelect({ value }: { value: number }) {
  const update = useQueryUpdater();
  const options: Array<[number, string]> = [
    [10, '10'],
    [25, '25'],
    [50, '50'],
    [100, '100'],
    [1000, 'All'],
  ];
  return (
    <label className="flex items-center gap-3">
      <select
        className="form-control w-auto! pr-8"
        value={value}
        onChange={(e) => update({ length: e.target.value === '25' ? undefined : e.target.value, page: undefined })}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      entries per page
    </label>
  );
}
