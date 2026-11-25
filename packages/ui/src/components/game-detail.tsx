import { useState, type ReactNode } from 'react';
import { Text, Theme, XStack, YStack, isWeb, useTheme } from 'tamagui';

import { ArrowUpRight, Gamepad2, Star, X } from '../icons';
import { BrandIcon, type Brand } from './brand-icon';

/**
 * I pezzi della pagina del gioco che web e mobile condividono. Prendono dati
 * semplici e testi già tradotti: chi li monta sa cos'è una voce del backlog,
 * loro no.
 *
 * Un link esterno è `href` sul web (un `<a>` vero, che si apre in un'altra
 * scheda) e `onOpen` su React Native, dove non ci sono ancore.
 */
export type ExternalLinkProps = {
  href?: string | null;
  onOpen?: () => void;
  /** Il suggerimento del link sul web, «Apri su …». */
  title?: string;
};

export function DetailPanel({
  children,
  id,
  label,
}: {
  children: ReactNode;
  /** L'ancora sul web, per i link «vai alle copie». */
  id?: string;
  label?: string;
}) {
  return (
    <YStack
      render={label ? 'section' : 'div'}
      id={id}
      aria-label={label}
      tabIndex={id ? -1 : undefined}
      style={id ? { scrollMarginTop: 96 } : undefined}
      gap={12}
      p={16}
      rounded={12}
      borderWidth={1}
      borderColor="border-color"
      bg="color2"
      outlineColor={id ? 'focus-visible:outline-color' : undefined}
      outlineStyle={id ? 'focus-visible:solid' : undefined}
      outlineWidth={id ? 'focus-visible:2px' : undefined}
    >
      {children}
    </YStack>
  );
}

export function DetailPanelTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      render="h2"
      fontFamily="heading"
      fontSize={16}
      lineHeight="22px"
      fontWeight="600"
      color="color12"
      m={0}
    >
      {children}
    </Text>
  );
}

/** Una riga che porta fuori; `tile` ne fa una piastrella con la freccia. */
export function LinkRow({
  href,
  onOpen,
  title,
  children,
  items = 'center',
  tile = false,
}: ExternalLinkProps & {
  children: ReactNode;
  items?: 'center' | 'flex-start';
  tile?: boolean;
}) {
  const linked = isWeb ? !!href : !!onOpen;
  return (
    <XStack
      render={isWeb && href ? 'a' : 'div'}
      {...(isWeb && href
        ? ({
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            title,
            style: { textDecoration: 'none', color: 'inherit' },
          } as object)
        : {})}
      {...(!isWeb && onOpen
        ? { role: 'link' as const, 'aria-label': title, onPress: onOpen }
        : {})}
      items={items}
      gap={tile ? 8 : 10}
      minW={0}
      minH={tile ? 48 : undefined}
      mx={tile || !linked ? 0 : -6}
      px={tile ? 10 : linked ? 6 : 0}
      py={tile ? 10 : linked ? 2 : 0}
      rounded={tile ? 10 : 6}
      bg={`${tile ? 'color3' : 'transparent'}${linked ? ' hover:color4 press:color4' : ''}`}
      borderWidth={tile ? 1 : 0}
      borderColor="border-color"
      cursor={linked ? 'pointer' : undefined}
      outlineColor="focus-visible:outline-color"
      outlineStyle="focus-visible:solid"
      outlineWidth="focus-visible:2px"
    >
      {children}
      {tile && linked && (
        <XStack shrink={0} pt={items === 'flex-start' ? 2 : 0}>
          <ArrowUpRight size={13} color="color11" aria-hidden />
        </XStack>
      )}
    </XStack>
  );
}

export type DurationTile = {
  key: string;
  label: string;
  value: string;
  /** La storia principale: in blu, come il riquadro che conta di più. */
  main?: boolean;
};

/** I tempi di HowLongToBeat in piastrelle, la principale in blu. */
export function DurationTiles({ tiles }: { tiles: DurationTile[] }) {
  return (
    <XStack gap={8} flexWrap="wrap">
      {tiles.map((tile) => (
        <Theme key={tile.key} name={tile.main ? 'blue' : undefined}>
          <YStack
            grow={1}
            minW={96}
            p={10}
            rounded={8}
            bg={tile.main ? 'color3' : 'selectionBackground'}
            borderLeftWidth={3}
            borderColor={tile.main ? 'color9' : 'selectionBorder'}
            gap={4}
          >
            <Text
              fontSize={12}
              lineHeight="16px"
              color={tile.main ? 'color12' : 'color11'}
            >
              {tile.label}
            </Text>
            <Text
              fontSize={22}
              lineHeight="28px"
              fontWeight="600"
              color={tile.main ? 'color12' : 'selectionColor'}
            >
              {tile.value}
            </Text>
          </YStack>
        </Theme>
      ))}
    </XStack>
  );
}

/** Verde da 75, ambra da 50, rosso sotto: il colore dice il voto prima del numero. */
export function CriticScoreBadge({
  score,
  compact = false,
}: {
  score: number;
  compact?: boolean;
}) {
  const value = Math.round(score);
  const tone = value >= 75 ? 'green' : value >= 50 ? 'amber' : 'red';

  return (
    <Theme name={tone}>
      <XStack
        bg="color3"
        borderWidth={1}
        borderColor="color6"
        rounded={compact ? 10 : 14}
        px={compact ? 10 : 14}
        py={compact ? 6 : 10}
        minW={compact ? 72 : 90}
        items="baseline"
        justify="center"
        gap={3}
        shrink={0}
      >
        <Text
          fontFamily="heading"
          fontSize={compact ? 20 : 28}
          lineHeight={compact ? '26px' : '34px'}
          fontWeight="600"
          color="color12"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Text>
        <Text fontSize={11} lineHeight="16px" color="color12">
          /100
        </Text>
      </XStack>
    </Theme>
  );
}

/**
 * Una fonte della critica. Il nome è il link alla sua pagina: OpenCritic lo
 * vuole così, vicino al voto (vedi `apps/api/CLAUDE.md`).
 */
export function CriticScoreRow({
  brand,
  name,
  tier,
  score,
  noScoreLabel,
  ...link
}: ExternalLinkProps & {
  brand: Brand;
  name: string;
  tier?: string | null;
  score: number | null;
  noScoreLabel: string;
}) {
  return (
    <LinkRow {...link}>
      <BrandIcon brand={brand} size={20} />
      <YStack grow={1} shrink={1} minW={0} gap={2}>
        <Text fontSize={14} lineHeight="20px" fontWeight="500" color="color12">
          {name}
        </Text>
        {tier ? (
          <Text fontSize={12} lineHeight="20px" color="color11">
            {tier}
          </Text>
        ) : null}
      </YStack>
      {score !== null ? (
        <CriticScoreBadge score={score} compact />
      ) : (
        <Text fontSize={13} lineHeight="20px" color="color11">
          {noScoreLabel}
        </Text>
      )}
    </LinkRow>
  );
}

/** Una copia posseduta: negozio e piattaforma, poi i dettagli in grigio. */
export function CopyTile({
  brand,
  storeName,
  platformName,
  details,
  played,
  dates,
  ...link
}: ExternalLinkProps & {
  brand?: Brand;
  storeName?: string | null;
  platformName: string;
  /** Account, abbonamento, supporto, già uniti. */
  details?: string;
  /** «242 h giocate». */
  played?: string | null;
  /** Ultima volta e acquisto, già uniti. */
  dates?: string;
}) {
  return (
    <LinkRow {...link} items="flex-start" tile>
      <XStack shrink={0} pt={2}>
        {brand ? (
          <BrandIcon brand={brand} size={24} />
        ) : (
          <Gamepad2 size={24} color="color11" aria-hidden />
        )}
      </XStack>
      <YStack grow={1} shrink={1} minW={0} gap={4}>
        <Text
          fontSize={13}
          lineHeight="18px"
          color="color12"
          style={{ overflowWrap: 'anywhere' }}
        >
          {storeName ? (
            <Text fontWeight="600">
              {storeName}
              {' · '}
            </Text>
          ) : null}
          {platformName}
        </Text>
        {details ? (
          <Text
            fontSize={12}
            lineHeight="18px"
            color="color11"
            style={{ overflowWrap: 'anywhere' }}
          >
            {details}
          </Text>
        ) : null}
        {played ? (
          <Text
            fontSize={12}
            lineHeight="18px"
            fontWeight="600"
            color="color12"
          >
            {played}
          </Text>
        ) : null}
        {dates ? (
          <Text fontSize={12} lineHeight="18px" color="color11">
            {dates}
          </Text>
        ) : null}
      </YStack>
    </LinkRow>
  );
}

const POSITIONS = [1, 2, 3, 4, 5];

export type RatingStarsLabels = {
  /** «Vota 4 su 5», il nome di ciascuna mezza stella. */
  value: (value: number) => string;
  /** «non votato». */
  none: string;
  /** «4 su 5». */
  of: (value: number) => string;
  /** «Togli il voto». */
  clear: string;
};

/**
 * Voto da mezza stella a cinque.
 *
 * Ogni stella è due bersagli: la metà sinistra vale `n - 0.5`, la destra `n`.
 * È il motivo per cui non è uno slider — con dieci valori discreti uno slider
 * costringe a mirare, le stelle no.
 *
 * Ritoccare il valore già scelto lo toglie: "non votato" è uno stato a cui si
 * deve poter tornare, ed è diverso da "votato mezza stella". In `md` c'è anche
 * la × accanto al voto.
 *
 * Due misure: `md` nei moduli, col testo «4 su 5» accanto; `sm` nella fascia
 * della pagina del gioco, dove si vota al volo e c'è solo il numero, a
 * sinistra. Su React Native non c'è il passaggio del mouse, e il riempimento
 * prende il colore del tema: `currentColor` lì non arriva all'SVG.
 */
export function RatingStars({
  value,
  onChange,
  labels,
  size = 'md',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  labels: RatingStarsLabels;
  size?: 'sm' | 'md';
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const shown = hovered ?? value ?? 0;
  const px = size === 'sm' ? 18 : 28;

  // Il numero, nella fascia, sta **a sinistra**: la fascia allinea a destra,
  // e un numero a destra che cambia larghezza spostava le stelle sotto il
  // puntatore — il secondo clic cadeva su un'altra mezza stella.
  const number = size === 'sm' && value !== null && (
    <Text fontSize={14} lineHeight="20px" color="color11" aria-hidden>
      {value}
    </Text>
  );

  return (
    <XStack items="center" gap={size === 'sm' ? 6 : 8}>
      {number}
      <XStack onMouseLeave={() => setHovered(null)}>
        {POSITIONS.map((position) => (
          <XStack key={position} position="relative" width={px} height={px}>
            <Star size={px} color="color8" />

            {/* La stella piena ritagliata: 0%, 50% o 100% di larghezza. Dentro,
                un contenitore largo quanto la stella intera: senza, l'icona si
                stringeva alla larghezza del taglio invece di farsi tagliare. */}
            <XStack
              position="absolute"
              t={0}
              l={0}
              b={0}
              width={`${Math.min(Math.max(shown - position + 1, 0), 1) * 100}%`}
              overflow="hidden"
              pointerEvents="none"
            >
              <XStack width={px} height={px}>
                <FilledStar size={px} />
              </XStack>
            </XStack>

            {[position - 0.5, position].map((candidate) => (
              <XStack
                key={candidate}
                render="button"
                role="button"
                aria-label={labels.value(candidate)}
                aria-pressed={value === candidate}
                onMouseEnter={() => setHovered(candidate)}
                onPress={() => {
                  setHovered(null);
                  onChange(value === candidate ? null : candidate);
                }}
                position="absolute"
                t={0}
                b={0}
                {...(candidate === position ? { r: 0 } : { l: 0 })}
                width="50%"
                bg="transparent"
                borderWidth={0}
                p={0}
                cursor="pointer"
                outlineColor="focus-visible:outline-color"
                outlineStyle="focus-visible:solid"
                outlineWidth="focus-visible:2px"
              />
            ))}
          </XStack>
        ))}
      </XStack>

      {size === 'md' && (
        <Text color="color11">
          {value === null ? labels.none : labels.of(value)}
        </Text>
      )}
      {size === 'md' && value !== null && (
        <XStack
          render="button"
          role="button"
          aria-label={labels.clear}
          onPress={() => onChange(null)}
          bg="transparent"
          borderWidth={0}
          p={0}
          cursor="pointer"
          opacity="0.5 hover:1 focus-visible:1"
          outlineColor="focus-visible:outline-color"
          outlineStyle="focus-visible:solid"
          outlineWidth="focus-visible:2px"
        >
          <X size={16} color="color12" />
        </XStack>
      )}
    </XStack>
  );
}

function FilledStar({ size }: { size: number }) {
  // Su native `currentColor` non arriva al riempimento dell'SVG.
  const accent = useTheme().accent9?.val as string | undefined;
  return (
    <Star size={size} color="accent9" fill={isWeb ? 'currentColor' : accent} />
  );
}
