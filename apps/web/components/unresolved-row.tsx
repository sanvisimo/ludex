import type { UnresolvedImport } from '@repo/contracts';
import { storeCoverUrl, storePageUrl } from '@repo/contracts';
import { BrandIcon, Text, XStack, YStack } from '@repo/ui';
import { useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { RowFrame } from '@/components/row-frame';
import { useStoreLabels } from '@/lib/labels';
import { STORE_BRAND } from '@/lib/store-brand';

// La copertina verticale, nella proporzione di quelle di GOG, Epic e Steam. Le
// icone quadrate di PSN e Amazon vengono ritagliate (`cover`).
const COVER_WIDTH = 90;
const COVER_HEIGHT = 128;

/**
 * La copertina di una voce d'import, della misura che serve a chi la mostra: 44
 * × 64 nella riga, 90 × 128 nel dialogo che la collega a un gioco, dove sta
 * accanto ai risultati di IGDB e va confrontata con le loro.
 *
 * È quella del negozio, la sola che esiste: la voce non è collegata a IGDB. Dove
 * manca, o non si carica — un gioco ritirato da Steam dà 404 — resta l'icona del
 * negozio in un riquadro, così chi la mostra non cambia altezza e si riconosce
 * lo stesso da dove viene. Un'immagine rotta si ricorda **per voce**: chi cambia
 * voce la rimonta con una `key`.
 */
export function UnresolvedCover({
  entry,
  width,
  height,
}: {
  entry: UnresolvedImport;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const brand = STORE_BRAND[entry.store];
  const cover = storeCoverUrl(entry.store, entry.externalId, entry.imageUrl);

  if (cover && !failed) {
    // Un `<img>` e basta, come `GameCover`: l'immagine arriva da un altro
    // dominio e chi la mostra non ne sa niente di più. `alt` vuoto perché il
    // nome sta scritto accanto.
    return (
      <img
        src={cover}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{
          width,
          height,
          flexShrink: 0,
          objectFit: 'cover',
          borderRadius: 6,
          display: 'block',
        }}
      />
    );
  }

  return (
    <YStack
      width={width}
      height={height}
      shrink={0}
      items="center"
      justify="center"
      rounded={6}
      bg="$color4"
      aria-hidden
    >
      {brand ? (
        <BrandIcon brand={brand} size={Math.round(width * 0.64)} />
      ) : null}
    </YStack>
  );
}

/**
 * Una voce d'import che non è un gioco, in una riga: copertina, nome, da dove
 * viene e quando è comparsa, e i bottoni che le passa chi la usa.
 *
 * **La copertina è quella del negozio**, la sola che esiste: la voce non è
 * collegata a IGDB. Dove manca, o non si carica — un gioco ritirato da Steam dà
 * 404 — resta l'icona del negozio in un riquadro, così la riga non cambia
 * altezza e si riconosce lo stesso da dove viene.
 *
 * **L'icona del negozio accanto al nome è il link alla sua pagina**, come sulla
 * pagina del gioco, dove un link c'è: Steam, GOG e PSN. Su Epic e Amazon il
 * negozio non ha una pagina pubblica per gioco, e l'icona sta ferma.
 *
 * `hiddenAt` serve alle liste dei nascosti: la data che interessa lì è quando
 * l'hai tolta di mezzo, non quando è comparsa.
 */
export function UnresolvedRow({
  entry,
  children,
}: {
  entry: UnresolvedImport;
  /** I bottoni, a destra dei fatti della riga. */
  children: ReactNode;
}) {
  const t = useTranslations('account.unresolved');
  const format = useFormatter();
  const storeLabels = useStoreLabels();
  const brand = STORE_BRAND[entry.store];
  const storeName = storeLabels[entry.store];
  const pageUrl = storePageUrl(entry.store, entry.storePage);

  // Una data e non «3 giorni fa»: il tempo relativo dipende dall'ora di chi lo
  // calcola, e server e browser scriverebbero due testi diversi.
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' });

  const facts = [
    `${storeName} (${entry.storeName})`,
    entry.playtimeMinutes
      ? t('hours', { hours: Math.round(entry.playtimeMinutes / 60) })
      : null,
    entry.hiddenAt
      ? t('hiddenOn', { date: date(entry.hiddenAt) })
      : t('addedOn', { date: date(entry.createdAt) }),
  ].filter(Boolean);

  const icon = brand ? (
    <BrandIcon
      brand={brand}
      size={16}
      // Ferma è decorativa; da link porta il suo nome.
      label={pageUrl ? t('openOn', { store: storeName }) : undefined}
    />
  ) : null;

  return (
    <RowFrame
      cover={
        <UnresolvedCover
          entry={entry}
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
        />
      }
    >
      {/* L'id esterno non si scrive: è nel suggerimento, per chi deve
          riconoscere una voce che si chiama «Live» o «Production». */}
      <Text
        fontWeight="500"
        color="$color12"
        // Gli attributi dell'elemento non sono nei tipi del testo.
        {...({ title: entry.externalId } as object)}
      >
        {entry.name}
      </Text>

      {/* L'icona sta accanto al testo anche quando questo va a capo: su un
          telefono il testo è lungo, e con la riga che va a capo l'icona
          restava sola sopra. */}
      <XStack items="flex-start" gap={8}>
        {pageUrl ? (
          <XStack
            render="a"
            // Come in `NavItem`: gli attributi del link arrivano all'`<a>`, ma
            // i tipi della view non li conoscono.
            {...({
              href: pageUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              title: t('openOn', { store: storeName }),
            } as object)}
            shrink={0}
            mt={1}
            rounded={4}
            cursor="pointer"
            hoverStyle={{ opacity: 0.8 }}
            focusVisibleStyle={{
              outlineColor: '$outlineColor',
              outlineStyle: 'solid',
              outlineWidth: 2,
            }}
          >
            {icon}
          </XStack>
        ) : (
          <XStack shrink={0} mt={1}>
            {icon}
          </XStack>
        )}
        <Text fontSize={13} lineHeight={18} color="$color11" flex={1} minW={0}>
          {facts.join(' · ')}
        </Text>
      </XStack>

      <XStack gap={8} flexWrap="wrap" items="center">
        {children}
      </XStack>
    </RowFrame>
  );
}
