import { storeAccountName } from '@repo/contracts';
import { Button, Spinner, Text, Tooltip } from '@repo/ui';
import { RefreshCw } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { nextSyncBatch, syncBatchProgress } from '@/lib/sync-batch';

/**
 * «Aggiorno le librerie · 1 di 3», nel sottotitolo di `/backlog`
 * (`plans/sync-all-apertura.md`).
 *
 * Compare quando un account importa, chiunque l'abbia fatto partire —
 * l'apertura dell'app, il sync a mano, la spazzata — e sparisce quando hanno
 * finito tutti. Gli account li rilegge `useLiveUpdates` a ogni inizio e fine,
 * e i giochi nuovi arrivano da lì: questo pezzo li racconta e basta.
 *
 * I negozi del giro stanno nel suggerimento al passaggio del mouse e, al clic
 * o al tocco, nella stessa riga: su un telefono il suggerimento non c'è. È il
 * gesto del «Che cos'è?» dell'aggiornamento automatico.
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
  const label = t('label', { done, total });

  const inBatch = batch
    .map((id) => rows.find((row) => row.id === id))
    .filter((row) => row !== undefined);
  const detail = inBatch
    .map((row) => {
      // Il nome dell'account solo dove serve: due account Amazon.
      const twin = inBatch.some(
        (other) => other.id !== row.id && other.store === row.store,
      );
      const name = twin
        ? `${storeLabels[row.store]} · ${storeAccountName(row)}`
        : storeLabels[row.store];
      return syncing.includes(row.id)
        ? t('running', { name })
        : t('done', { name });
    })
    .join(', ');

  return (
    <>
      {' · '}
      <Tooltip content={detail} placement="bottom">
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
            <RefreshCw size={14} color="$color11" />
          </Spinner>
          <Text fontSize={14} lineHeight={20} color="$color11">
            {label}
          </Text>
        </Button>
      </Tooltip>
      {explained && ` — ${detail}`}
    </>
  );
}
