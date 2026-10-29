import { Skeleton, XStack, YStack } from '@repo/ui';
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import { AccountNav } from '@/components/account-nav';
import { SupportCard } from '@/components/support-card';
import { Page } from '@/src/components/page';
import { useSession } from '@/src/use-session';

export const Route = createFileRoute('/_app/account')({
  component: AccountLayout,
});

/**
 * La cornice dell'account: il titolo, il menu delle sezioni e, accanto, la
 * sezione aperta. Ogni sezione è una rotta (`/account/profile`, `libraries`,
 * `needs-attention`, `hidden`), così l'indirizzo dice dove sei e «indietro»
 * torna alla sezione di prima.
 */
function AccountLayout() {
  const t = useTranslations('account');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { data: session, isPending: sessionPending } = useSession();

  // La pagina non ha senso da anonimo: parla dell'account di chi la guarda.
  // `next` riporta alla sezione da cui si veniva, come fa `_app._private`.
  // Solo finché si è qui: dopo il rimbalzo `pathname` è già `/login`, e
  // l'effetto, ripartito prima che il layout si smonti, lo scriveva in `next`.
  useEffect(() => {
    if (!sessionPending && !session && pathname.startsWith('/account'))
      void navigate({
        to: '/login',
        search: { next: pathname },
        replace: true,
      });
  }, [sessionPending, session, navigate, pathname]);

  if (sessionPending || !session) {
    return (
      <Page>
        <Skeleton height={128} width="100%" rounded={12} />
      </Page>
    );
  }

  return (
    // Più larga delle altre pagine: il menu prende 200 px e la sezione ne
    // vuole almeno quanto ne aveva prima.
    <Page title={t('title')} maxW={1080}>
      <XStack
        gap={24}
        items="flex-start"
        $max-md={{ flexDirection: 'column', items: 'stretch' }}
      >
        {/* Il menu e, solo da `$md`, la scheda delle donazioni sotto: sul
            telefono il footer, con la stessa voce, è subito sotto. */}
        <YStack width={200} shrink={0} gap={24} $max-md={{ width: '100%' }}>
          <AccountNav />
          <YStack $max-md={{ display: 'none' }}>
            <SupportCard compact />
          </YStack>
        </YStack>
        {/* `flex={1}` in una fila che sotto `$md` diventa colonna ha base 0 e
            altezza zero: lì ci va `flexBasis: 'auto'`. `minW={0}` perché una
            sezione larga non spinga fuori il menu. */}
        <YStack flex={1} minW={0} gap={24} $max-md={{ flexBasis: 'auto' }}>
          <Outlet />
        </YStack>
      </XStack>
    </Page>
  );
}
