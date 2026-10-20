// UI description of a Backpack CrudController (setupListOperation / setupShowOperation / setupCreateOperation).

export type ColumnType = 'text' | 'check' | 'boolean' | 'date' | 'datetime' | 'image' | 'number' | 'json-list';

export interface ColumnDef {
  name: string;
  label?: string;
  type?: ColumnType;
  /** Backpack `->limit()` — characters shown before "..." (default 32). */
  limit?: number;
  /** Inline style for the cell value (Backpack `->wrapper(['style' => …])`). */
  style?: React.CSSProperties;
  /** Custom renderer for computed / relationship columns. */
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'slug'
  | 'hidden'
  | 'image'
  | 'upload'
  | 'select_multiple'
  | 'custom';

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label?: string;
  type?: FieldType;
  placeholder?: string;
  /** Bootstrap column width 1–12 (`->size()`), default 12. */
  size?: number;
  /** HTML attributes copied from `->attributes([...])`. */
  attributes?: Record<string, string>;
  /** Input transformation on every keystroke (ports of `oninput` JS). */
  transform?: 'titleCaseEnglish';
  /** slug field: source field + slugify options (Backpack slug field uses simov/slugify). */
  slug?: { target: string; separator?: string; lower?: boolean; strict?: boolean; trim?: boolean; remove?: RegExp };
  options?: Array<{ value: string; label: string }>;
  /** Field auto-filled by an API lookup when another field changes (Widget scripts). */
  autofill?: { from: string; endpoint: (value: string) => string; pick: (json: any) => string | undefined };
  hint?: string;
  /** Options that depend on another field's value (Widget scripts, e.g. ads-position-handler.js). */
  dependsOn?: { field: string; options: Record<string, Option[]> };
  /** Shown only when true; hidden fields are cleared (JS toggles). */
  visibleWhen?: (values: Record<string, string>) => boolean;
  /** Recomputed when any of `from` changes (e.g. to_date = from_date + valid till). */
  compute?: { from: string[]; fn: (values: Record<string, string>) => string };
  /** Keystroke filter (port of an oninput handler), applied before the value is stored. */
  inputFilter?: (value: string) => string;
  /** type 'custom': renders its own inputs (repeatables, remote selects…); see components/admin/Phase9dFields. */
  custom?: (props: CustomFieldProps) => React.ReactNode;
}

/** Props handed to a FieldDef.custom renderer by CrudForm. */
export interface CustomFieldProps {
  field: FieldDef;
  /** Current form values (strings), incl. old input after a validation error. */
  values: Record<string, string>;
  set: (name: string, value: string) => void;
  /** Raw entry (edit) or defaults (create). */
  initial: Record<string, unknown>;
  errors?: Record<string, string[]>;
  formOptions?: Record<string, Option[]>;
}

export interface EntityUi {
  route: string;
  singular: string;
  plural: string;
  operations: Array<'list' | 'show' | 'create' | 'update' | 'delete'>;
  columns: ColumnDef[];
  showColumns?: ColumnDef[];
  createFields: FieldDef[];
  updateFields?: FieldDef[];
  /** List filters (Backpack addFilter); option lists come from the API list response `filters`. */
  filters?: Array<{ name: string; label: string; type: 'select' | 'date_range' }>;
  /** Top buttons (addButtonFromModelFunction top), given the list page query string. */
  topButtons?: (query: Record<string, string | undefined>) => Array<{ label: string; href: string }>;
  /** Line buttons (addButtonFromModelFunction line). */
  lineButtons?: (row: Record<string, unknown>) => Array<{ label: string; href: string }>;
  /** Fetch field options from GET /<route>/form-options (CrudConfig.formOptions). */
  formOptions?: boolean;
  /** Create-form defaults read from the page query string (field 'default' => request()->get(...)). */
  createDefaultsFromQuery?: string[];
  /** Redirect after save (store()/update() overrides); default: the entity list. */
  saveRedirect?: (values: Record<string, string>) => string;
}
