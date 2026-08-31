/**
 * Safe RSS/XML plain-text character references. This is not an HTML
 * parser and must not expand DTD / external entities.
 *
 * Named: &amp; &lt; &gt; &quot; &apos;
 * Numeric: &#…; and &#x…; only when the code point is an XML 1.0 Char.
 * Unknown named entities are left unchanged.
 */

const XML_NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

function isSafeXmlCodePoint(code: number): boolean {
  if (!Number.isInteger(code) || code < 0) return false;
  if (code === 0x9 || code === 0xa || code === 0xd) return true;
  if (code < 0x20) return false;
  if (code <= 0xd7ff) return true;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  if (code <= 0xfffd) return true;
  return code >= 0x10000 && code <= 0x10ffff;
}

function decodeNumericRef(ref: string): string | null {
  const hex = ref.startsWith('#x') || ref.startsWith('#X');
  const code = hex ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
  if (!Number.isFinite(code) || !isSafeXmlCodePoint(code)) return null;
  return String.fromCodePoint(code);
}

export function decodeSafeXmlText(value: string): string {
  return value.replace(ENTITY_RE, (entity, ref: string) => {
    if (ref.startsWith('#')) {
      return decodeNumericRef(ref) ?? entity;
    }
    return XML_NAMED[ref.toLowerCase()] ?? entity;
  });
}
