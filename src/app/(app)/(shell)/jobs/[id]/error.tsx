'use client';

import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';

export default function JobDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-4 pt-2">
      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <h1 className="text-[22px] font-semibold text-foreground">Couldn&apos;t load this job.</h1>
        <p className="text-[15px] text-secondary">Please try again in a moment.</p>
        <ClayButton type="button" variant="primary" size="md" onClick={reset}>
          Retry
        </ClayButton>
      </ClayCard>
    </div>
  );
}
