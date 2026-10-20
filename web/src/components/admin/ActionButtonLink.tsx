import Link from 'next/link';
import type { ActionButton } from '@/admin/types';

const VARIANT_CLASS: Record<NonNullable<ActionButton['variant']>, string> = {
  primary: 'btn btn-primary',
  success: 'btn btn-success',
  info: 'btn btn-info',
  'outline-primary': 'btn btn-outline-primary',
  link: 'btn-link font-medium',
};

/** A model-function button (top or line stack). */
export function ActionButtonLink({ button, fallback }: { button: ActionButton; fallback: ActionButton['variant'] }) {
  return (
    <Link href={button.href} className={VARIANT_CLASS[button.variant ?? fallback ?? 'primary']} title={button.label}>
      {button.icon && <i className={`la ${button.icon}`} aria-hidden />} {button.label}
    </Link>
  );
}
