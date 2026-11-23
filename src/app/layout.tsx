import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'KRUZBERG CRM — Booking Pipeline',
  description: 'Professional booking CRM for KRUZBERG band management',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'KRUZBERG', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
  ],
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the remembered theme before first paint (no light/dark flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=(JSON.parse(localStorage.getItem('kruzberg-app')||'{}').state||{}).theme||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.add(t)}catch(e){document.documentElement.classList.add('dark')}`,
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
