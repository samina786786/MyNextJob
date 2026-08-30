import { describe, expect, it } from 'vitest';

import { deriveDescription, sanitizeDescriptionHtml } from '@/lib/jobs/normalization/sanitize-description';
import { SYNTHETIC_UNSAFE_HTML } from '@/lib/jobs/adapters/synthetic';

describe('description sanitization', () => {
  it('strips script tags and javascript URLs from synthetic HTML', () => {
    const html = sanitizeDescriptionHtml(SYNTHETIC_UNSAFE_HTML);
    expect(html).toContain('Build React applications');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/alert\(/);
  });

  it('derives plain text while keeping skill punctuation', () => {
    const { text } = deriveDescription({
      descriptionHtml: '<p>Need C++, C#, .NET, Node.js and Next.js.</p>',
    });
    expect(text).toBe('Need C++, C#, .NET, Node.js and Next.js.');
  });

  it('collapses extra whitespace and blank lines', () => {
    const { text } = deriveDescription({
      descriptionText: 'Hello\n\n\n\nWorld   team',
    });
    expect(text).toBe('Hello\n\nWorld team');
  });
});
