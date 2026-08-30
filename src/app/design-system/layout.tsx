import { AppShell } from '@/components/shell/AppShell';

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
