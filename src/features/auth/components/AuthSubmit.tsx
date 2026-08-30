'use client';

import { useFormStatus } from 'react-dom';
import { ClayButton } from '@/components/clay/ClayButton';

export function AuthSubmit({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <ClayButton type="submit" variant="primary" size="lg" block disabled={pending} aria-busy={pending}>
      <span className="inline-flex min-h-[1.25em] items-center justify-center gap-2">
        {pending ? (
          <>
            <span
              className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
              aria-hidden="true"
            />
            {pendingLabel}
          </>
        ) : (
          children
        )}
      </span>
    </ClayButton>
  );
}
