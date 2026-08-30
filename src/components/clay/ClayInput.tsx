import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ClayInput — pressed clay text input. Native focus ring is replaced by
 * an emerald outline (see globals.css :focus-visible), so keyboard users
 * still get an obvious focus target.
 */
export interface ClayInputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const ClayInput = forwardRef<HTMLInputElement, ClayInputProps>(
  function ClayInput({ className, leading, trailing, ...rest }, ref) {
    const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';
    return (
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-clay-lg bg-surface-pressed',
          'px-4 min-h-[48px] shadow-clay-pressed',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
          invalid
            ? 'focus-within:outline-destructive outline outline-2 outline-offset-2 outline-destructive'
            : 'focus-within:outline-primary-bright',
          className,
        )}
      >
        {leading && (
          <span className="flex shrink-0 items-center text-muted-foreground">{leading}</span>
        )}
        <input
          ref={ref}
          className={cn(
            'flex-1 min-w-0 bg-transparent text-[15px] text-foreground',
            'placeholder:text-muted-foreground focus:outline-none',
          )}
          {...rest}
        />
        {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
      </div>
    );
  },
);
