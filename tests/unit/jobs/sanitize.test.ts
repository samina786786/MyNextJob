import { describe, expect, it } from 'vitest';

import { SYNTHETIC_UNSAFE_HTML } from '@/lib/jobs/adapters/synthetic';
import {
  deriveDescription,
  formatStoredDescription,
  htmlToPlainText,
  sanitizeDescriptionHtml,
} from '@/lib/jobs/normalization/sanitize-description';

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

  it('turns adjacent divs into separate blocks instead of glued sentences', () => {
    const html = sanitizeDescriptionHtml(
      '<div>Turn ideas into structured briefs.</div><div>Edit articles to ensure clarity.</div>',
    );
    expect(html).not.toMatch(/briefs\.Edit/);
    expect(html).toMatch(/briefs\./);
    expect(html).toMatch(/Edit articles/);
    expect(html).toMatch(/<\/p>/i);

    const text = htmlToPlainText(
      '<div>Turn ideas into structured briefs.</div><div>Edit articles to ensure clarity.</div>',
    );
    expect(text).not.toMatch(/briefs\.Edit/);
    expect(text).toMatch(/briefs\.\s+Edit/);
  });

  it('wraps bare list items and keeps item boundaries', () => {
    const html = sanitizeDescriptionHtml(
      '<b>What You Will Own</b><li>Turn ideas into structured briefs.</li><li>Edit articles to ensure clarity.</li>',
    );
    expect(html).toMatch(/<ul>/i);
    expect(html).toMatch(/<li>/i);
    expect(html).not.toMatch(/briefs\.Edit/);

    const text = htmlToPlainText(
      '<li>Turn ideas into structured briefs.</li><li>Edit articles to ensure clarity.</li>',
    );
    expect(text).toMatch(/briefs\.\s+Edit/);
  });

  it('turns br tags into plain-text block separators', () => {
    const text = htmlToPlainText(
      'Drivetrain provides a great culture for its employees to thrive in and be happy.<br /><b>Remote-friendly</b>',
    );
    expect(text).not.toMatch(/happy\.Remote/);
    expect(text).toMatch(/happy\.\s*Remote-friendly/);
  });

  it('repairs already-stored glued sentences at display time', () => {
    const stored =
      'Turn ideas into structured, reader-focused briefs.Edit articles to ensure clarity, flow, tone, and usefulness to our audience.Optimize content for SEO, AEO, and human readability.Track content progress.';
    const { html, text } = formatStoredDescription({ html: stored, text: stored });
    expect(html).not.toMatch(/briefs\.Edit/);
    expect(html).not.toMatch(/audience\.Optimize/);
    expect(html).not.toMatch(/readability\.Track/);
    expect(text).toMatch(/briefs\. Edit/);
    expect(text).toMatch(/audience\. Optimize/);
    expect(text).toMatch(/readability\. Track/);
    expect(text).not.toMatch(/\.NET /);
  });

  it('does not insert breaks into .NET or acronym tokens', () => {
    const { text } = deriveDescription({
      descriptionHtml: '<p>Experience with .NET, AEO, and SEO.</p>',
    });
    expect(text).toBe('Experience with .NET, AEO, and SEO.');
  });

  it('drops provider style and class attributes', () => {
    const html = sanitizeDescriptionHtml(
      '<p style="color:red" class="lever-cast">Safe</p><div style="font-size:40px">Next block</div>',
    );
    expect(html).not.toContain('style=');
    expect(html).not.toContain('class=');
    expect(html).toContain('Safe');
    expect(html).toContain('Next block');
  });
});
