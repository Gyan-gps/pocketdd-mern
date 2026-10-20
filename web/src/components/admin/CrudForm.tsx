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

/** Backpack upload field: a read-only box showing the chosen file name, with "Browse" on the right. */
function UploadInput({ id, name, accept, invalid }: { id: string; name: string; accept?: string; invalid: boolean }) {
  const [fileName, setFileName] = useState('');
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer overflow-hidden rounded-[0.2rem] border bg-white ${invalid ? 'border-cui-danger' : 'border-input-line'}`}
    >
      <span className="flex-1 truncate px-3 py-1.5 text-ink">{fileName}</span>
      <span className="border-l border-input-line bg-addon px-3 py-1.5">Browse</span>
      <input id={id} name={name} type="file" accept={accept} className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
    </label>
  );
}

const SAVE_ACTIONS = [
  { value: 'save_and_back', label: 'Save and back' },
  { value: 'save_and_edit', label: 'Save and edit this item' },
  { value: 'save_and_new', label: 'Save and new item' },
  { value: 'save_and_preview', label: 'Save and preview' },
] as const;

/** Backpack's split save button: the main action plus a menu of the other save actions. */
function SaveButton({ pending, label, canPreview }: { pending: boolean; label: string; canPreview: boolean }) {
  const [action, setAction] = useState<string>('save_and_back');
  const [open, setOpen] = useState(false);
  const current = SAVE_ACTIONS.find((a) => a.value === action)!;
  const others = SAVE_ACTIONS.filter((a) => a.value !== action && (a.value !== 'save_and_preview' || canPreview));
  return (
    <div className="relative inline-flex">
      <input type="hidden" name="_save_action" value={action} />
      <button className="btn btn-success rounded-r-none text-white" type="submit" disabled={pending}>
        <i className="la la-save" aria-hidden /> {pending ? 'Saving…' : action === 'save_and_back' ? label : current.label}
      </button>
      <button
        type="button"
        className="btn btn-success rounded-l-none border-l-white/30 px-2 text-white"
        aria-label="More save options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[0.6rem]" aria-hidden>
          ▼
        </span>
      </button>
      {open && (
        <ul role="menu" className="absolute bottom-full left-0 z-20 mb-1 min-w-52 rounded border border-line bg-white py-1 shadow-md">
          {others.map((a) => (
            <li key={a.value}>
              <button
                type="button"
                role="menuitem"
                className="w-full cursor-pointer px-4 py-1.5 text-left hover:bg-addon"
                onClick={() => {
                  setAction(a.value);
                  setOpen(false);
                }}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Field configs hold functions/RegExps, so they are resolved here on the client from the registry. */
export function CrudForm({
  entity,
  id,
  initial,
  submitLabel,
  formOptions,
  required = [],
}: {
  entity: string;
  id: string | null;
  initial: Record<string, unknown>;
  submitLabel: string;
  /** Server-computed field options (GET /<route>/form-options). */
  formOptions?: Record<string, Option[]>;
  /** Field names whose validation rules include `required` (shown with a red asterisk, as in Backpack). */
  required?: string[];
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
    <form action={action}>
      {state.message && (
        <div className="alert alert-danger" role="alert">
          {state.message}
        </div>
      )}
      <div className="card">
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
                <label className="mt-8 flex items-center gap-2">
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
            case 'radio':
              input = (
                <div className="flex flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-labelledby={`${f.name}-label`}>
                  {(f.options ?? formOptions?.[f.name] ?? []).map((o) => (
                    <label key={o.value} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={f.name}
                        value={o.value}
                        checked={shown[f.name] === o.value}
                        onChange={() => set(f.name, o.value)}
                        className="size-4 accent-primary"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              );
              break;
            case 'heading':
              input = <h5 className="mt-2 text-center text-[1.25rem]">{f.label}</h5>;
              break;
            case 'select':
              input = (
                <select {...common} value={shown[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">{f.select2 ? 'Select an entry' : '-'}</option>
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
              input = <UploadInput id={f.name} name={f.name} accept={f.type === 'image' ? 'image/*' : undefined} invalid={!!err} />;
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
              {f.type !== 'checkbox' && f.type !== 'hidden' && f.type !== 'heading' && (
                <label htmlFor={f.name} id={`${f.name}-label`}>
                  {f.label ?? f.name}
                  {(f.required || required.includes(f.name)) && <span className="required"> *</span>}
                </label>
              )}
              {input}
              {err && <div className="error">{err}</div>}
              {f.hint && <div className="hint">{f.hint}</div>}
            </div>
          );
        })}
      </div>
      </div>
      {/* crud/inc/form_save_buttons.blade.php */}
      <div className="form-actions">
        <SaveButton pending={pending} label={submitLabel} canPreview={ui.operations.includes('show')} />
        <Link className="btn btn-secondary" href={`/pocketddadmin/${entity}`}>
          <i className="la la-ban" aria-hidden /> Cancel
        </Link>
      </div>
    </form>
  );
}
