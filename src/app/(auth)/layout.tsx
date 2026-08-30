import { AppShell } from '@/components/shell/AppShell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={false} compact>
      {children}
    </AppShell>
  );
}
