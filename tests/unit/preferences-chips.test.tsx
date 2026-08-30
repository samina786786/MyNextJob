import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChipListInput, type ChipListHandle } from '@/features/onboarding/components/ChipListInput';
import { parsePreferencesFormData } from '@/lib/validation/preferences';

afterEach(() => {
  cleanup();
});

function LocationSubmitHarness() {
  const [locations, setLocations] = useState<string[]>([]);
  const listRef = useRef<ChipListHandle>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const next = listRef.current?.flush() ?? locations;
        if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(next);
        const formData = new FormData(event.currentTarget);
        formData.set('preferredLocations', hiddenRef.current?.value ?? JSON.stringify(next));
        const parsed = parsePreferencesFormData(formData);
        setSaved(parsed.success ? parsed.data.preferredLocations : []);
      }}
    >
      <input ref={hiddenRef} type="hidden" name="preferredLocations" defaultValue="[]" />
      <input type="hidden" name="targetRoles" value="[]" />
      <input type="hidden" name="workModes" value="[]" />
      <input type="hidden" name="employmentTypes" value="[]" />
      <input type="hidden" name="excludedKeywords" value="[]" />
      <input type="hidden" name="currency" value="USD" />
      <input type="hidden" name="minimumMatchScore" value="75" />
      <ChipListInput
        ref={listRef}
        id="location"
        label="Preferred locations"
        values={locations}
        onChange={(next) => {
          setLocations(next);
          if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(next);
        }}
        placeholder="Hyderabad"
        max={10}
        draftName="preferredLocationDraft"
      />
      <button type="submit">Start finding jobs</button>
      {saved ? <p data-testid="saved-locations">{JSON.stringify(saved)}</p> : null}
    </form>
  );
}

describe('preferences chip submit', () => {
  it('persists Hyderabad when typed and Start finding jobs is pressed without Enter', () => {
    render(<LocationSubmitHarness />);

    fireEvent.change(screen.getByLabelText('Preferred locations'), { target: { value: 'Hyderabad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start finding jobs' }));

    expect(screen.getByTestId('saved-locations').textContent).toBe(JSON.stringify(['Hyderabad']));
  });

  it('commits a location on blur', () => {
    render(<LocationSubmitHarness />);

    const input = screen.getByLabelText('Preferred locations');
    fireEvent.change(input, { target: { value: 'Pune' } });
    fireEvent.blur(input);

    expect(screen.getByRole('button', { name: 'Remove Pune' })).toBeInTheDocument();
  });
});
