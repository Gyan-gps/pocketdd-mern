// Shared column renderers for the catalog screens.
import type { ColumnDef, FieldDef } from '../types';

export const hindiStyle = { fontFamily: '"k010", sans-serif', fontSize: 25 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Backpack `date` column: isoFormat('D MMM YYYY'). */
export function dateCell(name: string, label?: string): ColumnDef {
  return {
    name,
    label,
    render: (row) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row[name] ?? ''));
      return <span>{m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '-'}</span>;
    },
  };
}

/** The ✅ / ❌ closure status column. */
export const statusClosure: ColumnDef = {
  name: 'status',
  label: 'Status',
  render: (row) =>
    Number(row.status) === 1 ? (
      <span style={{ fontSize: 20, color: 'green' }}>✅</span>
    ) : (
      <span style={{ fontSize: 20, color: 'red' }}>❌</span>
    ),
};

/** `->prefix('₹')` text column. */
export const rupees = (name: string, label?: string): ColumnDef => ({
  name,
  label,
  render: (row) => <span>{row[name] === null || row[name] === undefined || row[name] === '' ? '-' : `₹${String(row[name])}`}</span>,
});

/** Backpack slug field config shared by the category forms (separator '', lower, strict, remove /[*+~()!:@]/g). */
export const slugField = (target: string): FieldDef => ({
  name: 'slug',
  label: 'Slug',
  type: 'slug',
  size: 6,
  attributes: { readOnly: 'readonly' },
  slug: { target, separator: '', trim: true, lower: true, strict: true, remove: /[*+~()!:@]/g },
});

/** public/assets/js/businessCategory.js — name → GET /api/translate-to-hindi/{name} → name_hi. */
export const hindiAutofill: FieldDef['autofill'] = {
  from: 'name',
  endpoint: (v) => `/api/translate-to-hindi/${encodeURIComponent(v.trim())}`,
  pick: (json) => json?.data?.translated_text,
};
