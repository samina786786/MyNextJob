import sanitizeHtml from 'sanitize-html';

import { collapseWhitespace } from '@/lib/jobs/normalization/text';

const ALLOWED_TAGS = [
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'a',
];

/**
 * Server-side HTML sanitization. This is the security boundary — never
 * rely on browser DOMPurify for persisted job HTML.
 */
export function sanitizeDescriptionHtml(html: string | null | undefined): string | null {
  if (html == null || html.trim() === '') return null;
  const cleaned = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
  }).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function htmlToPlainText(html: string | null | undefined): string | null {
  if (html == null || html.trim() === '') return null;
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return normalizeDescriptionText(text);
}

/**
 * Plain text for search, later skill extraction, matching, and dedupe.
 * Preserves punctuation in tokens like C++, C#, .NET, Node.js, Next.js.
 */
export function normalizeDescriptionText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const normalized = collapseWhitespace(
    text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  );
  return normalized.length > 0 ? normalized : null;
}

export function deriveDescription(input: {
  descriptionHtml?: string | null;
  descriptionText?: string | null;
}): { html: string | null; text: string | null } {
  const html = sanitizeDescriptionHtml(input.descriptionHtml);
  const fromHtml = htmlToPlainText(input.descriptionHtml);
  const text =
    normalizeDescriptionText(input.descriptionText) ?? fromHtml ?? null;
  return { html, text };
}
