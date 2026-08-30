'use client';

import { useActionState, useState } from 'react';
import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';
import { saveProfileReviewAction, type ActionResult } from '@/features/onboarding/actions';
import type { SkillOption } from '@/lib/onboarding/queries';
import { Field } from './Field';
import { SkillEditor } from './SkillEditor';

interface ProfileReviewFormProps {
  fullName: string;
  headline: string;
  yearsExperience: number | null;
  city: string;
  country: string;
  skillIds: string[];
  catalog: SkillOption[];
  warnings: string[];
  next: 'preferences' | 'profile';
}

export function ProfileReviewForm({
  fullName,
  headline,
  yearsExperience,
  city,
  country,
  skillIds: initialSkillIds,
  catalog,
  warnings,
  next,
}: ProfileReviewFormProps) {
  const [skillIds, setSkillIds] = useState(initialSkillIds);
  const [state, action, pending] = useActionState(saveProfileReviewAction, {} as ActionResult);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="skillIds" value={JSON.stringify(skillIds)} />
      <input type="hidden" name="next" value={next} />

      {warnings.length > 0 ? (
        <ClayCard depth="pressed" radius="lg" padding="md" className="space-y-1 bg-warning-soft">
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-warning-deep">
              {warning}
            </p>
          ))}
        </ClayCard>
      ) : null}

      <ClayCard depth="raised" radius="xl" padding="lg" className="space-y-4">
        <Field id="fullName" name="fullName" label="Full name" defaultValue={fullName} required maxLength={80} />
        <Field
          id="headline"
          name="headline"
          label="Professional headline"
          defaultValue={headline}
          required
          maxLength={120}
          placeholder="Senior Frontend Engineer"
        />
        <Field
          id="yearsExperience"
          name="yearsExperience"
          label="Years of experience"
          type="number"
          min={0}
          max={50}
          defaultValue={yearsExperience ?? ''}
          hint="Leave blank if you are unsure."
        />
        <Field id="city" name="city" label="City" defaultValue={city} maxLength={100} />
        <Field id="country" name="country" label="Country" defaultValue={country} maxLength={100} />
      </ClayCard>

      <ClayCard depth="raised" radius="xl" padding="lg">
        <SkillEditor catalog={catalog} selectedIds={skillIds} onChange={setSkillIds} />
      </ClayCard>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive-deep">
          {state.error}
        </p>
      ) : null}

      <ClayButton type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? 'Saving…' : next === 'profile' ? 'Save profile' : 'Continue'}
      </ClayButton>
    </form>
  );
}
