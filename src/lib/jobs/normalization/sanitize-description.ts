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

const BLOCK_CLOSE_TAGS = [
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'figure',
  'blockquote',
  'pre',
  'li',
  'tr',
  'dt',
  'dd',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
];

const BLOCK_CLOSE_RE = new RegExp(`</(${BLOCK_CLOSE_TAGS.join('|')})\\s*>`, 'gi');

/**
 * Sentence-ending punctuation glued to the next capitalized word.
 * Requires a real word after the capital so `.NET` / `AEO` stay intact.
 */
const GLUED_SENTENCE_RE = /([a-z0-9)])([.!?])([A-Z][a-z]{2,})/g;

const TRANSFORM_TAGS = {
  div: 'p',
  section: 'p',
  article: 'p',
  header: 'p',
  footer: 'p',
  main: 'p',
  aside: 'p',
  figure: 'p',
  pre: 'p',
  h1: 'h2',
  h5: 'h3',
  h6: 'h3',
};

/**
 * Wrap consecutive <li> runs that are not already inside ul/ol.
 * Lever (and others) often emit bare list items inside description HTML.
 */
export function wrapBareListItems(html: string): string {
  if (!/<li\b/i.test(html)) return html;
  return html.replace(/(?:<li\b[^>]*>[\s\S]*?<\/li>\s*)+/gi, (run, offset: number, full: string) => {
    const before = full.slice(0, offset).replace(/[\s\n\r]+$/u, '');
    if (/<(?:ul|ol)\b[^>]*>$/i.test(before) || /<\/li>$/i.test(before)) {
      return run;
    }
    return `<ul>${run.trim()}</ul>`;
  });
}

/**
 * Keep a break when disallowed block tags are later unwrapped, so
 * `briefs.</div><div>Edit` cannot collapse into `briefs.Edit`.
 */
export function preserveBlockBoundaries(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '<br />\n')
    .replace(BLOCK_CLOSE_RE, '</$1>\n');
}

export function restoreGluedSentencesInText(text: string): string {
  return text.replace(GLUED_SENTENCE_RE, '$1$2 $3');
}

/**
 * Insert a line break between glued sentences inside HTML text nodes.
 * Does not rewrite tag attributes (those never match `>([^<]*)`).
 */
export function restoreGluedSentencesInHtml(html: string): string {
  return html.replace(/(^|>)([^<]*)/g, (_match, prefix: string, text: string) => {
    return `${prefix}${text.replace(GLUED_SENTENCE_RE, '$1$2<br />$3')}`;
  });
}

function prepareDescriptionHtml(html: string): string {
  return wrapBareListItems(preserveBlockBoundaries(html));
}

/**
 * Server-side HTML sanitization. This is the security boundary — never
 * rely on browser DOMPurify for persisted job HTML.
 */
export function sanitizeDescriptionHtml(html: string | null | undefined): string | null {
  if (html == null || html.trim() === '') return null;
  const cleaned = sanitizeHtml(prepareDescriptionHtml(html), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    transformTags: TRANSFORM_TAGS,
  }).trim();
  if (cleaned.length === 0) return null;
  const restored = restoreGluedSentencesInHtml(cleaned).trim();
  return restored.length > 0 ? restored : null;
}

export function htmlToPlainText(html: string | null | undefined): string | null {
  if (html == null || html.trim() === '') return null;
  const withBreaks = preserveBlockBoundaries(html).replace(/<br\s*\/?>/gi, '\n');
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return normalizeDescriptionText(restoreGluedSentencesInText(text));
}

/**
 * Plain text for search, later skill extraction, matching, and dedupe.
 * Preserves punctuation in tokens like C++, C#, .NET, Node.js, Next.js.
 */
export function normalizeDescriptionText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const normalized = collapseWhitespace(
    restoreGluedSentencesInText(
      text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"'),
    ),
  );
  return normalized.length > 0 ? normalized : null;
}

export function deriveDescription(input: {
  descriptionHtml?: string | null;
  descriptionText?: string | null;
}): { html: string | null; text: string | null } {
  const html = sanitizeDescriptionHtml(input.descriptionHtml);
  const fromHtml = htmlToPlainText(input.descriptionHtml) ?? htmlToPlainText(html);
  const text =
    normalizeDescriptionText(input.descriptionText) ?? fromHtml ?? null;
  return { html, text };
}

/**
 * Read-time repair for already-stored catalog HTML/text. Does not write
 * to the database. Idempotent with the ingest sanitizer.
 */
export function formatStoredDescription(input: {
  html: string | null;
  text: string | null;
}): { html: string | null; text: string | null } {
  const html = input.html ? restoreGluedSentencesInHtml(input.html) : null;
  const text = input.text
    ? restoreGluedSentencesInText(input.text)
    : htmlToPlainText(html);
  return { html, text };
}
