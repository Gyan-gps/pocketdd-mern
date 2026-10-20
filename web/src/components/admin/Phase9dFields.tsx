'use client';

// Field behaviours of the phase 9D widget scripts (public/assets/js/administrator.js, city_helpline_number.js,
// get_address_city.js, address_city_counter.js, about_us.js, pincode.js) and Backpack's repeatable field.
import { useEffect, useRef, useState } from 'react';
import type { CustomFieldProps, Option } from '@/admin/types';

const API = ''; // same-origin /api (as the department autofill)

/** `$.ajax` GET against the public lookup routes (routes/api.php). */
async function getJson(path: string): Promise<any> {
  const res = await fetch(`${API}/api/${path}`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const enc = encodeURIComponent;

// ------------------------------------------------------------------ remote select (state → city → pincode)

export interface RemoteSelectCfg {
  deps: string[];
  url: (v: Record<string, string>) => string | null;
  pick: (json: any) => Option[];
  /** first option the script inserts ('Select Any' with value ' ' for cities, '' for pincodes) */
  first: Option;
  errorAlert: string;
}

export function RemoteSelect({ p, cfg }: { p: CustomFieldProps; cfg: RemoteSelectCfg }) {
  const [opts, setOpts] = useState<Option[]>([]);
  const key = cfg.deps.map((d) => p.values[d] ?? '').join('\u0001');
  useEffect(() => {
    const url = cfg.url(p.values);
    if (!url) return;
    let alive = true;
    getJson(url)
      .then((j) => {
        if (!alive) return;
        setOpts([cfg.first, ...cfg.pick(j)]);
        p.set(p.field.name, cfg.first.value); // innerHTML rebuilt → first option selected
      })
      .catch(() => alert(cfg.errorAlert));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const err = p.errors?.[p.field.name]?.[0];
  return (
    <>
      <select id={p.field.name} name={p.field.name} value={p.values[p.field.name] ?? ''} onChange={(e) => p.set(p.field.name, e.target.value)} className={err ? 'invalid' : undefined}>
        {opts.length === 0 && <option value="">-</option>}
        {opts.map((o, i) => (
          <option key={`${o.value}-${i}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {err && <div className="error">{err}</div>}
    </>
  );
}

// ------------------------------------------------------------------ pincode.js state/district code lookups

export function CodeFill({ p, deps, filter, which }: { p: CustomFieldProps; deps: string[]; filter: (v: string) => string; which: 'state_code' | 'district_code' }) {
  const [ro, setRo] = useState(false);
  const first = useRef(true);
  const key = deps.map((d) => p.values[d] ?? '').join('\u0001');
  useEffect(() => {
    // the code handlers are bound with onChange only (no initial .change())
    if (first.current) {
      first.current = false;
      return;
    }
    const st = p.values.state;
    const city = p.values.city;
    if (!st || (which === 'district_code' && !city)) return;
    getJson(which === 'state_code' ? `pincode-codes/${enc(st)}` : `pincode-codes/${enc(st)}/${enc(city!)}`)
      .then((j) => {
        const v = j?.data?.[which];
        p.set(p.field.name, v ? String(v) : '');
        setRo(!!v);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const err = p.errors?.[p.field.name]?.[0];
  return (
    <>
      <input id={which} name={p.field.name} type="text" readOnly={ro} value={p.values[p.field.name] ?? ''} onChange={(e) => p.set(p.field.name, filter(e.target.value))} />
      {err && <div className="error">{err}</div>}
    </>
  );
}

// ------------------------------------------------------------------ Backpack repeatable

export interface SubField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'upload';
  size?: number;
  inputFilter?: (v: string) => string;
  style?: React.CSSProperties;
  hint?: string;
  /** translate-to-hindi into another subfield of the same row (widget scripts) */
  translateTo?: string;
}

export interface RepeatableCfg {
  subfields: SubField[];
  newItemLabel: string;
  initRows: number;
  minRows: number;
  maxRows: number;
  /** raw entry key holding the edit value (defaults to the field name) */
  initialFrom?: string;
  /** address_city_counter.js: "<label> - n" on this subfield */
  numberLabel?: string;
}

type RowVals = Record<string, string | null>;

export function Repeatable({ p, cfg }: { p: CustomFieldProps; cfg: RepeatableCfg }) {
  const name = p.field.name;
  const [rows, setRows] = useState<RowVals[]>(() => {
    const parse = (v: unknown): RowVals[] | null => {
      let x = v;
      if (typeof x === 'string') {
        try {
          x = JSON.parse(x);
        } catch {
          return null;
        }
      }
      if (!x || typeof x !== 'object') return null;
      return Object.values(x as object).map((r) => {
        const o: RowVals = {};
        for (const s of cfg.subfields) {
          const val = r && typeof r === 'object' ? (r as Record<string, unknown>)[s.name] : null;
          o[s.name] = val === null || val === undefined ? (s.type === 'upload' ? null : '') : String(val);
        }
        return o;
      });
    };
    const old = parse(p.values[name]);
    const init = parse(p.initial[cfg.initialFrom ?? name]);
    const empty = () => Object.fromEntries(cfg.subfields.map((s) => [s.name, s.type === 'upload' ? null : ''])) as RowVals;
    return old ?? (init && init.length ? init : Array.from({ length: cfg.initRows }, empty));
  });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function setCell(i: number, sub: string, v: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [sub]: v } : r)));
    const sf = cfg.subfields.find((s) => s.name === sub);
    if (sf?.translateTo) {
      const target = sf.translateTo;
      clearTimeout(timers.current[`${i}.${sub}`]);
      if (!v.trim()) {
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [target]: '' } : r)));
        return;
      }
      timers.current[`${i}.${sub}`] = setTimeout(() => {
        getJson(`translate-to-hindi/${enc(v)}`)
          .then((j) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [target]: j?.data?.translated_text ?? '' } : r))))
          .catch(() => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [target]: '' } : r))));
      }, 400);
    }
  }

  const textRows = rows.map((r) => Object.fromEntries(cfg.subfields.filter((s) => s.type !== 'upload').map((s) => [s.name, r[s.name] ?? ''])));
  const uploads = cfg.subfields.filter((s) => s.type === 'upload');
  const order = rows.map((r) => Object.fromEntries(uploads.map((s) => [s.name, r[s.name] ?? ''])));
  const errFor = (i: number, s: string) => p.errors?.[`${name}.${i}.${s}`]?.[0];

  return (
    <div className="repeatable">
      {/* rows travel as JSON in the main input (decoded by the API like PHP's name[i][sub] parsing) */}
      <input type="hidden" name={name} value={rows.length ? JSON.stringify(textRows) : ''} />
      {uploads.length > 0 && <input type="hidden" name={`_order_${name}`} value={JSON.stringify(order)} />}
      {rows.map((r, i) => (
        <div key={i} className="card" style={{ padding: 12, marginBottom: 8, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8 }}>
          {cfg.subfields.map((s) => {
            const id = `${name}-${i}-${s.name}`;
            const err = errFor(i, s.name);
            const label = cfg.numberLabel === s.name ? `${s.label} - ${i + 1}` : s.label;
            let input: React.ReactNode;
            if (s.type === 'upload') {
              input = (
                <>
                  {r[s.name] && (
                    <div className="existing-file">
                      {r[s.name]}{' '}
                      <button type="button" className="btn" onClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [s.name]: null } : x)))}>
                        ✕
                      </button>
                    </div>
                  )}
                  {!r[s.name] && <input id={id} type="file" name={`${name}[${i}][${s.name}]`} accept=".png,.jpg,.jpeg" />}
                </>
              );
            } else if (s.type === 'textarea') {
              input = <textarea id={id} rows={3} style={s.style} value={r[s.name] ?? ''} onChange={(e) => setCell(i, s.name, s.inputFilter ? s.inputFilter(e.target.value) : e.target.value)} />;
            } else {
              input = (
                <input id={id} type={s.type === 'number' ? 'number' : 'text'} autoComplete="off" style={s.style} value={r[s.name] ?? ''}
                  onChange={(e) => setCell(i, s.name, s.inputFilter ? s.inputFilter(e.target.value) : e.target.value)} />
              );
            }
            return (
              <div key={s.name} className="form-group" style={{ gridColumn: `span ${s.size ?? 12}` }}>
                <label htmlFor={id}>{label}</label>
                {input}
                {err && <div className="error">{err}</div>}
                {s.hint && <div className="hint">{s.hint}</div>}
              </div>
            );
          })}
          {rows.length > cfg.minRows && (
            <div style={{ gridColumn: 'span 12' }}>
              <button type="button" className="btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
      {rows.length < cfg.maxRows && (
        <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, Object.fromEntries(cfg.subfields.map((s) => [s.name, s.type === 'upload' ? null : ''])) as RowVals])}>
          + {cfg.newItemLabel}
        </button>
      )}
    </div>
  );
}

