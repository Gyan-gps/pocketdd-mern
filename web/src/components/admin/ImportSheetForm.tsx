'use client';

import { useActionState } from 'react';
import { importSheet, type ImportState } from '@/app/pocketddadmin/(panel)/phase9b-actions';

/** resources/views/import/import_category.blade.php / import_sub_category.blade.php */
export function ImportSheetForm({ endpoint, field, label }: { endpoint: string; field: string; label: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importSheet.bind(null, endpoint), {});
  return (
    <form action={action} className="card">
      {state.alert && <div className="alert alert-danger">{state.message}</div>}
      {/* the session flash is rendered unescaped ({!! !!}) — it contains <br /> separators */}
      {state.success && <div className="alert alert-success" role="alert" dangerouslySetInnerHTML={{ __html: state.success }} />}
      {state.error && <div className="alert alert-danger" role="alert" dangerouslySetInnerHTML={{ __html: state.error }} />}
      <div className="form-group">
        <label htmlFor={field}>{label}</label>
        <input id={field} type="file" name={field} />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Importing…' : '☁ Import Excel'}
        </button>
      </div>
    </form>
  );
}
