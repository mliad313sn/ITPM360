import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ITPM360',
  description: 'Multi-country, multi-branch IT project management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
