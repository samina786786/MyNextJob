'use client';

import { useState } from 'react';
import { ClayChip } from '@/components/clay/ClayChip';

const FILTERS = ['For You', 'Fresh', '90%+', 'Remote'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Client-only interactive chip row for the home preview. Selection is local
 * state — no filtering logic runs because the underlying jobs are fictional.
 */
export function FilterChipStrip() {
  const [active, setActive] = useState<Filter>('For You');

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Sample job filters"
    >
      {FILTERS.map((label) => (
        <ClayChip
          key={label}
          role="tab"
          aria-selected={active === label}
          active={active === label}
          size="md"
          onClick={() => setActive(label)}
        >
          {label}
        </ClayChip>
      ))}
    </div>
  );
}
