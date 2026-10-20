import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Backpack page header: right-aligned breadcrumbs (inc/breadcrumbs.blade.php), then the light
 * capitalised heading with its subheading on the same baseline (crud/list|create|edit|show.blade.php).
 */
export function PageHeader({
  title,
  subheading,
  breadcrumbs,
  children,
}: {
  title: string;
  subheading?: React.ReactNode;
  breadcrumbs?: Crumb[];
  /** Extra inline content after the subheading (e.g. "« Back to all …"). */
  children?: React.ReactNode;
}) {
  return (
    <>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="breadcrumb" className="mb-2 hidden lg:block">
          <ol className="flex justify-end gap-2">
            {breadcrumbs.map((c, i) => (
              <li key={c.label} className="flex gap-2 capitalize">
                {i > 0 && <span className="text-muted">/</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="text-muted">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section className="page-head">
        <h1>{title}</h1>
        {subheading && <span className="subheading">{subheading}</span>}
        {children}
      </section>
    </>
  );
}

/** Default breadcrumbs: Admin / <entity plural> / <operation>. */
export function crudBreadcrumbs(entity: string, plural: string, operation: string): Crumb[] {
  return [
    { label: 'Admin', href: '/pocketddadmin/dashboard' },
    { label: plural, href: `/pocketddadmin/${entity}` },
    { label: operation },
  ];
}
