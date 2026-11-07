/**
 * Il giro di aggiornamento delle librerie che `/backlog` racconta con «1 di 3».
 *
 * Il server dice solo chi sta importando adesso (`syncing`), non chi ha già
 * finito: il giro lo tiene il client. Ci entra ogni account visto in
 * importazione da quando il segnale è comparso, e un account che parte a metà
 * — un sync a mano da un'altra scheda — allunga il totale. Quando nessuno
 * importa più il giro è finito, e il prossimo riparte da zero.
 */
export function nextSyncBatch(previous: string[], syncingIds: string[]) {
  if (syncingIds.length === 0) return [];
  const batch = [...previous];
  for (const id of syncingIds) if (!batch.includes(id)) batch.push(id);
  return batch;
}

/** Quante librerie del giro hanno finito, su quante. */
export function syncBatchProgress(batch: string[], syncingIds: string[]) {
  return {
    done: batch.filter((id) => !syncingIds.includes(id)).length,
    total: batch.length,
  };
}
