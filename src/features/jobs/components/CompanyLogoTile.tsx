'use client';

import Image from 'next/image';
import { useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { CompanyInitialsTile } from '@/features/jobs/components/CompanyInitialsTile';
import { cn } from '@/lib/utils';

export function CompanyLogoTile({
  name,
  logoUrl,
  size = 'md',
  priority = false,
}: {
  name: string | null;
  logoUrl: string | null;
  size?: 'md' | 'lg';
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reduced = useReducedMotion();
  const showImage = Boolean(logoUrl) && !failed;
  const identity = showImage && loaded ? 'logo' : 'initials';

  return (
    <span
      data-company-identity={identity}
      className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-clay-md"
    >
      <CompanyInitialsTile name={name} size={size} />
      {showImage && logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          fill
          sizes="48px"
          priority={priority}
          className={cn(
            'object-contain',
            loaded ? 'opacity-100' : 'opacity-0',
            !reduced && 'transition-opacity duration-150',
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
