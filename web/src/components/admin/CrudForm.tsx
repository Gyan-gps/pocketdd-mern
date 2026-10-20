'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { getEntity } from '@/admin/registry';
import { slugify } from '@/admin/slugify';
import type { FieldDef, Option } from '@/admin/types';
import { saveEntry, type SaveState } from '@/app/pocketddadmin/(panel)/[entity]/actions';

/** `oninput` transformations from the PHP field definitions. */
const TRANSFORMS = {
  // .replace(/[^a-zA-Z0-9\s&\-().,]/g, '').replace(/\b\w/g, c => c.toUpperCase())
  titleCaseEnglish: (v: string) => v.replace(/[^a-zA-Z0-9\s&\-().,]/g, '').replace(/\b\w/g, (t) => t.toUpperCase()),
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Field configs hold functions/RegExps, so they are resolved here on the client from the registry. */
export function CrudForm({
  entity,
  id,
  initial,
  submitLabel,
  formOptions,
}: {
  entity: string;
  id: string | null;
  initial: Record<string, unknown>;
  submitLabel: string;
  /** Server-computed field options (GET /<route>/form-options). */
  formOptions?: Record<string, Option[]>;
}) {
  const ui = getEntity(entity)!;
  const fields: FieldDef[] = id ? (ui.updateFields ?? ui.createFields) : ui.createFields;
  const [state, action, pending] = useActionState<SaveState, FormData>(saveEntry.bind(null, entity, id), {});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.type === 'checkbox'
          ? Number(initial[f.name])
            ? '1'
            : '0'
          : f.type === 'select_multiple'
            ? JSON.stringify(Array.isArray(initial[f.name]) ? (initial[f.name] as unknown[]).map(String) : [])
            : str(initial[f.name]),
      ]),
    ),
  );
  const slugTouched = useRef<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const shown = state.values ? { ...values, ...state.values } : values;

  function set(name: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      for (const f of fields) {
        // Backpack slug field follows its target until the user edits the slug itself.
        if (f.type === 'slug' && f.slug?.target === name && !slugTouched.current[f.name]) {
          next[f.name] = slugify(value, f.slug);
        }
        // dependent selects are rebuilt (and reset to "Select") when their source changes
        if (f.dependsOn?.field === name) next[f.name] = '';
      }
      for (const f of fields) {
        if (f.compute?.from.includes(name)) next[f.name] = f.compute.fn(next);
        if (f.visibleWhen && !f.visibleWhen(next)) next[f.name] = f.type === 'select_multiple' ? '[]' : '';
      }
      return next;
    });
    for (const f of fields) {
      if (f.autofill?.from !== name) continue;
      clearTimeout(timers.current[f.name]);
      if (!value.trim()) continue;
      timers.current[f.name] = setTimeout(async () => {
        try {
          const res = await fetch(f.autofill!.endpoint(value));
          const text = f.autofill!.pick(await res.json());
          if (text) setValues((prev) => ({ ...prev, [f.name]: text }));
        } catch {
          /* lookup is best-effort, like the original widget script */
        }
      }, 400);
    }
  }

  return (
    <form action={action} className="card">
      {state.message && <div className="alert alert-danger">{state.message}</div>}
      <div className="form-grid">
        {fields.map((f) => {
          const err = state.errors?.[f.name]?.[0];
          const common = {
            id: f.name,
            name: f.name,
            placeholder: f.placeholder,
            className: err ? 'invalid' : undefined,
            ...f.attributes,
          };
          let input: React.ReactNode;
          switch (f.type) {
            case 'checkbox':
              input = (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                  <input type="hidden" name={f.name} value={shown[f.name] === '1' ? '1' : '0'} />
                  <input type="checkbox" checked={shown[f.name] === '1'} onChange={(e) => set(f.name, e.target.checked ? '1' : '0')} />
                  {f.label}
                </label>
              );
              break;
            case 'textarea':
              input = <textarea {...common} rows={4} value={shown[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
              break;
            case 'select_multiple': {
              let selected: string[] = [];
              try {
                selected = JSON.parse(shown[f.name] || '[]');
              } catch {
                selected = [];
              }
              input = (
                <>
                  <select
                    id={f.name}
                    multiple
                    className={err ? 'invalid' : undefined}
                    value={selected}
                    onChange={(e) => set(f.name, JSON.stringify([...e.target.selectedOptions].map((o) => o.value)))}
                  >
                    {(f.options ?? formOptions?.[f.name] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {/* Backpack select2 multiple: an empty hidden input keeps an empty selection in the request */}
                  {selected.length === 0 && <input type="hidden" name={f.name} value="" />}
                  {selected.map((v) => (
                    <input key={v} type="hidden" name={`${f.name}[]`} value={v} />
                  ))}
                </>
              );
              break;
            }
            case 'select':
              input = (
                <select {...common} value={shown[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">-</option>
                  {(f.dependsOn
                    ? (f.dependsOn.options[shown[f.dependsOn.field] ?? ''] ?? [])
                    : (f.options ?? formOptions?.[f.name] ?? [])
                  ).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              );
              break;
            case 'image':
            case 'upload':
              input = <input type="file" name={f.name} accept={f.type === 'image' ? 'image/*' : undefined} />;
              break;
            case 'custom':
              input = f.custom?.({ field: f, values: shown, set, initial, errors: state.errors, formOptions });
              break;
            case 'hidden':
              input = <input type="hidden" name={f.name} value={shown[f.name]} />;
              break;
            default:
              input = (
                <input
                  {...common}
                  type={f.type === 'number' || f.type === 'email' || f.type === 'date' ? f.type : 'text'}
                  value={shown[f.name]}
                  onChange={(e) => {
                    if (f.type === 'slug') slugTouched.current[f.name] = true;
                    set(f.name, f.transform ? TRANSFORMS[f.transform](e.target.value) : f.inputFilter ? f.inputFilter(e.target.value) : e.target.value);
                  }}
                />
              );
          }
          return (
            <div
              key={f.name}
              className="form-group"
              style={{ gridColumn: `span ${f.size ?? 12}`, ...(f.visibleWhen && !f.visibleWhen(shown) ? { display: 'none' } : {}) }}
            >
              {f.type !== 'checkbox' && f.type !== 'hidden' && <label htmlFor={f.name}>{f.label ?? f.name}</label>}
              {input}
              {err && <div className="error">{err}</div>}
              {f.hint && <div className="hint">{f.hint}</div>}
            </div>
          );
        })}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        <Link className="btn" href={`/pocketddadmin/${entity}`}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
