import { ClayNav } from '@/components/clay/ClayNav';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  nav?: boolean;
  homeHref?: string;
  /** Narrower column for auth cards. */
  compact?: boolean;
}

export function AppShell({ children, nav = true, homeHref = '/', compact = false }: AppShellProps) {
  return (
    <>
      <div
        className={cn(
          'mx-auto flex min-h-dvh flex-col safe-x',
          compact ? 'max-w-md' : 'max-w-2xl',
        )}
      >
        <main id="main" role="main" className={cn('flex-1 pt-4', nav ? 'pb-32' : 'pb-10')}>
          {children}
        </main>
      </div>
      {nav ? <ClayNav homeHref={homeHref} /> : null}
    </>
  );
}
