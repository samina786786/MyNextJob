'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { type VariantProps } from 'class-variance-authority';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { clayButton } from './clayButtonStyles';

/**
 * ClayButton — tactile primary control. Adopts the clay depth system so it
 * physically compresses on press. Uses `motion/react` for the tap spring;
 * `prefers-reduced-motion` disables the scale animation entirely.
 */

export interface ClayButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof clayButton> {
  /** Optional leading icon element. */
  leading?: React.ReactNode;
  /** Optional trailing icon element. */
  trailing?: React.ReactNode;
}

export const ClayButton = forwardRef<HTMLButtonElement, ClayButtonProps>(
  function ClayButton(
    { className, variant, size, block, leading, trailing, children, type = 'button', ...rest },
    ref,
  ) {
    const reduced = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        type={type}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(clayButton({ variant, size, block }), className)}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {leading}
        {children}
        {trailing}
      </motion.button>
    );
  },
);

export { clayButton } from './clayButtonStyles';
