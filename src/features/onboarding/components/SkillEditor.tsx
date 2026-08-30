'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ClayChip } from '@/components/clay/ClayChip';
import { ClayInput } from '@/components/clay/ClayInput';
import { ClayCard } from '@/components/clay/ClayCard';
import type { SkillOption } from '@/lib/onboarding/queries';

interface SkillEditorProps {
  catalog: SkillOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SkillEditor({ catalog, selectedIds, onChange }: SkillEditorProps) {
  const [query, setQuery] = useState('');
  const selected = catalog.filter((skill) => selectedIds.includes(skill.id));
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .filter((skill) => !selectedIds.includes(skill.id))
      .filter((skill) => {
        if (!needle) return true;
        return (
          skill.name.toLowerCase().includes(needle) ||
          skill.aliases.some((alias) => alias.toLowerCase().includes(needle))
        );
      })
      .slice(0, 12);
  }, [catalog, query, selectedIds]);

  function add(id: string) {
    if (selectedIds.length >= 100 || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery('');
  }

  function remove(id: string) {
    onChange(selectedIds.filter((item) => item !== id));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Your skills</p>
      <div className="flex flex-wrap gap-2">
        {selected.length === 0 ? (
          <p className="text-sm text-secondary">No skills yet. Search the catalog to add some.</p>
        ) : (
          selected.map((skill) => (
            <ClayChip key={skill.id} tone="emerald" size="md" onClick={() => remove(skill.id)} aria-label={`Remove ${skill.name}`}>
              {skill.name}
              <X size={14} aria-hidden="true" />
            </ClayChip>
          ))
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="skill-search" className="block text-sm font-medium text-foreground">
          Add skill
        </label>
        <ClayInput
          id="skill-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search React, AWS, TypeScript…"
          autoComplete="off"
        />
      </div>

      {catalog.length === 0 ? (
        <p className="text-sm text-warning-deep">The skill catalog is not available yet.</p>
      ) : (
        <ClayCard depth="pressed" radius="lg" padding="sm" className="max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-secondary">No matching skills.</p>
          ) : (
            <ul className="space-y-1">
              {results.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    onClick={() => add(skill.id)}
                    className="flex min-h-[44px] w-full items-center rounded-clay-md px-3 text-left text-sm text-foreground hover:bg-primary-soft"
                  >
                    {skill.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ClayCard>
      )}
    </div>
  );
}
