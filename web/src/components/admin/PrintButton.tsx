'use client';

/** Backpack show page print button (window.print()). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="cursor-pointer p-1 text-ink" aria-label="Print">
      <i className="la la-print text-lg" aria-hidden />
    </button>
  );
}
