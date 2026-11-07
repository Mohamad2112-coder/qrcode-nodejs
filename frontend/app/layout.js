import './globals.css';
import { Inter } from 'next/font/google';
import LocaleHandler from './LocaleHandler';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata = {
  title: 'QR Order Pager',
  description: 'QR-based customer order notification & mobile pager SaaS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}>
        <LocaleHandler />
        {children}
      </body>
    </html>
  );
}
