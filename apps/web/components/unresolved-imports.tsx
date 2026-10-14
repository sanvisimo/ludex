import type { HiddenKind, UnresolvedImport } from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
  YStack,
  toast,
} from '@repo/ui';
import { ChevronDown, EyeOff, Link2 } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { UnresolvedRow } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { HIDDEN_KIND_ICON } from '@/lib/hidden-kind-icons';
import { useHiddenKindLabels } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';

// I quattro tipi che dicono **che cos'è** la voce, separati da `unwanted`, che
// è una preferenza: nel menu stanno in due gruppi per la stessa ragione per cui
// sono due cose diverse nel modello (vedi `hiddenKindValues`).
const notAGame = hiddenKindValues.filter((kind) => kind !== 'unwanted');

function KindIcon({ kind }: { kind: HiddenKind }) {
  const Icon = HIDDEN_KIND_ICON[kind];
  return <Icon size={16} />;
}

/**
 * Il menu «Nascondi ▾»: i quattro tipi che dicono che cosa è la voce, poi
 * «Non interessato», che è una preferenza. Lo usano la singola voce e, con
 * un'altra etichetta, «Nascondi tutte» dei possibili doppioni.
 */
export function HideMenu({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled: boolean;
  onPick: (kind: HiddenKind) => void;
}) {
  const t = useTranslations('account.unresolved');
  const kindLabels = useHiddenKindLabels();

  return (
    <DropdownMenu align="end">
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="ghost" disabled={disabled}>
            <EyeOff size={16} color="$color12" />
            {label}
            <ChevronDown size={16} color="$color12" />
          </Button>
        }
      />
      <DropdownMenuContent width={208}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('notAGame')}</DropdownMenuLabel>
          {notAGame.map((kind) => (
            <DropdownMenuItem
              key={kind}
              icon={<KindIcon kind={kind} />}
              onClick={() => onPick(kind)}
            >
              {kindLabels[kind]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<KindIcon kind="unwanted" />}
          onClick={() => onPick('unwanted')}
        >
          {kindLabels.unwanted}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Nasconde una o più voci d'import con lo stesso motivo. Più voci sono più
 * richieste, in parallelo: «Nascondi tutte» ne manda al più una manciata.
 */
export function useHideUnresolved(fallback: string) {
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, kind }: { ids: string[]; kind: HiddenKind | null }) =>
      Promise.all(ids.map((id) => client.imports.setHidden({ id, kind }))),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() }),
    onError: (error) => toast.error(errorMessage(error, { fallback })),
  });
}

/**
 * Gli scarti d'import **non riconosciuti**: le voci della libreria che nessun
 * gioco ha riconosciuto, ciascuna con i due gesti possibili.
 *
 * Collegarla al gioco giusto, o nasconderla dicendo **perché**: un'app, un DLC,
 * un contenuto extra, una versione di prova, o un gioco vero che non interessa.
 * I primi quattro sono un fatto sulla voce, l'ultimo una preferenza, ed è la
 * differenza che allo step 11 separerà ciò che si può promuovere a regola per
 * tutti da ciò che resta tuo. Le voci nascoste vivono in `hidden-list`, nella
 * sezione Nascosti; le voci in più di un prodotto Epic in `PossibleDuplicates`.
 *
 * Il titolo con il conto sta nella sezione, sopra i tab. Senza voci non disegna
 * niente: a dire «non c'è niente» è la sezione.
 */
export function UnresolvedImports({
  entries,
  onResolve,
}: {
  /** Già filtrate: da sistemare, e non voci in più di un prodotto. */
  entries: UnresolvedImport[];
  onResolve: (entry: UnresolvedImport) => void;
}) {
  const t = useTranslations('account.unresolved');
  const tHidden = useTranslations('hidden');
  const setHidden = useHideUnresolved(t('hideFailed'));

  if (entries.length === 0) return null;

  return (
    <YStack gap={12}>
      <Text fontSize={14} lineHeight={20} color="$color11">
        {t('description')}
      </Text>

      <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <UnresolvedRow key={entry.id} entry={entry}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(entry)}
            >
              <Link2 size={16} color="$color12" />
              {t('resolve')}
            </Button>
            <HideMenu
              label={tHidden('hide')}
              disabled={setHidden.isPending}
              onPick={(kind) => setHidden.mutate({ ids: [entry.id], kind })}
            />
          </UnresolvedRow>
        ))}
      </ul>
    </YStack>
  );
}
