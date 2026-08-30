import Link from 'next/link';
import { ClayCard } from '@/components/clay/ClayCard';

interface AuthCardProps {
  title: string;
  children: React.ReactNode;
  eyebrow?: string;
  description?: string;
}

export function AuthCard({ title, children, eyebrow = 'MyNextJob', description }: AuthCardProps) {
  return (
    <div className="space-y-6 px-4 pt-2 safe-top">
      <header className="space-y-1.5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">
          <Link href="/" className="rounded-clay-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright">
            {eyebrow}
          </Link>
        </p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">{title}</h1>
        {description ? <p className="text-[15px] text-secondary">{description}</p> : null}
      </header>
      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-5">
        {children}
      </ClayCard>
    </div>
  );
}
