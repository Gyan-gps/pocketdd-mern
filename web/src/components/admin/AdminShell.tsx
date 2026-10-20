'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MENU, type MenuItem } from '@/admin/registry';

const PREFIX = '/pocketddadmin';
const COLLAPSED_KEY = 'sidebar-collapsed'; // same sessionStorage key Backpack's sidebar.blade.php uses

/**
 * Backpack coreuiv4 "top_left" layout: purple gradient sidebar with the logo block, a transparent
 * header with the menu toggler and the user avatar, the page, and the developer footer.
 */
export function AdminShell({
  userName,
  available,
  logoutAction,
  children,
}: {
  userName: string;
  /** Entity routes the API serves; menu items without one are shown disabled. */
  available: string[];
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        sessionStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} available={new Set(['dashboard', ...available])} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between px-3">
          <button type="button" onClick={toggle} aria-label="Toggle navigation" className="cursor-pointer p-1">
            <svg className="size-6" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path stroke="#869AB8" strokeWidth="2.25" strokeLinecap="round" strokeMiterlimit="10" d="M4 7h22M4 15h22M4 23h22" />
            </svg>
          </button>
          <UserMenu userName={userName} logoutAction={logoutAction} />
        </header>
        <main className="flex-1 px-5 pb-6">{children}</main>
        <footer className="mx-auto p-2 text-muted">
          Handcrafted by{' '}
          <a href="https://www.microprixs.com/" target="_blank" rel="noopener">
            Microprixs Solution Pvt.Ltd
          </a>
          .
        </footer>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, available }: { collapsed: boolean; available: Set<string> }) {
  return (
    <nav
      aria-label="Main menu"
      className={`shrink-0 bg-gradient-to-t from-sidebar-bottom to-sidebar-top text-white/75 transition-[width] duration-200 ${
        collapsed ? 'w-0 overflow-hidden' : 'w-64 min-w-64'
      }`}
    >
      <Link href={`${PREFIX}/dashboard`} className="flex h-[89px] items-center justify-center bg-[#f5f5f5]" title="Pocket DD">
        {/* config/backpack/ui.php project_logo */}
        <img src="/assets/logo/logo.png" alt="Pocket-DD" className="max-h-full max-w-full px-8 py-4" />
      </Link>
      <ul className="py-0">
        {MENU.map((item) => (
          <MenuEntry key={item.title} item={item} available={available} />
        ))}
      </ul>
    </nav>
  );
}

const linkClass = 'flex items-center gap-4 py-3.5 pr-3 pl-6 text-white/75 hover:bg-white/5 hover:text-white hover:no-underline';

function MenuEntry({ item, available }: { item: MenuItem; available: Set<string> }) {
  const pathname = usePathname();
  const isActive = (route?: string) => !!route && (pathname === `${PREFIX}/${route}` || pathname.startsWith(`${PREFIX}/${route}/`));
  const childActive = item.children?.some((c) => isActive(c.route)) ?? false;
  const [open, setOpen] = useState(childActive);

  if (item.children) {
    return (
      <li className={open ? 'bg-black/10' : undefined}>
        <button type="button" onClick={() => setOpen((o) => !o)} className={`${linkClass} w-full cursor-pointer text-left`} aria-expanded={open}>
          <i className={`la ${item.icon} text-xl`} aria-hidden />
          <span className="flex-1">{item.title}</span>
          <i className={`la la-angle-down text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {open && (
          <ul>
            {item.children.map((c) => (
              <MenuEntry key={c.title} item={c} available={available} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const route = item.route!;
  if (!available.has(route)) {
    return (
      <li>
        <span className={`${linkClass} cursor-not-allowed opacity-40`} title="Not available yet">
          <i className={`la ${item.icon} text-xl`} aria-hidden />
          {item.title}
        </span>
      </li>
    );
  }
  return (
    <li>
      <Link href={`${PREFIX}/${route}`} className={`${linkClass} ${isActive(route) ? 'bg-white/5 text-white' : ''}`}>
        <i className={`la ${item.icon} text-xl`} aria-hidden />
        {item.title}
      </Link>
    </li>
  );
}

/** inc/menu_user_dropdown.blade.php: green initial avatar with a dropdown. */
function UserMenu({ userName, logoutAction }: { userName: string; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <div ref={ref} className="relative mr-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${userName}`}
        className="flex size-[35px] cursor-pointer items-center justify-center rounded-full bg-avatar text-[85%] font-light text-white"
      >
        {userName ? [...userName][0] : 'A'}
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1 min-w-40 rounded border border-line bg-white py-1 shadow-md">
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left hover:bg-addon">
              <i className="la la-lock" aria-hidden /> Logout
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
