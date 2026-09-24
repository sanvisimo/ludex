'use client';

import type { HiddenKind, UnresolvedImport } from '@repo/contracts';
import { hiddenKindValues } from '@repo/contracts';
import { toast } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApiErrorMessage } from '@/lib/api-error';
import { useHiddenKindLabels } from '@/lib/hide-entry';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

// I quattro tipi che dicono **che cos'è** la voce, separati da `unwanted`, che
// è una preferenza: nel menu stanno in due gruppi per la stessa ragione per cui
// sono due cose diverse nel modello (vedi `hiddenKindValues`).
const notAGame = hiddenKindValues.filter((kind) => kind !== 'unwanted');

/**
 * Gli scarti d'import: quelli da sistemare, e sotto quelli nascosti.
 *
 * Nascondere una voce vuol dire dire **perché**: un'app, un DLC, un contenuto
 * extra, una versione di prova, o un gioco vero che non interessa. I primi
 * quattro sono un fatto sulla voce, l'ultimo una preferenza, ed è la
 * differenza che allo step 11 separerà ciò che si può promuovere a regola per
 * tutti da ciò che resta tuo.
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
  const hidden = entries.filter((entry) => entry.hiddenKind !== null);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title', { count: pending.length })}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pending.length > 0 && (
          <>
            <p className="text-muted-foreground">{t('description')}</p>
            <ul className="grid gap-2">
              {pending.map((entry) => (
                <Row key={entry.id} entry={entry}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve(entry)}
                  >
                    {t('resolve')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setHidden.isPending}
                        >
                          {tHidden('hide')}
                          <ChevronDownIcon />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>{t('notAGame')}</DropdownMenuLabel>
                        {notAGame.map((kind) => (
                          <DropdownMenuItem
                            key={kind}
                            onClick={() =>
                              setHidden.mutate({ id: entry.id, kind })
                            }
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
                </Row>
              ))}
            </ul>
          </>
        )}

        {/* Il posto dove ripensarci: chiuso di default, perché è ciò che si è
            deciso di non guardare, ma sempre raggiungibile. Una voce nascosta
            per errore può essere un gioco vero, e lì si può ancora collegare. */}
        {hidden.length > 0 && (
          <details className="grid gap-3">
            <summary className="cursor-pointer font-medium">
              {t('hiddenTitle', { count: hidden.length })}
            </summary>
            <div className="mt-3 grid gap-4">
              <p className="text-muted-foreground">{t('hiddenHint')}</p>
              {hiddenKindValues.map((kind) => {
                const group = hidden
                  .filter((entry) => entry.hiddenKind === kind)
                  // Gli ultimi nascosti per primi: è lì che si cerca un errore
                  // appena fatto.
                  .sort(
                    (a, b) =>
                      (b.hiddenAt?.getTime() ?? 0) -
                      (a.hiddenAt?.getTime() ?? 0),
                  );
                if (group.length === 0) return null;
                return (
                  <section key={kind} className="grid gap-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {kindLabels[kind]} ({group.length})
                    </h3>
                    <ul className="grid gap-2">
                      {group.map((entry) => (
                        <Row key={entry.id} entry={entry}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onResolve(entry)}
                          >
                            {t('resolve')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setHidden.mutate({ id: entry.id, kind: null })
                            }
                            disabled={setHidden.isPending}
                          >
                            {tHidden('unhide')}
                          </Button>
                        </Row>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** Una voce: il nome, da dove viene, e i bottoni che le passa chi la usa. */
function Row({
  entry,
  children,
}: {
  entry: UnresolvedImport;
  children: React.ReactNode;
}) {
  const t = useTranslations('account.unresolved');
  const storeLabels = useStoreLabels();

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-foreground/10">
      <div className="grid flex-1 gap-0.5">
        <span className="font-medium">{entry.name}</span>
        <span className="text-muted-foreground">
          {storeLabels[entry.store]} ({entry.storeName}) · {entry.externalId}
          {entry.playtimeMinutes
            ? ` · ${t('hours', {
                hours: Math.round(entry.playtimeMinutes / 60),
              })}`
            : ''}
        </span>
      </div>
      {children}
    </li>
  );
}
