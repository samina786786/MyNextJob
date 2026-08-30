import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The base clay primitive. Every other clay component composes on top of
 * this. Handles depth (raised/floating/pressed/flat), radius scale, and
 * background surface.
 */
const claySurface = cva('bg-surface-raised transition-shadow duration-200', {
  variants: {
    depth: {
      flat: 'shadow-clay-soft',
      raised: 'shadow-clay-raised',
      floating: 'shadow-clay-floating',
      pressed: 'shadow-clay-pressed bg-surface-pressed',
    },
    radius: {
      sm: 'rounded-clay-sm',
      md: 'rounded-clay-md',
      lg: 'rounded-clay-lg',
      xl: 'rounded-clay-xl',
      '2xl': 'rounded-clay-2xl',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5',
      xl: 'p-6',
    },
  },
  defaultVariants: {
    depth: 'raised',
    radius: 'lg',
    padding: 'md',
  },
});

export interface ClaySurfaceProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof claySurface> {}

export const ClaySurface = forwardRef<HTMLDivElement, ClaySurfaceProps>(
  function ClaySurface({ className, depth, radius, padding, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(claySurface({ depth, radius, padding }), className)}
        {...rest}
      />
    );
  },
);

export { claySurface };
