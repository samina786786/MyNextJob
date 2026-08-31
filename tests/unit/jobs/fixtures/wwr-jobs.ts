export const WWR_SOURCE_ID = '77777777-7777-4777-8777-777777777777';

export function wwrItemXml(overrides: {
  title?: string;
  guid?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  region?: string;
  country?: string;
  state?: string;
  skills?: string;
  category?: string;
  type?: string;
  expiresAt?: string;
} = {}): string {
  const title = overrides.title ?? 'Acme: Senior Frontend Engineer';
  const slug = 'acme-senior-frontend-engineer';
  const guid = overrides.guid ?? `https://weworkremotely.com/remote-jobs/${slug}`;
  const link = overrides.link ?? guid;
  return `<item>
      <title>${title}</title>
      <region>${overrides.region ?? 'Anywhere in the World'}</region>
      <country>${overrides.country ?? ''}</country>
      <state>${overrides.state ?? ''}</state>
      <skills>${overrides.skills ?? ''}</skills>
      <category>${overrides.category ?? 'Front-End Programming'}</category>
      <type>${overrides.type ?? 'Full-Time'}</type>
      <description>${overrides.description ?? '&lt;p&gt;Build React applications.&lt;/p&gt;'}</description>
      <pubDate>${overrides.pubDate ?? 'Sun, 30 Aug 2026 10:00:00 +0000'}</pubDate>
      <expires_at>${overrides.expiresAt ?? '2026-09-30'}</expires_at>
      <guid>${guid}</guid>
      <link>${link}</link>
    </item>`;
}

export function wwrRssXml(items: string[], extras: { channel?: boolean; doctype?: boolean } = {}): string {
  const channel = extras.channel === false
    ? items.join('\n')
    : `<channel>
    <title>We Work Remotely: All Jobs</title>
    <link>https://weworkremotely.com/</link>
    ${items.join('\n')}
  </channel>`;
  const doctype = extras.doctype ? '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
${doctype}<rss version="2.0">
  ${channel}
</rss>`;
}

export function mockWwrFetch(xml: string, options: { status?: number; contentType?: string } = {}): typeof fetch {
  return async () =>
    new Response(xml, {
      status: options.status ?? 200,
      headers: { 'content-type': options.contentType ?? 'application/rss+xml; charset=utf-8' },
    });
}
