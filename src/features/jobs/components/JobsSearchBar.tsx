'use client';

import { Search, X } from 'lucide-react';
import { forwardRef, type ChangeEvent } from 'react';

import { ClayIconButton } from '@/components/clay/ClayIconButton';
import { ClayInput } from '@/components/clay/ClayInput';
import { SEARCH_QUERY_MAX_LENGTH } from '@/lib/jobs/feed/filters';

export interface JobsSearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export const JobsSearchBar = forwardRef<HTMLInputElement, JobsSearchBarProps>(
  function JobsSearchBar({ value, onChange, onClear, disabled }, ref) {
    const showClear = value.length > 0;
    return (
      <div role="search" aria-label="Search fresh jobs">
        <label htmlFor="jobs-search" className="sr-only">
          Search fresh jobs by title or company
        </label>
        <ClayInput
          id="jobs-search"
          ref={ref}
          type="search"
          inputMode="search"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          placeholder="Search jobs or companies…"
          value={value}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          trailing={
            showClear ? (
              <ClayIconButton
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Clear search"
                onClick={onClear}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </ClayIconButton>
            ) : null
          }
        />
      </div>
    );
  },
);
