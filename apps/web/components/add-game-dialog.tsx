"use client";

import type { BacklogStatus, IgdbSearchHit, Store } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
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
import { statusItems, statusOptions, storeItems, storeOptions } from "@/lib/labels";
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
      toast.success(`${entry.game.name} aggiunto al backlog`);
      setOpen(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.message || "Non sono riuscito ad aggiungere il gioco");
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
      <DialogTrigger render={<Button>Aggiungi gioco</Button>} />

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi un gioco</DialogTitle>
          <DialogDescription>
            Scrivi il titolo. Se vuoi, cercalo su IGDB per collegarlo ai metadati.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="titolo">Titolo</Label>
            <div className="flex gap-2">
              <Input
                id="titolo"
                value={title}
                onChange={(event) => editTitle(event.target.value)}
                placeholder="Titolo del gioco"
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
                Cerca su IGDB
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
                  Scollega
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Senza collegamento il gioco resta non risolto: niente metadati.
              </p>
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
                  <p className="p-3 text-destructive">Ricerca fallita. Riprova.</p>
                ) : search.data?.length === 0 ? (
                  <p className="p-3 text-muted-foreground">
                    Nessun risultato per «{submitted}». Puoi aggiungerlo lo stesso a mano.
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
            <Label>Dove ce l&apos;hai</Label>
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
                      items={storeItems(NO_STORE, "Nessuno store")}
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
                        <SelectItem value={NO_STORE}>Nessuno store</SelectItem>
                        {storeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Togli la riga ${index + 1}`}
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
                  Aggiungi piattaforma
                </Button>
              </div>
            )}
            <p className="text-muted-foreground">
              Su PC lo stesso gioco può stare su Steam <em>e</em> GOG: sono due righe.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Stato</Label>
            <Select
              items={statusItems}
              value={status}
              onValueChange={(next) => setStatus(next as BacklogStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}>
            {add.isPending ? "Aggiungo…" : "Aggiungi al backlog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
