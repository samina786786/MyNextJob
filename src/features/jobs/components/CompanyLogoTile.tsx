'use client';

import Image from 'next/image';
import { useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { CompanyInitialsTile } from '@/features/jobs/components/CompanyInitialsTile';
import { cn } from '@/lib/utils';

/**
 * Fixed 48×48 identity slot. Initials render immediately. A loaded logo
 * overlays the initials only after the image has decoded successfully. On
 * successful load the initials layer is *hidden* — otherwise transparent
 * regions of the logo would show a stray fallback letter bleeding through
 * (regression seen with the Dscout mark).
 *
 * State machine:
 *   loaded=false, failed=false  →  initials visible, image hidden (opacity 0)
 *   loaded=true , failed=false  →  initials HIDDEN, image visible
 *   loaded=*    , failed=true   →  initials visible, image not rendered
 */
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
      <span
        data-company-fallback={showImage && loaded ? 'hidden' : 'visible'}
        aria-hidden={showImage && loaded ? 'true' : undefined}
        className={cn(
          'absolute inset-0 inline-flex',
          // Hidden entirely once the logo is loaded so transparent pixels
          // cannot reveal the fallback letter.
          showImage && loaded ? 'invisible opacity-0' : 'visible opacity-100',
          !reduced && 'transition-opacity duration-150',
        )}
      >
        <CompanyInitialsTile name={name} size={size} />
      </span>
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
