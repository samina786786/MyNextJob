'use client';

import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { ClayChip } from '@/components/clay/ClayChip';
import { ClayInput } from '@/components/clay/ClayInput';
import { commitChipDraft } from '@/lib/validation/chips';

export interface ChipListHandle {
  flush: () => string[];
}

interface ChipListInputProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  max: number;
  draftName: string;
  entryMaxLength?: number;
  hint?: string;
}

export const ChipListInput = forwardRef<ChipListHandle, ChipListInputProps>(
  function ChipListInput(
    { id, label, values, onChange, placeholder, max, draftName, entryMaxLength = 80, hint },
    ref,
  ) {
    const [draft, setDraft] = useState('');
    const valuesRef = useRef(values);
    const draftRef = useRef(draft);
    valuesRef.current = values;
    draftRef.current = draft;

    function commit(raw: string = draftRef.current): string[] {
      const next = commitChipDraft(valuesRef.current, raw, max, entryMaxLength);
      valuesRef.current = next;
      draftRef.current = '';
      onChange(next);
      setDraft('');
      return next;
    }

    useImperativeHandle(ref, () => ({
      flush: () => commit(),
    }));

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
    }

    return (
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {values.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {values.map((value) => (
              <ClayChip
                key={value}
                tone="emerald"
                size="md"
                onClick={() => onChange(values.filter((item) => item !== value))}
                aria-label={`Remove ${value}`}
              >
                {value}
                <X size={14} aria-hidden="true" />
              </ClayChip>
            ))}
          </div>
        ) : null}
        <ClayInput
          id={id}
          name={draftName}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draftRef.current.trim()) commit();
          }}
          placeholder={placeholder}
          maxLength={entryMaxLength}
          disabled={values.length >= max}
        />
        {hint ? <p className="text-sm text-secondary">{hint}</p> : null}
      </div>
    );
  },
);
