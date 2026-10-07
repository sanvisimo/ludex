import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { Copy } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/** L'indirizzo che si manda: la pagina pubblica, sullo stesso sito di chi lo crea. */
const linkOf = (token: string) =>
  `${window.location.origin}/condivisa/${token}`;

/**
 * Il corpo del dialogo «Condividi» (step 15d): crea il link, lo mostra e lo
 * toglie. Chiunque abbia il link vede i giochi della playlist, anche senza
 * account; il dialogo lo dice *prima* di crearlo, con le parole di ciò che esce.
 *
 * Il link sta in uno stato locale e non nel `shareToken` della playlist: il
 * modulo si rimonta a ogni apertura, e dopo «Crea» o «Smetti» non si aspetta che
 * l'elenco si rilegga per mostrare il risultato.
 */
export function ShareForm({
  playlist,
  onDone,
}: {
  playlist: { id: string; name: string; shareToken: string | null };
  onDone: () => void;
}) {
  const t = useTranslations('playlists.shareDialog');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [token, setToken] = useState(playlist.shareToken);

  // La pagina pubblica e gli indicatori «condivisa» leggono dall'elenco.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.playlists.key() });

  const share = useMutation({
    mutationFn: () => client.playlists.share({ id: playlist.id }),
    onSuccess: async (result) => {
      setToken(result.token);
      await refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const unshare = useMutation({
    mutationFn: () => client.playlists.unshare({ id: playlist.id }),
    onSuccess: async () => {
      setToken(null);
      await refresh();
      toast.success(t('stopped'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('copied'));
    } catch {
      // Niente appunti (pagina non sicura, permesso negato): il link resta nel
      // campo, selezionato, da copiare a mano.
      toast.error(t('copyFailed'));
    }
  }

  return (
    <YStack gap={16}>
      <DialogHeader>
        <DialogTitle>{t('title', { name: playlist.name })}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>

      {token === null ? (
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('notShared')}
        </Text>
      ) : (
        <YStack gap={8}>
          <Label htmlFor={fieldId}>{t('linkLabel')}</Label>
          <XStack gap={8} items="center">
            <YStack flex={1} minW={0}>
              <Input
                id={fieldId}
                readOnly
                value={linkOf(token)}
                width="100%"
                onFocus={(event) => event.currentTarget.select()}
              />
            </YStack>
            <Button variant="outline" onClick={() => void copy(linkOf(token))}>
              <Copy size={16} color="$color12" />
              {t('copy')}
            </Button>
          </XStack>
          <Text fontSize={13} lineHeight={18} color="$color11">
            {t('stopHint')}
          </Text>
        </YStack>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t('close')}
        </Button>
        {token === null ? (
          <Button onClick={() => share.mutate()} disabled={share.isPending}>
            {t('create')}
          </Button>
        ) : (
          <Button
            variant="destructive"
            onClick={() => unshare.mutate()}
            disabled={unshare.isPending}
          >
            {t('stop')}
          </Button>
        )}
      </DialogFooter>
    </YStack>
  );
}
