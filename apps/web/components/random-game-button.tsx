import { Button, toast } from '@repo/ui';
import { Dices } from '@repo/ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { client } from '@/lib/orpc';

/**
 * «Gioco a caso» (step 15c): un gioco fra quelli «da giocare», e si apre la sua
 * scheda. Risponde a «cosa gioco adesso» senza ragionare: la scelta la fa il
 * server, che pesca fra i giochi con stato `backlog` e non nascosti, **senza
 * guardare i filtri della pagina**.
 *
 * Un backlog senza giochi da giocare non è un errore: lo dice un avviso, e non
 * si naviga da nessuna parte.
 */
export function RandomGameButton() {
  const t = useTranslations('backlog');
  const router = useRouter();
  const errorMessage = useApiErrorMessage();

  const pick = useMutation({
    mutationFn: () => client.backlog.random(),
    onSuccess: (game) => {
      if (!game) {
        toast(t('randomEmpty'));
        return;
      }
      void router.navigate({ to: '/games/$slug', params: { slug: game.slug } });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('randomFailed') })),
  });

  return (
    <Button
      variant="outline"
      disabled={pick.isPending}
      onClick={() => pick.mutate()}
    >
      <Dices size={16} color="$color12" />
      {t('random')}
    </Button>
  );
}
