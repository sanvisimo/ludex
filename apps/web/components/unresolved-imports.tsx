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
import { ChevronDown } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import { UnresolvedRow } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { useHiddenKindLabels } from '@/lib/hide-entry';
import { api, client } from '@/lib/orpc';

// I quattro tipi che dicono **che cos'è** la voce, separati da `unwanted`, che
// è una preferenza: nel menu stanno in due gruppi per la stessa ragione per cui
// sono due cose diverse nel modello (vedi `hiddenKindValues`).
const notAGame = hiddenKindValues.filter((kind) => kind !== 'unwanted');

/**
 * Gli scarti d'import **da sistemare**: le voci della libreria che nessun gioco
 * ha riconosciuto, ciascuna con i due gesti possibili.
 *
 * Collegarla al gioco giusto, o nasconderla dicendo **perché**: un'app, un DLC,
 * un contenuto extra, una versione di prova, o un gioco vero che non interessa.
 * I primi quattro sono un fatto sulla voce, l'ultimo una preferenza, ed è la
 * differenza che allo step 11 separerà ciò che si può promuovere a regola per
 * tutti da ciò che resta tuo. Le voci nascoste vivono in `hidden-list`, nella
 * sezione Nascosti.
 *
 * Senza voci da sistemare non disegna niente: a dire «non c'è niente» è la
 * sezione.
 */
export function UnresolvedImports({
  entries,
  onResolve,
}: {
  entries: UnresolvedImport[];
  onResolve: (entry: UnresolvedImport) => void;
}) {
  const t = useTranslations('account.unresolved');
  const tHidden = useTranslations('hidden');
  const kindLabels = useHiddenKindLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const setHidden = useMutation({
    mutationFn: (input: { id: string; kind: HiddenKind | null }) =>
      client.imports.setHidden(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('hideFailed') })),
  });

  const pending = entries.filter((entry) => entry.hiddenKind === null);
  if (pending.length === 0) return null;

  return (
    <YStack gap={12}>
      <YStack gap={4}>
        <Text
          render="h2"
          fontFamily="$heading"
          fontSize={18}
          lineHeight={24}
          fontWeight="600"
          color="$color12"
        >
          {t('title', { count: pending.length })}
        </Text>
        <Text fontSize={14} lineHeight={20} color="$color11">
          {t('description')}
        </Text>
      </YStack>

      <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
        {pending.map((entry) => (
          <UnresolvedRow key={entry.id} entry={entry}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(entry)}
            >
              {t('resolve')}
            </Button>
            <DropdownMenu align="end">
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={setHidden.isPending}
                  >
                    {tHidden('hide')}
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
                      onClick={() => setHidden.mutate({ id: entry.id, kind })}
                    >
                      {kindLabels[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    setHidden.mutate({ id: entry.id, kind: 'unwanted' })
                  }
                >
                  {kindLabels.unwanted}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </UnresolvedRow>
        ))}
      </ul>
    </YStack>
  );
}
