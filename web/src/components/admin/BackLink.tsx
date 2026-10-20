import Link from 'next/link';

/** Backpack's "« Back to all <entities>" link beside the page heading (create / edit / show). */
export function BackLink({ entity, plural }: { entity: string; plural: string }) {
  return (
    <Link href={`/pocketddadmin/${entity}`} className="text-[0.85em]">
      <i className="la la-angle-double-left" aria-hidden /> Back to all <span>{plural}</span>
    </Link>
  );
}
