import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Shared clay button classes — safe to import from Server Components (e.g. links). */
export const clayButton = cva(
  cn(
    'relative inline-flex items-center justify-center gap-2 font-medium',
    'transition-shadow duration-150 select-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright',
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'bg-primary text-primary-foreground',
          'shadow-clay-raised active:shadow-clay-pressed',
          'hover:bg-primary-bright',
        ),
        secondary: cn(
          'bg-surface-raised text-foreground',
          'shadow-clay-raised active:shadow-clay-pressed',
          'hover:bg-surface',
        ),
        ghost: cn(
          'bg-transparent text-foreground',
          'hover:bg-surface active:shadow-clay-pressed',
        ),
        destructive: cn(
          'bg-destructive text-destructive-foreground',
          'shadow-clay-raised active:shadow-clay-pressed',
        ),
      },
      size: {
        sm: 'h-9  px-4 text-sm rounded-clay-sm',
        md: 'h-11 px-5 text-[15px] rounded-clay-md min-h-[44px]',
        lg: 'h-12 px-6 text-base rounded-clay-lg min-h-[44px]',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);
