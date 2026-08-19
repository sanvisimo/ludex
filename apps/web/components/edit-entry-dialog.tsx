"use client";

import type {
  BacklogEntry,
  BacklogStatus,
  Store,
  UserTagKind,
} from "@repo/contracts";
import { backlogStatusValues, storeValues } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OwnershipBadges } from "@/components/ownership-badges";
import { PlatformCombobox } from "@/components/platform-combobox";
import { RatingStars } from "@/components/rating-stars";
import { TagPicker } from "@/components/tag-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiErrorMessage } from "@/lib/api-error";
import { useStatusLabels, useStoreLabels } from "@/lib/labels";
import { api, client } from "@/lib/orpc";

const NO_STORE = "__nessuno__";

function namesOf(entry: BacklogEntry | null, kind: UserTagKind) {
  return (entry?.tags ?? [])
    .filter((tag) => tag.kind === kind)
    .map((tag) => tag.name);
}

/**
 * La schermata di modifica dello step 5: campi personali e possessi.
 *
 * Stanno insieme perché sono la stessa domanda — "com'è per me questo gioco" —
 * e perché separarle avrebbe voluto dire due dialog per due click.
 *
 * Il salvataggio è **uno solo**: le piattaforme aggiunte restano in sospeso
 * finché non si salva, invece di scrivere a ogni click. Chi apre il dialog e
 * cambia idea deve poterlo chiudere senza aver combinato niente.
 */
export function EditEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: BacklogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("editEntry");
  const statusLabels = useStatusLabels();
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<BacklogStatus>("backlog");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [pending, setPending] = useState<
    { platformSlug: string; store: string }[]
  >([]);
  const [platformSlug, setPlatformSlug] = useState<string | null>(null);
  const [store, setStore] = useState<string>(NO_STORE);

  // Il form si ricarica quando cambia la riga, non a ogni render: `entry` arriva
  // da una query che si aggiorna da sé, e ricopiarla sempre cancellerebbe ciò
  // che si sta scrivendo.
  useEffect(() => {
    if (!entry) return;
    setStatus(entry.status);
    setRating(entry.rating);
    setNotes(entry.notes ?? "");
    setTags(namesOf(entry, "tag"));
    setCategories(namesOf(entry, "category"));
    setPending([]);
    setPlatformSlug(null);
    setStore(NO_STORE);
  }, [entry]);

  const platforms = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const suggestions = useQuery({
    ...api.tags.list.queryOptions(),
    enabled: entry !== null,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!entry) return;

      await client.backlog.update({
        id: entry.id,
        status,
        rating,
        notes,
        tags: [
          ...tags.map((name) => ({ kind: "tag" as const, name })),
          ...categories.map((name) => ({ kind: "category" as const, name })),
        ],
      });

      // In sequenza e non in parallelo: scrivono tutte sulla stessa riga di
      // backlog, e in parallelo si contenderebbero il vincolo unique.
      for (const row of pending) {
        await client.backlog.addOwnership({
          id: entry.id,
          ownership: {
            platformSlug: row.platformSlug,
            store: row.store === NO_STORE ? null : (row.store as Store),
          },
        });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.games.byId.key() }),
        // Il vocabolario può essere cresciuto: i suggerimenti devono saperlo.
        queryClient.invalidateQueries({ queryKey: api.tags.list.key() }),
      ]);
      toast.success(t("saved"));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t("saveFailed") })),
  });

  const alreadyOwned = new Set(
    (entry?.ownerships ?? []).map(
      (row) => `${row.platformSlug}|${row.store ?? ""}`,
    ),
  );

  function addPending() {
    if (!platformSlug) return;
    const key = `${platformSlug}|${store === NO_STORE ? "" : store}`;
    // Aggiungere un possesso che c'è già è innocuo lato server — la scrittura è
    // idempotente — ma mostrarlo due volte nell'elenco sarebbe una bugia.
    if (
      alreadyOwned.has(key) ||
      pending.some(
        (row) =>
          `${row.platformSlug}|${row.store === NO_STORE ? "" : row.store}` ===
          key,
      )
    ) {
      return;
    }
    setPending((current) => [...current, { platformSlug, store }]);
    setPlatformSlug(null);
    setStore(NO_STORE);
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{entry?.game.name ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
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

          <div className="grid gap-2">
            <Label>{t("ratingLabel")}</Label>
            <RatingStars value={rating} onChange={setRating} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note">{t("notesLabel")}</Label>
            <Textarea
              id="note"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("notesPlaceholder")}
              maxLength={2000}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("categoriesLabel")}</Label>
            <TagPicker
              kind="category"
              value={categories}
              suggestions={suggestions.data ?? []}
              onChange={setCategories}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("tagsLabel")}</Label>
            <TagPicker
              kind="tag"
              value={tags}
              suggestions={suggestions.data ?? []}
              onChange={setTags}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("ownershipLabel")}</Label>
            <OwnershipBadges ownerships={entry?.ownerships ?? []} />

            {pending.length > 0 && (
              <p className="text-muted-foreground">
                {t("pendingOwnerships", { count: pending.length })} -{" "}
                {JSON.stringify(pending)}
              </p>
            )}

            <div className="flex items-start gap-2">
              <div className="flex-1">
                <PlatformCombobox
                  platforms={platforms.data ?? []}
                  value={platformSlug}
                  onValueChange={setPlatformSlug}
                />
              </div>
              <Select
                items={{ [NO_STORE]: t("noStore"), ...storeLabels }}
                value={store}
                onValueChange={(next) => setStore(next as string)}
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
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={platformSlug === null}
                onClick={addPending}
              >
                {t("addPlatform")}
              </Button>
            </div>

            {/* Togliere un possesso non c'è: cancellarlo non basterebbe, perché
                il prossimo import lo ricrea. Serve prima una logica di scarto. */}
            <p className="text-muted-foreground">{t("ownershipHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
