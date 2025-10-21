import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Uganda Map – MapLibre + Next.js',
  description: 'A Next.js scaffold with MapLibre GL JS centered on Uganda',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
            </nav>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
