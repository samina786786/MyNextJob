import { describe, expect, it } from 'vitest';

import {
  candidatesFromManifestJson,
  discoverIconCandidates,
  discoverManifestHref,
  mergeIconCandidates,
} from '@/lib/companies/assets/discover';

const PAGE = new URL('https://example.com/jobs');

describe('icon discovery', () => {
  it('ranks apple-touch-icon above rel=icon, then favicon.ico', () => {
    const ranked = discoverIconCandidates(
      `
        <link rel="icon" sizes="32x32" href="/favicon-32.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        <link rel="shortcut icon" href="/legacy.ico">
      `,
      PAGE,
    );
    expect(ranked.map((row) => row.kind)).toEqual(['apple-touch-icon', 'icon', 'icon', 'favicon']);
    expect(ranked[0]?.href).toBe('https://example.com/apple-touch-icon.png');
  });

  it('discovers a web manifest href separately from image candidates', () => {
    const html = '<link rel="manifest" href="/site.webmanifest">';
    expect(discoverManifestHref(html, PAGE)).toBe('https://example.com/site.webmanifest');
    expect(discoverIconCandidates(html, PAGE).every((row) => row.kind !== 'manifest')).toBe(true);
  });

  it('reads manifest icons and skips SVG', () => {
    const fromManifest = candidatesFromManifestJson(
      JSON.stringify({
        icons: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
        ],
      }),
      new URL('https://example.com/site.webmanifest'),
    );
    expect(fromManifest).toHaveLength(1);
    expect(fromManifest[0]?.href).toBe('https://example.com/icons/192.png');
    expect(fromManifest[0]?.kind).toBe('manifest');
  });

  it('resolves relative, absolute, and protocol-relative hrefs', () => {
    const ranked = discoverIconCandidates(
      `
        <link rel="icon" href="assets/icon.png">
        <link rel="apple-touch-icon" href="https://cdn.example.com/apple.png">
        <link rel="icon" sizes="48x48" href="//static.example.com/icon-48.png">
      `,
      PAGE,
    );
    const hrefs = ranked.map((row) => row.href);
    expect(hrefs).toContain('https://example.com/assets/icon.png');
    expect(hrefs).toContain('https://cdn.example.com/apple.png');
    expect(hrefs).toContain('https://static.example.com/icon-48.png');
  });

  it('skips invalid schemes and still falls back to favicon.ico', () => {
    const ranked = discoverIconCandidates(
      '<link rel="icon" href="javascript:alert(1)"><link rel="icon" href="data:image/png,abc">',
      PAGE,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ kind: 'favicon', href: 'https://example.com/favicon.ico' });
  });

  it('tolerates malformed HTML by using the favicon fallback', () => {
    const ranked = discoverIconCandidates('<link rel="icon" href="/broken', PAGE);
    expect(ranked.some((row) => row.kind === 'favicon')).toBe(true);
  });

  it('returns only favicon.ico when no icons are present', () => {
    const ranked = discoverIconCandidates('<html><head></head></html>', PAGE);
    expect(ranked).toEqual([
      expect.objectContaining({ kind: 'favicon', href: 'https://example.com/favicon.ico' }),
    ]);
  });

  it('merges candidates deterministically by score then href', () => {
    const merged = mergeIconCandidates(
      discoverIconCandidates('<link rel="icon" sizes="32x32" href="/a.png">', PAGE),
      candidatesFromManifestJson(
        JSON.stringify({ icons: [{ src: '/b.png', sizes: '192x192', type: 'image/png' }] }),
        PAGE,
      ),
    );
    expect(merged[0]?.kind).toBe('icon');
    expect(merged.map((row) => row.href)).toEqual([...merged].map((row) => row.href));
  });
});
