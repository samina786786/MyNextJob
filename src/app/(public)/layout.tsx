import { AppShell } from '@/components/shell/AppShell';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
