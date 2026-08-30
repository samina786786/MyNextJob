import { AppShell } from '@/components/shell/AppShell';

export default function MainShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell homeHref="/home">{children}</AppShell>;
}
