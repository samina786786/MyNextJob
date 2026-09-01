import { resolveAssetUrl, UnsafeOutboundUrlError } from '@/lib/companies/assets/ssrf';

export type IconKind = 'apple-touch-icon' | 'icon' | 'manifest' | 'favicon';

export type IconCandidate = {
  href: string;
  kind: IconKind;
  sizes: string | null;
  type: string | null;
  score: number;
};

const SVG_TYPE = /svg/i;
const SKIP_REL = /mask-icon|alternate/i;

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z:_][-a-zA-Z0-9:._]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(re)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

export function parsePixelSize(sizes: string | null | undefined): number {
  if (!sizes) return 0;
  let max = 0;
  for (const token of sizes.split(/\s+/)) {
    const pair = /^(\d+)x(\d+)$/i.exec(token);
    if (!pair) continue;
    max = Math.max(max, Number(pair[1]), Number(pair[2]));
  }
  return max;
}

function typeLooksSvg(type: string | null, href: string): boolean {
  if (type && SVG_TYPE.test(type)) return true;
  return /\.svg($|\?)/i.test(href);
}

const KIND_RANK: Record<IconKind, number> = {
  'apple-touch-icon': 4,
  icon: 3,
  manifest: 2,
  favicon: 1,
};

function scoreCandidate(input: {
  kind: IconKind;
  sizes: string | null;
  type: string | null;
  href: string;
}): number {
  if (typeLooksSvg(input.type, input.href)) return -1;
  const px = parsePixelSize(input.sizes);
  return KIND_RANK[input.kind] * 10_000 + px;
}

function kindFromRel(rel: string): IconKind | null {
  const tokens = rel.toLowerCase().split(/\s+/);
  if (tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed')) {
    return 'apple-touch-icon';
  }
  if (tokens.includes('manifest')) return 'manifest';
  if (tokens.includes('icon') || tokens.includes('shortcut')) return 'icon';
  return null;
}

export function discoverIconCandidates(html: string, pageUrl: URL): IconCandidate[] {
  const found = new Map<string, IconCandidate>();
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = parseAttrs(tag);
    const rel = attrs.rel?.trim() ?? '';
    if (!rel || SKIP_REL.test(rel)) continue;
    const kind = kindFromRel(rel);
    if (!kind || kind === 'manifest') continue;
    if (!attrs.href) continue;
    try {
      const href = resolveAssetUrl(attrs.href, pageUrl).toString();
      const candidate: IconCandidate = {
        href,
        kind,
        sizes: attrs.sizes ?? null,
        type: attrs.type ?? null,
        score: scoreCandidate({ kind, sizes: attrs.sizes ?? null, type: attrs.type ?? null, href }),
      };
      if (candidate.score < 0) continue;
      const prev = found.get(href);
      if (!prev || candidate.score > prev.score) found.set(href, candidate);
    } catch {
      /* skip unsafe or non-https */
    }
  }

  const favicon = new URL('/favicon.ico', pageUrl).toString();
  try {
    const safe = resolveAssetUrl(favicon, pageUrl).toString();
    if (!found.has(safe)) {
      found.set(safe, {
        href: safe,
        kind: 'favicon',
        sizes: null,
        type: 'image/x-icon',
        score: 50,
      });
    }
  } catch {
    /* homepage origin was not https — should not happen */
  }

  return [...found.values()]
    .filter((row) => row.kind !== 'manifest')
    .sort((a, b) => b.score - a.score || a.href.localeCompare(b.href));
}

export function discoverManifestHref(html: string, pageUrl: URL): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = parseAttrs(tag);
    const rel = attrs.rel?.toLowerCase() ?? '';
    if (!rel.split(/\s+/).includes('manifest') || !attrs.href) continue;
    try {
      return resolveAssetUrl(attrs.href, pageUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function candidatesFromManifestJson(raw: string, manifestUrl: URL): IconCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new UnsafeOutboundUrlError('malformed web manifest');
  }
  if (!parsed || typeof parsed !== 'object' || !('icons' in parsed)) return [];
  const icons = (parsed as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return [];
  const found: IconCandidate[] = [];
  for (const icon of icons) {
    if (!icon || typeof icon !== 'object') continue;
    const src = 'src' in icon && typeof icon.src === 'string' ? icon.src : null;
    if (!src) continue;
    const sizes = 'sizes' in icon && typeof icon.sizes === 'string' ? icon.sizes : null;
    const type = 'type' in icon && typeof icon.type === 'string' ? icon.type : null;
    try {
      const href = resolveAssetUrl(src, manifestUrl).toString();
      const score = scoreCandidate({ kind: 'manifest', sizes, type, href });
      if (score < 0) continue;
      found.push({ href, kind: 'manifest', sizes, type, score });
    } catch {
      /* skip */
    }
  }
  return found.sort((a, b) => b.score - a.score);
}

export function mergeIconCandidates(...groups: IconCandidate[][]): IconCandidate[] {
  const found = new Map<string, IconCandidate>();
  for (const group of groups) {
    for (const candidate of group) {
      const prev = found.get(candidate.href);
      if (!prev || candidate.score > prev.score) found.set(candidate.href, candidate);
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score || a.href.localeCompare(b.href));
}
