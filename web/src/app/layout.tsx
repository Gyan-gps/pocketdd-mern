import type { Metadata } from 'next';
import './globals.css';

// config/backpack/ui.php: project_name 'Pocket DD'; pages are titled "<page> :: Pocket DD".
export const metadata: Metadata = {
  title: { default: 'Pocket DD', template: '%s :: Pocket DD' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Line Awesome — the icon font Backpack's menu, buttons and columns use (la la-*). */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/line-awesome/1.3.0/line-awesome/css/line-awesome.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
