import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/home');
  return children;
}
