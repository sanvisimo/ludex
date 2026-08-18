"use client";

import type { BacklogStatus, IgdbSearchHit, Store } from "@repo/contracts";
import { backlogStatusValues, storeValues } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { PlatformCombobox } from "@/components/platform-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiErrorMessage } from "@/lib/api-error";
import { useStatusLabels, useStoreLabels } from "@/lib/labels";
import { api, client } from "@/lib/orpc";

const NO_STORE = "__nessuno__";

type OwnershipRow = { key: number; platformSlug: string | null; store: string };

let rowSeq = 0;
const emptyRow = (): OwnershipRow => ({
  key: ++rowSeq,
  platformSlug: null,
  store: NO_STORE,
});

export function AddGameDialog() {
  const t = useTranslations("addGame");
  const statusLabels = useStatusLabels();
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();

  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);

  // Il titolo è sempre modificabile a mano: IGDB è un aiuto facoltativo, non un
  // passaggio obbligato. Un gioco che IGDB non conosce si inserisce lo stesso.
  const [title, setTitle] = useState("");
  const [linked, setLinked] = useState<IgdbSearchHit | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const [rows, setRows] = useState<OwnershipRow[]>([emptyRow()]);
  const [status, setStatus] = useState<BacklogStatus>("backlog");

  const platforms = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const search = useQuery({
    ...api.games.search.queryOptions({ input: { query: submitted ?? "" } }),
    enabled: submitted !== null && submitted.trim().length >= 2,
  });

  function reset() {
    setTitle("");
    setLinked(null);
    setSearchOpen(false);
    setSubmitted(null);
    setRows([emptyRow()]);
    setStatus("backlog");
  }

  // Modificare il titolo scollega il risultato IGDB: il collegamento vale per
  // quel titolo preciso. Tenerlo su un testo diverso sarebbe ingannevole, perché
  // il gioco verrebbe salvato col nome di IGDB e non con quello scritto.
  function editTitle(next: string) {
    setTitle(next);
    if (linked) setLinked(null);
  }

  function pick(hit: IgdbSearchHit) {
    setLinked(hit);
    setTitle(hit.name);
    setSearchOpen(false);
  }

  const filledRows = rows.filter((row) => row.platformSlug !== null);
  const canSubmit = title.trim().length > 0 && filledRows.length > 0;

  const add = useMutation({
    mutationFn: async () => {
      // Con un risultato IGDB si risolve la riga condivisa (creandola, o
      // riusando quella che un altro utente ha già importato). Senza, si crea un
      // gioco non risolto: `igdbId` resta null finché qualcuno non lo collega.
      const game = linked
        ? await client.games.fromIgdb({ igdbId: linked.igdbId })
        : await client.games.create({ name: title.trim() });

      return client.backlog.add({
        gameId: game.id,
        status,
        ownerships: filledRows.map((row) => ({
          platformSlug: row.platformSlug as string,
          store: row.store === NO_STORE ? null : (row.store as Store),
        })),
      });
    },
    onSuccess: async (entry) => {
      await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
      await queryClient.invalidateQueries({ queryKey: api.games.latest.key() });
      toast.success(t("added", { name: entry.game.name }));
      setOpen(false);
      reset();
    },
    onError: (error) => {
      // `CONFLICT` qui ha un significato preciso che vale la pena dire: il
      // gioco c'è già, non è un errore da riprovare.
      toast.error(errorMessage(error, { fallback: t("failed"), CONFLICT: t("duplicate") }));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button>{t("trigger")}</Button>} />

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="titolo">{t("titleLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="titolo"
                value={title}
                onChange={(event) => editTitle(event.target.value)}
                placeholder={t("titlePlaceholder")}
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={title.trim().length < 2}
                onClick={() => {
                  setSearchOpen(true);
                  setSubmitted(title);
                }}
              >
                {t("search")}
              </Button>
            </div>

            {linked ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  IGDB {linked.igdbId}
                  {linked.releaseYear ? ` · ${linked.releaseYear}` : ""}
                  {linked.developer ? ` · ${linked.developer}` : ""}
                </Badge>
                <Button type="button" variant="ghost" size="sm" onClick={() => setLinked(null)}>
                  {t("unlink")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("noLinkHint")}</p>
            )}

            {searchOpen && (
              <div className="max-h-56 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
                {search.isFetching ? (
                  <div className="grid gap-2 p-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full rounded-md" />
                    ))}
                  </div>
                ) : search.error ? (
                  <p className="p-3 text-destructive">{t("searchFailed")}</p>
                ) : search.data?.length === 0 ? (
                  <p className="p-3 text-muted-foreground">
                    {t("noResults", { query: submitted ?? "" })}
                  </p>
                ) : (
                  <ul className="grid gap-0.5 p-1">
                    {search.data?.map((hit) => (
                      <li key={hit.igdbId}>
                        <button
                          type="button"
                          onClick={() => pick(hit)}
                          className="w-full rounded-md px-3 py-2 text-left hover:bg-muted"
                        >
                          <span className="font-medium">
                            {hit.name}
                            {hit.releaseYear ? ` (${hit.releaseYear})` : ""}
                          </span>
                          <span className="block text-muted-foreground">
                            {[hit.gameType, hit.developer].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("ownershipLabel")}</Label>
            {platforms.isPending ? (
              <Skeleton className="h-9 w-full rounded-lg" />
            ) : (
              <div className="grid gap-2">
                {rows.map((row, index) => (
                  <div key={row.key} className="flex items-start gap-2">
                    <div className="flex-1">
                      <PlatformCombobox
                        platforms={platforms.data ?? []}
                        value={row.platformSlug}
                        onValueChange={(next) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.key === row.key ? { ...item, platformSlug: next } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <Select
                      items={{ [NO_STORE]: t("noStore"), ...storeLabels }}
                      value={row.store}
                      onValueChange={(next) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.key === row.key ? { ...item, store: next as string } : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_STORE}>{t("noStore")}</SelectItem>
                        {storeValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {storeLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("removeRow", { number: index + 1 })}
                        onClick={() =>
                          setRows((current) => current.filter((item) => item.key !== row.key))
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() => setRows((current) => [...current, emptyRow()])}
                >
                  {t("addPlatform")}
                </Button>
              </div>
            )}
            <p className="text-muted-foreground">
              {t.rich("ownershipHint", { em: (chunks) => <em>{chunks}</em> })}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>{t("statusLabel")}</Label>
            <Select
              items={statusLabels}
              value={status}
              onValueChange={(next) => setStatus(next as BacklogStatus)}
            >
              <SelectTrigger className="w-full">
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
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}>
            {add.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
