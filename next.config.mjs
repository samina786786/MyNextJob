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

function supabaseCompanyAssetPattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname.includes('*')) return null;
    return {
      protocol: 'https',
      hostname: url.hostname,
      pathname: '/storage/v1/object/public/company-assets/**',
    };
  } catch {
    return null;
  }
}

const companyAssetPattern = supabaseCompanyAssetPattern();

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
  serverExternalPackages: ['unpdf', 'mammoth', 'sanitize-html', 'sharp'],
  images: {
    remotePatterns: companyAssetPattern ? [companyAssetPattern] : [],
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
