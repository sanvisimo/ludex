import { authClient } from '@repo/auth/client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { CardHeaderRow } from '@/components/card-header-row';
import { useAuthErrorMessage } from '@/lib/auth-error';
import { describeUserAgent } from '@/lib/user-agent';
import { useSession } from '@/src/use-session';

// Chiave a mano: queste non sono procedure oRPC, ma le chiamate di Better Auth.
const SESSIONS_KEY = ['auth', 'sessions'] as const;

/**
 * I dispositivi su cui sei collegato, e il modo di buttarne fuori uno.
 *
 * Serve a chi ha lasciato un browser aperto altrove, o a chi sospetta che la
 * password sia in giro. L'ora mostrata è quella dell'**accesso**, non
 * dell'ultima attività: Better Auth aggiorna la sessione al più una volta al
 * giorno, e un «attivo 5 minuti fa» sarebbe spesso falso.
 */
export function ActiveSessions() {
  const t = useTranslations('account.sessions');
  const authErrorMessage = useAuthErrorMessage();
  const format = useFormatter();
  // Il riferimento di «X fa» avanza da sé: la pagina può restare aperta.
  const now = useNow({ updateInterval: 60_000 });
  const queryClient = useQueryClient();
  const { data: current } = useSession();

  const sessions = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw error;
      // Le più recenti per prime.
      return [...data].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });

  const revoke = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await authClient.revokeSession({ token });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('revoked'));
    },
    onError: (error) =>
      toast.error(
        authErrorMessage(error as { code?: string }, t('revokeFailed')),
      ),
  });

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('revokedOthers'));
    },
    onError: (error) =>
      toast.error(
        authErrorMessage(error as { code?: string }, t('revokeFailed')),
      ),
  });

  const rows = sessions.data ?? [];
  const busy = revoke.isPending || revokeOthers.isPending;
  const hasOthers = rows.some((row) => row.id !== current?.session.id);

  return (
    <Card>
      <CardHeaderRow
        title={t('title')}
        description={t('description')}
        // Agisce su tutto l'elenco, non su una riga: sta in testa, e la riga
        // di questo dispositivo resta senza bottoni.
        action={
          hasOthers ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => revokeOthers.mutate()}
            >
              {t('revokeOthers')}
            </Button>
          ) : undefined
        }
      />
      <CardContent gap={12}>
        {sessions.isPending ? (
          <Skeleton height={56} width="100%" rounded={8} />
        ) : sessions.error ? (
          <Text fontSize={14} color="$red11">
            {t('loadFailed')}
          </Text>
        ) : (
          <YStack gap={8}>
            {rows.map((row) => {
              const { browser, os } = describeUserAgent(row.userAgent);
              const device =
                [browser, os].filter(Boolean).join(' · ') || t('unknownDevice');
              const isCurrent = row.id === current?.session.id;

              return (
                <XStack
                  key={row.id}
                  items="center"
                  justify="space-between"
                  gap={12}
                  flexWrap="wrap"
                  px={12}
                  py={8}
                  rounded={8}
                  borderWidth={1}
                  borderColor="$borderColor"
                >
                  <YStack gap={2} shrink={1}>
                    <XStack items="center" gap={8} flexWrap="wrap">
                      <Text fontWeight="500" color="$color12">
                        {device}
                      </Text>
                      {isCurrent && (
                        <Badge variant="success">{t('thisDevice')}</Badge>
                      )}
                    </XStack>
                    <Text fontSize={13} lineHeight={18} color="$color11">
                      {t('signedIn', {
                        // Mai nel futuro: `now` si ferma al montaggio, e una
                        // sessione aperta dopo risulterebbe «tra 5 secondi».
                        when: format.relativeTime(
                          new Date(
                            Math.min(new Date(row.createdAt).getTime(), +now),
                          ),
                          now,
                        ),
                      })}
                    </Text>
                  </YStack>
                  {/* Quella in uso non si butta fuori da qui: per quello c'è
                      «Esci» nel menu dell'avatar. */}
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => revoke.mutate(row.token)}
                    >
                      {t('revoke')}
                    </Button>
                  )}
                </XStack>
              );
            })}
          </YStack>
        )}
      </CardContent>
    </Card>
  );
}
