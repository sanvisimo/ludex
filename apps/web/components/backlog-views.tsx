import type { BacklogEntry, BacklogStatus } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { EllipsisVertical } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { RatingValue } from '@/components/rating-value';
import type { BacklogView } from '@/lib/backlog-filter';
import { useStatusLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

/**
 * Le tre viste del backlog: righe, griglia e compatta.
 *
 * Mostrano i campi che `BacklogEntry` porta già: quali informazioni stanno
 * sulla card, sulla riga e sulla scheda lo decide il 12d, insieme ai dati IGDB
 * che ancora mancano.
 *
 * In tutte e tre lo stato si cambia a vista, perché è il gesto più
 * frequente; modifica, nascondi e rimuovi stanno in un menu.
 */

export type EntryHandlers = {
  onStatus: (entry: BacklogEntry, status: BacklogStatus) => void;
  onEdit: (entry: BacklogEntry) => void;
  onToggleHidden: (entry: BacklogEntry) => void;
  onRemove: (entry: BacklogEntry) => void;
  hidingDisabled?: boolean;
};

export function BacklogEntries({
  view,
  entries,
  ...handlers
}: { view: BacklogView; entries: BacklogEntry[] } & EntryHandlers) {
  if (view === 'grid') return <GridView entries={entries} {...handlers} />;
  if (view === 'compact')
    return <CompactView entries={entries} {...handlers} />;
  return <RowsView entries={entries} {...handlers} />;
}

function StatusSelect({
  entry,
  onStatus,
  width = 176,
}: {
  entry: BacklogEntry;
  onStatus: EntryHandlers['onStatus'];
  width?: number | '100%';
}) {
  const t = useTranslations('backlog');
  const statusLabels = useStatusLabels();
  return (
    <Select
      items={statusLabels}
      value={entry.status}
      onValueChange={(next) => onStatus(entry, next as BacklogStatus)}
    >
      <SelectTrigger
        width={width}
        aria-label={t('statusOf', { name: entry.game.name })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {backlogStatusValues.map((value) => (
          <SelectItem key={value} value={value}>
            {statusLabels[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Modifica, nascondi, rimuovi: dietro un bottone solo, uguale in ogni vista. */
function EntryActions({
  entry,
  onEdit,
  onToggleHidden,
  onRemove,
  hidingDisabled,
}: { entry: BacklogEntry } & Omit<EntryHandlers, 'onStatus'>) {
  const t = useTranslations('backlog');
  const tHidden = useTranslations('hidden');
  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('actionsFor', { name: entry.game.name })}
          >
            <EllipsisVertical size={16} color="$color11" />
          </Button>
        }
      />
      <DropdownMenuContent width={184}>
        <DropdownMenuItem onClick={() => onEdit(entry)}>
          {t('edit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={hidingDisabled}
          onClick={() => onToggleHidden(entry)}
        >
          {entry.hiddenAt === null ? tHidden('hide') : tHidden('unhide')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onRemove(entry)}>
          {t('remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GameLink({
  entry,
  lines,
}: {
  entry: BacklogEntry;
  /** Oltre quante righe il titolo si tronca: la griglia ne ha due. */
  lines?: number;
}) {
  return (
    <Link
      to="/games/$id"
      params={{ id: entry.game.id }}
      // Un blocco e non un link in riga: dentro un `<a>` inline il testo non
      // si tronca, e nella compatta il titolo passava sopra le colonne.
      style={{
        color: 'inherit',
        textDecoration: 'none',
        display: 'block',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Text
        fontSize={14}
        lineHeight={20}
        fontWeight="500"
        color="$color12"
        hoverStyle={{ textDecorationLine: 'underline' }}
        numberOfLines={lines}
      >
        {entry.game.name}
      </Text>
    </Link>
  );
}

/** Anno, durata e voto, in fila: le tre cose che si leggono a colpo d'occhio. */
function Facts({ entry }: { entry: BacklogEntry }) {
  return (
    <XStack flexWrap="wrap" items="center" columnGap={12} rowGap={2}>
      {entry.game.firstReleaseDate && (
        <Text fontSize={14} lineHeight={20} color="$color11">
          {entry.game.firstReleaseDate.getFullYear()}
        </Text>
      )}
      <GameDuration game={entry.game} />
      <RatingValue value={entry.rating} />
    </XStack>
  );
}

/**
 * Le righe: la vista di prima, più bassa. Le azioni in fondo diventano stato
 * e menu, e su una finestra stretta vanno a capo sotto la copertina invece di
 * uscire dallo schermo.
 */
function RowsView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  return (
    <YStack render="ul" gap={8} p={0} m={0}>
      {entries.map((entry) => (
        <YStack render="li" key={entry.id} style={{ listStyle: 'none' }}>
          {/* `py={0}`: la Card ha già il suo respiro verticale, e sommato al
              nostro lasciava una fascia vuota in fondo a ogni riga. */}
          <Card py={0}>
            <XStack p={12} gap={12} items="flex-start">
              <GameCover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                width={64}
              />
              <YStack flex={1} minW={0} gap={8}>
                <XStack
                  flexWrap="wrap"
                  items="flex-start"
                  justify="space-between"
                  gap={8}
                >
                  <YStack gap={4} flex={1} minW={200}>
                    <XStack flexWrap="wrap" items="center" gap={8}>
                      <GameLink entry={entry} />
                      <GameTypeBadge type={entry.game.gameType} />
                    </XStack>
                    <Facts entry={entry} />
                  </YStack>
                  <XStack items="center" gap={4}>
                    <StatusSelect entry={entry} onStatus={handlers.onStatus} />
                    <EntryActions entry={entry} {...handlers} />
                  </XStack>
                </XStack>
                <OwnershipBadges ownerships={entry.ownerships} />
                <EntryTags tags={entry.tags} />
              </YStack>
            </XStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * La griglia: la copertina prima di tutto, sotto titolo, anno e durata, e lo
 * stato. Le colonne le decide lo spazio (`auto-fill`), non una media query:
 * la stessa lista sta accanto al pannello dei filtri o da sola.
 */
function GridView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  return (
    <YStack
      render="ul"
      p={0}
      m={0}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
        gap: 12,
      }}
    >
      {entries.map((entry) => (
        <YStack render="li" key={entry.id} style={{ listStyle: 'none' }}>
          {/* `grow` e non `flex`: `flex: 1` in colonna ha base 0, e da lì
              Chrome calcolava l'altezza della riga della griglia — le schede
              uscivano alte una manciata di pixel, con la copertina tagliata. */}
          <Card py={0} grow={1}>
            <YStack p={8} gap={8} grow={1}>
              <GameCover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                size="cover_big"
                fill
              />
              <YStack gap={2} grow={1}>
                <XStack items="flex-start" gap={4}>
                  <YStack flex={1} minW={0}>
                    <GameLink entry={entry} lines={2} />
                  </YStack>
                  <EntryActions entry={entry} {...handlers} />
                </XStack>
                <GameTypeBadge type={entry.game.gameType} />
                <Facts entry={entry} />
              </YStack>
              <StatusSelect
                entry={entry}
                onStatus={handlers.onStatus}
                width="100%"
              />
            </YStack>
          </Card>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * La compatta: una riga per gioco, a colonne, per scorrere tanta libreria in
 * poco spazio. È una tabella per chi usa un lettore di schermo (`role`), e
 * invece di scorrere di lato perde colonne: le piattaforme sotto `$lg`, il
 * voto sotto `$md`, la durata sotto `$sm`. Le soglie sono quelle della
 * finestra, e la finestra non è la lista: da `$md` il guscio se ne prende 240.
 * Per questo le piattaforme non hanno una larghezza fissa ma dividono col
 * titolo lo spazio che resta, uno a due, e si troncano.
 *
 * Colonne fisse: sceglierle è un di più che nessuno ha chiesto. Il voto della
 * critica non c'è perché `BacklogEntry` non lo porta.
 */
function CompactView({
  entries,
  ...handlers
}: { entries: BacklogEntry[] } & EntryHandlers) {
  const t = useTranslations('backlog');
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });
  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  const header = (label: string) => (
    <Text fontSize={12} fontWeight="500" color="$color11">
      {label}
    </Text>
  );

  return (
    <YStack
      role="table"
      aria-label={t('title')}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
    >
      <XStack
        role="row"
        px={12}
        py={8}
        gap={12}
        items="center"
        bg="$color2"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <XStack role="columnheader" flex={2} minW={0} pl={44}>
          {header(t('columnTitle'))}
        </XStack>
        <XStack
          role="columnheader"
          flex={1}
          minW={0}
          display="none"
          $lg={{ display: 'flex' }}
        >
          {header(t('columnPlatforms'))}
        </XStack>
        <XStack
          role="columnheader"
          width={72}
          display="none"
          $sm={{ display: 'flex' }}
        >
          {header(t('columnDuration'))}
        </XStack>
        <XStack
          role="columnheader"
          width={56}
          display="none"
          $md={{ display: 'flex' }}
        >
          {header(t('columnRating'))}
        </XStack>
        <XStack role="columnheader" width={188}>
          {header(t('columnStatus'))}
        </XStack>
      </XStack>

      {entries.map((entry, index) => {
        const platformNames = [
          ...new Set(
            entry.ownerships.map(
              (o) => nameBySlug.get(o.platformSlug) ?? o.platformSlug,
            ),
          ),
        ].join(', ');
        return (
          <XStack
            role="row"
            key={entry.id}
            px={12}
            py={6}
            gap={12}
            items="center"
            borderTopWidth={index === 0 ? 0 : 1}
            borderColor="$borderColor"
            hoverStyle={{ bg: '$color2' }}
          >
            <XStack role="cell" flex={2} minW={0} gap={12} items="center">
              <GameCover
                imageId={entry.game.coverImageId}
                name={entry.game.name}
                width={32}
              />
              <XStack flex={1} minW={0} items="center" gap={8}>
                <YStack shrink={1} minW={0}>
                  <GameLink entry={entry} lines={1} />
                </YStack>
                {/* Sotto `$sm` il badge non si restringe e il titolo sì:
                    di «Ratchet & Clank» restava solo «Remake». */}
                <XStack display="none" $sm={{ display: 'flex' }}>
                  <GameTypeBadge type={entry.game.gameType} />
                </XStack>
              </XStack>
            </XStack>
            <XStack
              role="cell"
              flex={1}
              minW={0}
              display="none"
              $lg={{ display: 'flex' }}
            >
              <Text fontSize={13} color="$color11" numberOfLines={1}>
                {platformNames}
              </Text>
            </XStack>
            <XStack
              role="cell"
              width={72}
              display="none"
              $sm={{ display: 'flex' }}
            >
              <GameDuration game={entry.game} short />
            </XStack>
            <XStack
              role="cell"
              width={56}
              display="none"
              $md={{ display: 'flex' }}
            >
              <RatingValue value={entry.rating} />
            </XStack>
            <XStack role="cell" width={188} items="center" gap={4}>
              <StatusSelect
                entry={entry}
                onStatus={handlers.onStatus}
                width={148}
              />
              <EntryActions entry={entry} {...handlers} />
            </XStack>
          </XStack>
        );
      })}
    </YStack>
  );
}
