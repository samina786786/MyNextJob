import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shape-preserving skeleton. Prefer using it with explicit width/height so
 * that loading states don't cause layout shift when real content arrives.
 * The shimmer animation is disabled globally under prefers-reduced-motion.
 */
export function ClaySkeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('clay-skeleton', className)} {...rest} />;
}
