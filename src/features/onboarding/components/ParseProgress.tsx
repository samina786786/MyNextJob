'use client';

import { useReducedMotion } from 'motion/react';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClaySkeleton } from '@/components/clay/ClaySkeleton';

export function ParseProgress({ label }: { label: string }) {
  const reduced = useReducedMotion();

  return (
    <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
      <p className="text-[15px] font-semibold text-foreground" aria-live="polite">
        {label}
      </p>
      <ul className="space-y-2 text-sm text-secondary">
        {['experience', 'technologies', 'profile details'].map((item) => (
          <li key={item} className="flex items-center gap-3">
            <ClaySkeleton className={reduced ? 'h-3 w-3 rounded-full' : 'h-3 w-3 rounded-full'} />
            Finding {item}
          </li>
        ))}
      </ul>
    </ClayCard>
  );
}
