'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Icon-only button. Always requires an accessible label via `aria-label`
 * (or `aria-labelledby`) — enforced by TypeScript below.
 */
const clayIconButton = cva(
  cn(
    'inline-flex items-center justify-center',
    'transition-shadow duration-150 select-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-clay-raised active:shadow-clay-pressed',
        secondary: 'bg-surface-raised text-foreground shadow-clay-raised active:shadow-clay-pressed',
        ghost: 'bg-transparent text-foreground hover:bg-surface',
      },
      size: {
        sm: 'h-9  w-9  rounded-clay-sm',
        md: 'h-11 w-11 rounded-clay-md min-h-[44px] min-w-[44px]',
        lg: 'h-12 w-12 rounded-clay-lg min-h-[44px] min-w-[44px]',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>;

export type ClayIconButtonProps = NativeButtonProps &
  VariantProps<typeof clayIconButton> & {
    /** Required accessible label — icon-only controls must announce themselves. */
    'aria-label': string;
  };

export const ClayIconButton = forwardRef<HTMLButtonElement, ClayIconButtonProps>(
  function ClayIconButton({ className, variant, size, children, type = 'button', ...rest }, ref) {
    const reduced = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        type={type}
        whileTap={reduced ? undefined : { scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(clayIconButton({ variant, size }), className)}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {children}
      </motion.button>
    );
  },
);
