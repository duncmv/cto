import type { Metadata } from 'next';
import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Uganda Map – MapLibre + Next.js',
  description: 'A Next.js scaffold with MapLibre GL JS centered on Uganda',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Apply saved or preferred theme before paint to avoid FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
        <header className="site-header">
          <div className="container">
            <h1 className="site-title">Uganda Map</h1>
            <nav className="site-nav">
              <a
                href="https://maplibre.org/"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                MapLibre
              </a>
              <a
                href="https://nextjs.org/"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Next.js
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
