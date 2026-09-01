'use client';

import { useRouter } from 'next/navigation';

import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';

export function JobsFeedSectionError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const router = useRouter();
  return (
    <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
      <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
      <p className="text-[15px] text-secondary">{message}</p>
      <ClayButton type="button" variant="primary" size="md" onClick={() => router.refresh()}>
        Retry
      </ClayButton>
    </ClayCard>
  );
}
