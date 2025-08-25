'use client';

import { PrivyProvider } from '@privy-io/react-auth';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#7c3aed',
        },
        // Buat embedded wallet otomatis
        embeddedWallets: { createOnLogin: 'users-without-wallets' },
        // Aktifkan Cross-App Accounts (MGID)
        crossAppAccounts: { appId: process.env.NEXT_PUBLIC_PROVIDER_APP_ID! },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
