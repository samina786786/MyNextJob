import { describe, expect, it } from 'vitest';
import { normalizeResumeText } from '@/lib/resume/normalize-text';

describe('normalizeResumeText', () => {
  it('converts CRLF and collapses extra blank lines', () => {
    expect(normalizeResumeText('Hello\r\n\r\n\r\nWorld')).toBe('Hello\n\nWorld');
  });

  it('collapses repeated spaces without removing skill punctuation', () => {
    const text = normalizeResumeText('  C++   C#   .NET   Node.js   Next.js  ');
    expect(text).toBe('C++ C# .NET Node.js Next.js');
  });

  it('applies Unicode compatibility normalization', () => {
    expect(normalizeResumeText('\uFB01le')).toBe('file');
  });
});
