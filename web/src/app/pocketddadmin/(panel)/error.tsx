'use client';

import Link from 'next/link';

// Shown instead of the crash overlay when an admin page's API call fails (e.g. the 500 Laravel also
// returns for malformed rows). Server error details are not exposed to the browser in production.
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
      <div className="alert alert-danger">
        This page could not be loaded ({error.message || 'server error'}). A record with invalid data can cause this;
        check the API logs for details{error.digest ? ` (ref ${error.digest})` : ''}.
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" onClick={() => reset()}>
          Try again
        </button>
        <Link className="btn" href="/pocketddadmin/dashboard">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
