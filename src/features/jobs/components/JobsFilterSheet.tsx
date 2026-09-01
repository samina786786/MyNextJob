'use client';

import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { ClayButton } from '@/components/clay/ClayButton';
import { ClayChip } from '@/components/clay/ClayChip';
import { ClayIconButton } from '@/components/clay/ClayIconButton';
import { ClayInput } from '@/components/clay/ClayInput';
import {
  AGE_VALUES,
  EMPLOYMENT_VALUES,
  LOCATION_MAX_LENGTH,
  WORK_MODE_VALUES,
  type AgeFilter,
  type EmploymentFilter,
  type FeedFilters,
  type WorkModeFilter,
} from '@/lib/jobs/feed/filters';

type SheetFilters = {
  work: WorkModeFilter[];
  employment: EmploymentFilter[];
  location: string;
  age: AgeFilter;
};

const WORK_LABELS: Record<WorkModeFilter, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

const EMPLOYMENT_LABELS: Record<EmploymentFilter, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
  temporary: 'Temporary',
};

const AGE_LABELS: Record<AgeFilter, string> = {
  1: 'Last 24 hours',
  7: 'Last 7 days',
  14: 'Last 14 days',
  30: 'Last 30 days',
};

function toggle<T>(list: readonly T[], value: T): T[] {
  const set = new Set(list);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/**
 * Outer wrapper controls dialog open/close and hosts the native <dialog>.
 * The form contents live in an inner component that mounts fresh on each
 * open, so the draft state naturally initializes with the current filters
 * without any setState-in-effect.
 */
export function JobsFilterSheet({
  open,
  filters,
  onClose,
  onApply,
  onReset,
}: {
  open: boolean;
  filters: FeedFilters;
  onClose: () => void;
  onApply: (next: {
    work: WorkModeFilter[];
    employment: EmploymentFilter[];
    location: string | null;
    age: AgeFilter;
  }) => void;
  onReset: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const first = dialog.querySelector<HTMLElement>('[data-first-focus="true"]');
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = useCallback(
    (event: Event) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', onClose);
    };
  }, [handleCancel, onClose]);

  const handleKey = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={handleKey}
      className="mx-auto w-full max-w-lg rounded-clay-xl bg-surface p-0 shadow-clay-raised backdrop:bg-charcoal/40"
    >
      {open ? (
        <FilterSheetForm
          filters={filters}
          titleId={titleId}
          onClose={onClose}
          onApply={onApply}
          onReset={onReset}
        />
      ) : null}
    </dialog>
  );
}

function FilterSheetForm({
  filters,
  titleId,
  onClose,
  onApply,
  onReset,
}: {
  filters: FeedFilters;
  titleId: string;
  onClose: () => void;
  onApply: (next: {
    work: WorkModeFilter[];
    employment: EmploymentFilter[];
    location: string | null;
    age: AgeFilter;
  }) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<SheetFilters>(() => ({
    work: [...filters.work],
    employment: [...filters.employment],
    location: filters.location ?? '',
    age: filters.age,
  }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({
      work: draft.work,
      employment: draft.employment,
      location: draft.location.trim() ? draft.location.trim() : null,
      age: draft.age,
    });
  };

  const draftEmpty = useMemo(
    () =>
      draft.work.length === 0 &&
      draft.employment.length === 0 &&
      draft.location.trim().length === 0 &&
      draft.age === 30,
    [draft],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          Filters
        </h2>
        <ClayIconButton
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close filters"
          data-first-focus="true"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </ClayIconButton>
      </header>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Work mode</legend>
        <div className="flex flex-wrap gap-2" role="group">
          {WORK_MODE_VALUES.map((value) => (
            <ClayChip
              key={value}
              size="sm"
              active={draft.work.includes(value)}
              onClick={() => setDraft((prev) => ({ ...prev, work: toggle(prev.work, value) }))}
            >
              {WORK_LABELS[value]}
            </ClayChip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Employment type</legend>
        <div className="flex flex-wrap gap-2" role="group">
          {EMPLOYMENT_VALUES.map((value) => (
            <ClayChip
              key={value}
              size="sm"
              active={draft.employment.includes(value)}
              onClick={() =>
                setDraft((prev) => ({ ...prev, employment: toggle(prev.employment, value) }))
              }
            >
              {EMPLOYMENT_LABELS[value]}
            </ClayChip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Location</legend>
        <label htmlFor="jobs-filter-location" className="sr-only">
          Location contains
        </label>
        <ClayInput
          id="jobs-filter-location"
          type="text"
          inputMode="text"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LOCATION_MAX_LENGTH}
          placeholder="e.g. India, Hyderabad, Europe"
          value={draft.location}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setDraft((prev) => ({ ...prev, location: event.target.value }))
          }
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">Freshness</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {AGE_VALUES.map((value) => (
            <ClayChip
              key={value}
              size="sm"
              aria-checked={draft.age === value}
              role="radio"
              active={draft.age === value}
              onClick={() => setDraft((prev) => ({ ...prev, age: value }))}
            >
              {AGE_LABELS[value]}
            </ClayChip>
          ))}
        </div>
      </fieldset>

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <ClayButton
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            setDraft({ work: [], employment: [], location: '', age: 30 });
            onReset();
          }}
          disabled={draftEmpty}
        >
          Reset filters
        </ClayButton>
        <div className="flex items-center gap-2">
          <ClayButton type="button" variant="secondary" size="md" onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton type="submit" variant="primary" size="md">
            Apply filters
          </ClayButton>
        </div>
      </footer>
    </form>
  );
}
