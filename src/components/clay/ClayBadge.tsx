import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Small, non-interactive status label.
 *
 * `matchStrong/matchGood/matchModerate` are the semantic tones used by the
 * job match scoring UI — the visual variants are locked here so future
 * feature code doesn't reinvent color choices.
 */
const clayBadge = cva(
  cn(
    'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap',
    'shadow-clay-soft',
  ),
  {
    variants: {
      tone: {
        neutral:       'bg-surface-strong text-foreground',
        emerald:       'bg-primary text-primary-foreground',
        soft:          'bg-primary-soft text-primary-deep',
        matchStrong:   'bg-primary text-primary-foreground',
        matchGood:     'bg-primary-soft text-primary-deep',
        matchModerate: 'bg-warning-soft text-warning-deep',
        warning:       'bg-warning-soft text-warning-deep',
        destructive:   'bg-destructive-soft text-destructive-deep',
      },
      size: {
        sm: 'text-[11px] px-2  py-0.5',
        md: 'text-xs    px-2.5 py-1',
        lg: 'text-sm    px-3   py-1.5',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface ClayBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof clayBadge> {}

export const ClayBadge = forwardRef<HTMLSpanElement, ClayBadgeProps>(
  function ClayBadge({ className, tone, size, ...rest }, ref) {
    return <span ref={ref} className={cn(clayBadge({ tone, size }), className)} {...rest} />;
  },
);

/** Pick a match badge tone from a raw score 0–100. */
export function toneForMatchScore(score: number): 'matchStrong' | 'matchGood' | 'matchModerate' {
  if (score >= 90) return 'matchStrong';
  if (score >= 75) return 'matchGood';
  return 'matchModerate';
}
