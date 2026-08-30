'use client';

import { useActionState, useRef, useState, type FormEvent } from 'react';
import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClayChip } from '@/components/clay/ClayChip';
import { ClayInput } from '@/components/clay/ClayInput';
import { savePreferencesAction, type ActionResult } from '@/features/onboarding/actions';
import { ChipListInput, type ChipListHandle } from './ChipListInput';

const WORK_MODES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const;

const EMPLOYMENT = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'internship', label: 'Internship' },
] as const;

interface PreferencesFormProps {
  targetRoles: string[];
  preferredLocations: string[];
  workModes: string[];
  employmentTypes: string[];
  minimumSalary: number | null;
  currency: string;
  minimumMatchScore: number;
  excludedKeywords: string[];
  complete: boolean;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function PreferencesForm(props: PreferencesFormProps) {
  const [targetRoles, setTargetRoles] = useState(props.targetRoles);
  const [preferredLocations, setPreferredLocations] = useState(props.preferredLocations);
  const [workModes, setWorkModes] = useState(props.workModes);
  const [employmentTypes, setEmploymentTypes] = useState(props.employmentTypes);
  const [excludedKeywords, setExcludedKeywords] = useState(props.excludedKeywords);
  const [matchScore, setMatchScore] = useState(props.minimumMatchScore);
  const [state, action, pending] = useActionState(savePreferencesAction, {} as ActionResult);
  const rolesRef = useRef<ChipListHandle>(null);
  const locationsRef = useRef<ChipListHandle>(null);
  const excludedRef = useRef<ChipListHandle>(null);
  const rolesHiddenRef = useRef<HTMLInputElement>(null);
  const locationsHiddenRef = useRef<HTMLInputElement>(null);
  const excludedHiddenRef = useRef<HTMLInputElement>(null);

  function syncList(hidden: HTMLInputElement | null, next: string[], setter: (values: string[]) => void) {
    setter(next);
    if (hidden) hidden.value = JSON.stringify(next);
  }

  function flushDrafts() {
    syncList(rolesHiddenRef.current, rolesRef.current?.flush() ?? targetRoles, setTargetRoles);
    syncList(locationsHiddenRef.current, locationsRef.current?.flush() ?? preferredLocations, setPreferredLocations);
    syncList(excludedHiddenRef.current, excludedRef.current?.flush() ?? excludedKeywords, setExcludedKeywords);
  }

  function onSubmit(_event: FormEvent<HTMLFormElement>) {
    flushDrafts();
  }

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-5">
      <input ref={rolesHiddenRef} type="hidden" name="targetRoles" value={JSON.stringify(targetRoles)} />
      <input
        ref={locationsHiddenRef}
        type="hidden"
        name="preferredLocations"
        value={JSON.stringify(preferredLocations)}
      />
      <input type="hidden" name="workModes" value={JSON.stringify(workModes)} />
      <input type="hidden" name="employmentTypes" value={JSON.stringify(employmentTypes)} />
      <input
        ref={excludedHiddenRef}
        type="hidden"
        name="excludedKeywords"
        value={JSON.stringify(excludedKeywords)}
      />
      <input type="hidden" name="minimumMatchScore" value={String(matchScore)} />
      <input type="hidden" name="complete" value={props.complete ? 'true' : 'false'} />

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Target roles</p>
        <ChipListInput
          ref={rolesRef}
          id="target-role"
          label="Roles you want next"
          values={targetRoles}
          onChange={(next) => syncList(rolesHiddenRef.current, next, setTargetRoles)}
          placeholder="Frontend Engineer"
          max={10}
          draftName="targetRoleDraft"
          hint="Up to 10. We'll add what you've typed when you continue."
        />
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Work style</p>
        <div className="flex flex-wrap gap-2">
          {WORK_MODES.map((mode) => (
            <ClayChip
              key={mode.value}
              active={workModes.includes(mode.value)}
              size="lg"
              onClick={() => setWorkModes(toggle(workModes, mode.value))}
            >
              {mode.label}
            </ClayChip>
          ))}
        </div>
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Location</p>
        <ChipListInput
          ref={locationsRef}
          id="location"
          label="Preferred locations"
          values={preferredLocations}
          onChange={(next) => syncList(locationsHiddenRef.current, next, setPreferredLocations)}
          placeholder="Hyderabad"
          max={10}
          draftName="preferredLocationDraft"
          hint="City, country, or Remote India."
        />
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-deep">Employment</p>
        <div className="flex flex-wrap gap-2">
          {EMPLOYMENT.map((item) => (
            <ClayChip
              key={item.value}
              active={employmentTypes.includes(item.value)}
              size="lg"
              onClick={() => setEmploymentTypes(toggle(employmentTypes, item.value))}
            >
              {item.label}
            </ClayChip>
          ))}
        </div>
      </ClayCard>

      <details className="rounded-clay-xl bg-surface-raised p-5 shadow-clay-raised">
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
          More options
          <span className="mt-1 block text-sm font-normal text-secondary">Salary, match score, exclusions</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="minimumSalary" className="block text-sm font-medium text-foreground">
                Minimum salary
              </label>
              <ClayInput
                id="minimumSalary"
                name="minimumSalary"
                type="number"
                min={0}
                defaultValue={props.minimumSalary ?? ''}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="currency" className="block text-sm font-medium text-foreground">
                Currency
              </label>
              <ClayInput id="currency" name="currency" defaultValue={props.currency || 'USD'} maxLength={3} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="match-score" className="block text-sm font-medium text-foreground">
              Minimum match score ({matchScore})
            </label>
            <input
              id="match-score"
              type="range"
              min={0}
              max={100}
              value={matchScore}
              onChange={(event) => setMatchScore(Number(event.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-sm text-secondary">Used later for your feed. Matching is not live yet.</p>
          </div>

          <ChipListInput
            ref={excludedRef}
            id="excluded"
            label="Excluded keywords"
            values={excludedKeywords}
            onChange={(next) => syncList(excludedHiddenRef.current, next, setExcludedKeywords)}
            placeholder="night shift"
            max={20}
            draftName="excludedKeywordDraft"
            entryMaxLength={60}
          />
        </div>
      </details>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive-deep">
          {state.error}
        </p>
      ) : null}

      <ClayButton type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? 'Saving…' : props.complete ? 'Start finding jobs' : 'Save preferences'}
      </ClayButton>
    </form>
  );
}
