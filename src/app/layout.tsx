import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MyNextJob — Your next opportunity starts here.',
    template: '%s · MyNextJob',
  },
  description:
    'MyNextJob discovers fresh, relevant jobs from across the web, matches them to your resume, and tells you the moment your next opportunity appears.',
  applicationName: 'MyNextJob',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MyNextJob',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#059669',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-background text-foreground font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-clay-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-clay-raised"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
