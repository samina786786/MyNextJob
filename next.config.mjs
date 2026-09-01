/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Shared catalog data uses `"use cache"` + `cacheLife('jobsFresh')`.
   * Authenticated pages stay request-specific (cookies / getClaims).
   */
  cacheComponents: true,
  cacheLife: {
    jobsFresh: {
      stale: 60,
      revalidate: 60,
      expire: 600,
    },
  },
  serverExternalPackages: ['unpdf', 'mammoth', 'sanitize-html'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'logo.clearbit.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
