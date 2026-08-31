import { describe, expect, it } from 'vitest';

import { decodeSafeXmlText } from '@/lib/jobs/normalization/decode-xml-text';

describe('decodeSafeXmlText', () => {
  it('decodes the five XML named character references', () => {
    expect(decodeSafeXmlText('A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;')).toBe(
      'A & B < C > "D" \'E\'',
    );
  });

  it('decodes safe numeric character references', () => {
    expect(decodeSafeXmlText('R&#38;D')).toBe('R&D');
    expect(decodeSafeXmlText('R&#x26;D')).toBe('R&D');
    expect(decodeSafeXmlText('caf&#233;')).toBe('café');
  });

  it('leaves unknown named entities and unsafe numerics unchanged', () => {
    expect(decodeSafeXmlText('&copy; 2026')).toBe('&copy; 2026');
    expect(decodeSafeXmlText('&#0;')).toBe('&#0;');
    expect(decodeSafeXmlText('&#x110000;')).toBe('&#x110000;');
    expect(decodeSafeXmlText('not an entity &amp')).toBe('not an entity &amp');
  });
});
