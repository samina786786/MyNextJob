import { z } from 'zod';

export const targetRoleSchema = z.string().trim().min(1).max(80);
export const locationEntrySchema = z.string().trim().min(1).max(80);
export const excludedKeywordSchema = z.string().trim().min(1).max(60);

export function normalizeChip(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function addUniqueChip(list: string[], value: string, max: number): string[] {
  const next = normalizeChip(value);
  if (!next) return list;
  if (list.some((item) => item.toLowerCase() === next.toLowerCase())) return list;
  if (list.length >= max) return list;
  return [...list, next];
}

/** Commit a still-typed chip draft. Empty, too-long, duplicate, and over-limit values are skipped. */
export function commitChipDraft(list: string[], draft: string, maxItems: number, maxChars = 80): string[] {
  const next = normalizeChip(draft);
  if (!next || next.length > maxChars) return list;
  return addUniqueChip(list, next, maxItems);
}
