import type { StoreAccount } from '@repo/contracts';
import { storeAccountName } from '@repo/contracts';
import { Button, Spinner, Text, View, XStack } from '@repo/ui';
import { CircleCheck, Clock, RefreshCw } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { nextSyncBatch, syncBatchProgress } from '@/lib/sync-batch';

type Phase = 'done' | 'running' | 'queued';

/**
 * Il colore e l'icona di ogni stato: verde riuscito, blu informazione, ambra
 * da aspettare. Il significato non sta solo nel colore: l'icona cambia, e ha
 * il suo nome per chi non la vede.
 */
function PhaseIcon({ phase, label }: { phase: Phase; label: string }) {
  return (
    <View role="img" aria-label={label}>
      {phase === 'done' ? (
        <CircleCheck size={14} color="$green11" />
      ) : phase === 'running' ? (
        <Spinner>
          <RefreshCw size={14} color="$blue11" />
        </Spinner>
      ) : (
        <Clock size={14} color="$amber11" />
      )}
    </View>
  );
}

/**
 * «Aggiorno le librerie · 1 di 3», nel sottotitolo di `/backlog`
 * (`plans/sync-all-apertura.md`).
 *
 * Compare quando un account importa, chiunque l'abbia fatto partire —
 * l'apertura dell'app, il sync a mano, la spazzata — e sparisce quando hanno
 * finito tutti. Gli account li rilegge `useLiveUpdates` a ogni inizio e fine,
 * e i giochi nuovi arrivano da lì: questo pezzo li racconta e basta.
 *
 * Al clic o al tocco, sotto, le librerie del giro, ognuna con l'icona del suo
 * stato. Niente suggerimento al passaggio del mouse: sul telefono il tocco
 * apriva tutti e due.
 */
export function LibrarySyncSignal() {
  const t = useTranslations('backlog.librarySync');
  const storeLabels = useStoreLabels();
  const accounts = useQuery(api.accounts.list.queryOptions());
  const [batch, setBatch] = useState<string[]>([]);
  const [explained, setExplained] = useState(false);

  const rows = accounts.data ?? [];
  const syncingKey = rows
    .filter((row) => row.syncing)
    .map((row) => row.id)
    .join(',');

  useEffect(() => {
    const syncing = syncingKey ? syncingKey.split(',') : [];
    setBatch((previous) => nextSyncBatch(previous, syncing));
    if (syncing.length === 0) setExplained(false);
  }, [syncingKey]);

  if (batch.length === 0) return null;

  const syncing = syncingKey ? syncingKey.split(',') : [];
  const { done, total } = syncBatchProgress(batch, syncing);

  const inBatch = batch
    .map((id) => rows.find((row) => row.id === id))
    .filter((row) => row !== undefined);
  const nameOf = (row: StoreAccount) =>
    // Il nome dell'account solo dove serve: due account Amazon.
    inBatch.some((other) => other.id !== row.id && other.store === row.store)
      ? `${storeLabels[row.store]} · ${storeAccountName(row)}`
      : storeLabels[row.store];
  const phaseOf = (row: StoreAccount): Phase =>
    !row.syncing ? 'done' : row.syncPhase === 'running' ? 'running' : 'queued';

  return (
    <>
      {' · '}
      <Button
        variant="ghost"
        size="sm"
        height={20}
        px={4}
        // In riga col numero dei giochi: un bottone di Tamagui è un blocco,
        // e da solo andrebbe a capo anche con lo spazio accanto.
        display="inline-flex"
        verticalAlign="bottom"
        aria-expanded={explained}
        onClick={() => setExplained((value) => !value)}
      >
        <Spinner>
          <RefreshCw size={14} color="$blue11" />
        </Spinner>
        <Text fontSize={14} lineHeight={20} color="$color11">
          {t('label', { done, total })}
        </Text>
      </Button>
      {explained && (
        // Sotto la riga, una libreria per voce: con nove account una frase
        // con le virgole non si leggeva.
        <XStack render="ul" flexWrap="wrap" columnGap={12} rowGap={4} mt={6}>
          {inBatch.map((row) => {
            const phase = phaseOf(row);
            return (
              <XStack render="li" key={row.id} items="center" gap={4}>
                <PhaseIcon phase={phase} label={t(phase)} />
                <Text fontSize={14} lineHeight={20} color="$color11">
                  {nameOf(row)}
                </Text>
              </XStack>
            );
          })}
        </XStack>
      )}
    </>
  );
}
