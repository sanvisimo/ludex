'use client';

import type { OwnershipAccount, Store } from '@repo/contracts';
import { storeAccountName } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

// Di un possesso qui servono piattaforma, negozio e — quando serve a
// distinguere — l'account. Né l'id né le ore finiscono a schermo. Tenere il tipo
// su questo minimo permette di mostrare con lo stesso componente sia le righe
// salvate sia quelle ancora da salvare, che un id non ce l'hanno.
export type DisplayedOwnership = {
  id?: string;
  platformSlug: string;
  store?: Store | null;
  storeAccount?: OwnershipAccount | null;
};

/** Chiave stabile per un possesso, salvato o no: è la stessa del vincolo unique. */
export function ownershipKey(ownership: DisplayedOwnership) {
  return `${ownership.platformSlug}|${ownership.store ?? ''}|${ownership.storeAccount?.id ?? ''}`;
}

// Le righe di possesso portano lo slug della piattaforma, non il nome: il nome
// vive nella tabella di riferimento. Lo si risolve qui invece di gonfiare il
// contratto, tanto la lista è in cache e non cambia mai durante la sessione.
//
// `onRemove` è opzionale ed è ciò che distingue i due usi: senza, i possessi si
// guardano e basta — togliere una piattaforma già salvata non è previsto, perché
// il prossimo import la ricreerebbe. Con, sono le aggiunte ancora in sospeso, che
// si possono disfare finché non si salva.
export function OwnershipBadges({
  ownerships,
  onRemove,
}: {
  ownerships: DisplayedOwnership[];
  onRemove?: (ownership: DisplayedOwnership) => void;
}) {
  const t = useTranslations('editEntry');
  const storeLabels = useStoreLabels();
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  // Il nome dell'account si mostra **solo dove serve a distinguere**: se dello
  // stesso negozio c'è una copia sola, «Amazon» basta e «Amazon (simone)»
  // sarebbe rumore. Con due account lo stesso badge ripetuto non direbbe da
  // quale dei due si lancia, che è l'unica ragione per cui l'account è a
  // schermo.
  const perNegozio = new Map<string, number>();
  for (const ownership of ownerships) {
    if (!ownership.store) continue;
    perNegozio.set(ownership.store, (perNegozio.get(ownership.store) ?? 0) + 1);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {ownerships.map((ownership) => {
        const account =
          ownership.store &&
          (perNegozio.get(ownership.store) ?? 0) > 1 &&
          ownership.storeAccount
            ? storeAccountName(ownership.storeAccount)
            : null;

        const label =
          (nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug) +
          (ownership.store ? ` · ${storeLabels[ownership.store]}` : '') +
          (account ? ` (${account})` : '');

        return (
          <Badge
            // L'id quando c'è, la chiave del vincolo quando no: dentro una sola
            // lista non ci sono due possessi con la stessa piattaforma e store.
            key={ownership.id ?? ownershipKey(ownership)}
            variant="secondary"
            className={onRemove ? 'gap-1 pr-1' : undefined}
          >
            {label}
            {onRemove && (
              <button
                type="button"
                aria-label={t('removePlatform', { name: label })}
                onClick={() => onRemove(ownership)}
                className="opacity-50 hover:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </Badge>
        );
      })}
    </div>
  );
}
