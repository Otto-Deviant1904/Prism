import './globals.css';
import Providers from './providers';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'VogueVault',
  description: 'Beauty and skincare price comparison'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
