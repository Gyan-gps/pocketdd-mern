'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MENU, type MenuItem } from '@/admin/registry';

const PREFIX = '/pocketddadmin';

function Item({ item, available }: { item: MenuItem; available: Set<string> }) {
  const pathname = usePathname();
  if (item.children) {
    const open = item.children.some((c) => pathname.startsWith(`${PREFIX}/${c.route}`));
    return (
      <details open={open}>
        <summary>
          {item.icon} {item.title}
        </summary>
        {item.children.map((c) => (
          <Item key={c.title} item={c} available={available} />
        ))}
      </details>
    );
  }
  const href = `${PREFIX}/${item.route}`;
  if (!available.has(item.route!)) {
    return (
      <span className="disabled" title="Not ported yet">
        <a aria-disabled>
          {item.icon} {item.title}
        </a>
      </span>
    );
  }
  return (
    <Link href={href} className={pathname.startsWith(href) ? 'active' : undefined}>
      {item.icon} {item.title}
    </Link>
  );
}

export function Sidebar({ available }: { available: string[] }) {
  const set = new Set(['dashboard', ...available]);
  return (
    <nav className="sidebar">
      <Link href={`${PREFIX}/dashboard`} className="brand">
        PocketDD
      </Link>
      {MENU.map((item) => (
        <Item key={item.title} item={item} available={set} />
      ))}
    </nav>
  );
}
