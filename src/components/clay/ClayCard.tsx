import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ClaySurface, type ClaySurfaceProps } from './ClaySurface';

/**
 * ClayCard — a common wrapper used across job cards, stat cards, and
 * anything that should visually read as a discrete "object" on the page.
 * It defaults to the raised depth with a bit more padding than a bare
 * surface would use.
 */
export const ClayCard = forwardRef<HTMLDivElement, ClaySurfaceProps>(
  function ClayCard({ className, depth = 'raised', padding = 'lg', radius = 'xl', ...rest }, ref) {
    return (
      <ClaySurface
        ref={ref}
        depth={depth}
        padding={padding}
        radius={radius}
        className={cn('text-foreground', className)}
        {...rest}
      />
    );
  },
);
