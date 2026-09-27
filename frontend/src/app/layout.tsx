import type { Metadata } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: {
    default: 'SmartFlow — Intelligent Content Delivery Platform',
    template: '%s | SmartFlow',
  },
  description:
    'SmartFlow reduces perceived loading time through intelligent caching, prefetching, network-aware delivery, and offline-resilient content access.',
  keywords: ['content delivery', 'caching', 'prefetching', 'low-latency', 'streaming', 'CDN'],
  openGraph: {
    title: 'SmartFlow — Intelligent Content Delivery Platform',
    description: 'Intelligent low-latency content delivery with smart caching and prefetching.',
    type: 'website',
    siteName: 'SmartFlow',
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e1a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="theme-color" content="#0a0e1a" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
