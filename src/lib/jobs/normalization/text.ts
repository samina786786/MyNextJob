/**
 * Shared text helpers for comparison keys. Display strings stay separate.
 */

export function unicodeFold(value: string): string {
  return value.normalize('NFKC');
}

export function collapseWhitespace(value: string): string {
  return unicodeFold(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function comparisonKey(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = collapseWhitespace(value);
  return trimmed.length === 0 ? null : trimmed;
}
