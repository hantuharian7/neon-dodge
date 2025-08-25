import './globals.css';
import Providers from './providers/privy-provider';

export const metadata = {
  title: 'Neon Dodge',
  description: 'Collect orbs, dodge hazards, survive the grid.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="nd-root">
        {/* Cosmic background layers */}
        <div className="bg-layers">
          <i className="stars stars--slow" />
          <i className="stars stars--fast" />
          <i className="ring" />
          <i className="scanlines" />
        </div>

        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
