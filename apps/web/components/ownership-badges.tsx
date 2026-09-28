import type {
  Medium,
  OwnershipAccount,
  Store,
  Subscription,
} from '@repo/contracts';
import { storeAccountName } from '@repo/contracts';
import { Badge, XStack } from '@repo/ui';
import { X } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

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
  /**
   * Da quale abbonamento viene la copia, se non è un acquisto.
   *
   * Sta a schermo perché è una cosa che cambia il senso del possesso: «ce l'hai
   * finché paghi» non è la stessa frase di «è tuo», e su PSN riguarda la
   * maggioranza della libreria.
   */
  subscription?: Subscription | null;
  /**
   * Disco o digitale. A schermo va solo il fisico: il digitale è il caso
   * normale, e scriverlo su ogni badge sarebbe rumore.
   *
   * Non è una decorazione del possesso, è parte di quale copia sia: sulla stessa
   * console il disco e il diritto che l'abbonamento presta sono due righe, e il
   * badge è l'unico posto in cui si vede la differenza.
   */
  medium?: Medium | null;
};

/** Chiave stabile per un possesso, salvato o no: è la stessa del vincolo unique. */
export function ownershipKey(ownership: DisplayedOwnership) {
  return `${ownership.platformSlug}|${ownership.store ?? ''}|${ownership.storeAccount?.id ?? ''}|${ownership.medium ?? ''}`;
}

// Le righe di possesso portano lo slug della piattaforma, non il nome: il nome
// vive nella tabella di riferimento. Lo si risolve qui invece di gonfiare il
// contratto, tanto la lista è in cache e non cambia mai durante la sessione.
//
// `onRemove` è opzionale: senza, i possessi si guardano e basta, ed è il caso
// di ogni lista fuori dalla modifica. Con, c'è la x — e cosa faccia lo decide
// chi la passa: sulle aggiunte in sospeso le toglie dalla coda, sui possessi
// salvati chiama la rimozione vera, che lascia un rifiuto perché il prossimo
// import non la rimetta.
export function OwnershipBadges({
  ownerships,
  onRemove,
}: {
  ownerships: DisplayedOwnership[];
  onRemove?: (ownership: DisplayedOwnership) => void;
}) {
  const t = useTranslations('editEntry');
  const tSubscription = useTranslations('subscription');
  const tMedium = useTranslations('medium');
  const storeLabels = useStoreLabels();
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  return (
    <XStack flexWrap="wrap" gap={4}>
      {ownerships.map((ownership) => {
        const account =
          ownership.store && ownership.storeAccount
            ? storeAccountName(ownership.storeAccount)
            : null;

        const label =
          (nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug) +
          (ownership.store ? ` · ${storeLabels[ownership.store]}` : '') +
          (account ? ` (${account})` : '') +
          (ownership.subscription
            ? ` · ${tSubscription(ownership.subscription)}`
            : '') +
          (ownership.medium === 'physical' ? ` · ${tMedium('physical')}` : '');

        return (
          <Badge
            // L'id quando c'è, la chiave del vincolo quando no: dentro una sola
            // lista non ci sono due possessi con la stessa piattaforma e store.
            key={ownership.id ?? ownershipKey(ownership)}
            variant="secondary"
            pr={onRemove ? 4 : undefined}
            // Mai più largo di chi lo contiene: su un telefono «PS5 ·
            // PlayStation Store · PS Plus» non ci sta, e senza usciva dalla
            // scheda invece di tagliarsi al suo bordo.
            maxW="100%"
            overflow="hidden"
          >
            {label}
            {onRemove && (
              <XStack
                render="button"
                aria-label={t('removePlatform', { name: label })}
                onPress={() => onRemove(ownership)}
                bg="transparent"
                borderWidth={0}
                p={0}
                cursor="pointer"
                opacity={0.5}
                hoverStyle={{ opacity: 1 }}
                focusVisibleStyle={{
                  opacity: 1,
                  outlineColor: '$outlineColor',
                  outlineStyle: 'solid',
                  outlineWidth: 2,
                }}
              >
                <X size={12} color="$color12" />
              </XStack>
            )}
          </Badge>
        );
      })}
    </XStack>
  );
}
