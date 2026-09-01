/**
 * Deterministic initials for the Phase 5C logo slot.
 * Single token → first letter. Two or more → first letters of the first two tokens.
 */
export function companyInitials(name: string | null | undefined): string {
  const tokens = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]+/g, ''))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return '?';
  const first = tokens[0]?.[0];
  if (!first) return '?';
  if (tokens.length === 1) return first.toUpperCase();
  const second = tokens[1]?.[0];
  return `${first}${second ?? ''}`.toUpperCase();
}
