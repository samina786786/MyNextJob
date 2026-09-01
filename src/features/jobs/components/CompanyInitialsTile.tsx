import { companyInitials } from '@/lib/jobs/feed/company-initials';
import { cn } from '@/lib/utils';

/** Fixed 48px company identity slot. Logos overlay this; geometry stays. */
export function CompanyInitialsTile({
  name,
  size = 'md',
}: {
  name: string | null;
  size?: 'md' | 'lg';
}) {
  const initials = companyInitials(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-clay-md bg-primary-soft font-semibold text-primary-deep shadow-clay-soft',
        size === 'lg' ? 'h-12 w-12 text-base' : 'h-12 w-12 text-sm',
      )}
    >
      {initials}
    </span>
  );
}
