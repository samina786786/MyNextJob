import { AppShell } from '@/components/shell/AppShell';
import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/home');
  return (
    <AppShell homeHref="/home">
      {children}
    </AppShell>
  );
}
