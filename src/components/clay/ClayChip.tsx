'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * ClayChip — pill-shaped filter/tag control. Selected state is a pressed
 * emerald pill; unselected reads as a raised ivory chip.
 */
const clayChip = cva(
  cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap font-medium',
    'transition-shadow duration-150 select-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright',
  ),
  {
    variants: {
      tone: {
        neutral: 'bg-surface-raised text-foreground shadow-clay-raised',
        emerald: 'bg-primary-soft text-primary-deep shadow-clay-soft',
        selected: 'bg-primary text-primary-foreground shadow-clay-pressed',
      },
      size: {
        sm: 'h-8  px-3   text-xs   rounded-clay-md',
        md: 'h-10 px-3.5 text-sm   rounded-clay-md',
        lg: 'h-11 px-4   text-[15px] rounded-clay-lg min-h-[44px]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'md',
    },
  },
);

export interface ClayChipProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof clayChip> {
  active?: boolean;
}

export const ClayChip = forwardRef<HTMLButtonElement, ClayChipProps>(
  function ClayChip({ className, tone, size, active, children, type = 'button', ...rest }, ref) {
    const reduced = useReducedMotion();
    const resolvedTone = active ? 'selected' : tone ?? 'neutral';
    return (
      <motion.button
        ref={ref}
        type={type}
        aria-pressed={active}
        whileTap={reduced ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(clayChip({ tone: resolvedTone, size }), className)}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {children}
      </motion.button>
    );
  },
);
