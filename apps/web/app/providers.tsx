'use client';

import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { Providers as Shared } from '@/components/providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Shared>
      {/* nuqs tiene lo stato dei filtri (step 7) nella query string.
          L'adapter è ciò che lo lega al router di Next: senza, gli hook non
          sanno come scrivere nell'URL. Sta qui e non nel layout perché quello
          è un componente server. Esce col passo 4 del 12b. */}
      <NuqsAdapter>{children}</NuqsAdapter>
    </Shared>
  );
}
