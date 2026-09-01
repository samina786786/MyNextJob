import { requireAuth } from '@/lib/auth/session';
import { RouteSuspense } from '@/components/shell/RouteSuspense';

async function AppAuthGate({ children }: { children: React.ReactNode }) {
  await requireAuth('/home');
  return children;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteSuspense>
      <AppAuthGate>{children}</AppAuthGate>
    </RouteSuspense>
  );
}
