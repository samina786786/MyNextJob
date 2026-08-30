'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Bookmark, Activity, User, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Bottom navigation. Uses `usePathname` to compute the active item so it
 * works even before real feature pages exist (they'll route on their own
 * once Phase 5 lands). Safe-area padding keeps it clear of the iOS home
 * indicator without stealing tap area from the tabs above it.
 */
function navItems(homeHref: string): readonly NavItem[] {
  return [
    { href: homeHref, label: 'Home', Icon: Home },
    { href: '/search', label: 'Search', Icon: Search },
    { href: '/saved', label: 'Saved', Icon: Bookmark },
    { href: '/activity', label: 'Activity', Icon: Activity },
    { href: '/profile', label: 'Profile', Icon: User },
  ];
}

export function ClayNav({ homeHref = '/' }: { homeHref?: string }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const items = navItems(homeHref);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40',
        'safe-bottom px-3 pt-2',
        'pointer-events-none',
      )}
    >
      <div
        className={cn(
          'pointer-events-auto mx-auto flex max-w-md items-stretch justify-between',
          'rounded-clay-2xl bg-surface-raised shadow-clay-floating',
          'px-2 py-1.5',
        )}
      >
        {items.map(({ href, label, Icon }) => {
          const active =
            href === '/' || href === '/home'
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'group relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1',
                'rounded-clay-lg px-2 py-2 min-h-[44px]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright',
              )}
            >
              <motion.span
                whileTap={reduced ? undefined : { scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-clay-md transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-clay-raised'
                    : 'text-secondary group-hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={2.25} />
              </motion.span>
              <span
                className={cn(
                  'text-[11px] font-medium leading-none',
                  active ? 'text-primary-deep' : 'text-secondary',
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
