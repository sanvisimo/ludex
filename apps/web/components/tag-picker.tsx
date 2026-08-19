"use client";

import type { UserTag, UserTagKind } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiErrorMessage } from "@/lib/api-error";
import { api, client } from "@/lib/orpc";

// Una riga della lista. `id` è nullo per le parole scritte in questa sessione e
// non ancora salvate: esistono solo qui, quindi non c'è niente da cancellare.
type Row = { id: string | null; name: string };

/**
 * Sceglie i tag (o le categorie) di un gioco spuntandoli da una lista.
 *
 * La forma è quella di Playnite, e la ragione è che dopo qualche settimana il
 * vocabolario smette di crescere: si sceglie molto più spesso di quanto si
 * inventi. Scrivere serve a due cose — filtrare la lista quando è lunga, e
 * creare la parola quando ancora non c'è — e la seconda si offre solo quando
 * quello che hai scritto non corrisponde a niente.
 *
 * Lavora sui **nomi** e non sugli id perché è così che l'API li accetta: il
 * server risolve la parola nel suo vocabolario, creandola se serve. Per questo
 * una parola appena inventata sta nella lista come le altre, spuntata, prima
 * ancora di esistere nel database.
 */
export function TagPicker({
  kind,
  value,
  suggestions,
  onChange,
}: {
  kind: UserTagKind;
  value: string[];
  suggestions: UserTag[];
  onChange: (value: string[]) => void;
}) {
  const t = useTranslations("editEntry");
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState("");
  // Quale riga sta chiedendo conferma per la cancellazione. Due passi in linea
  // invece di un dialog dentro il dialog: la domanda è piccola e la risposta
  // deve stare accanto a ciò che sparisce.
  const [confirming, setConfirming] = useState<string | null>(null);

  const selected = new Set(value.map((name) => name.toLowerCase()));
  const vocabulary = suggestions.filter((tag) => tag.kind === kind);

  // Le parole scelte che nel vocabolario non ci sono ancora: sono state scritte
  // adesso e vanno mostrate spuntate, o sembrerebbero perse.
  const unsaved: Row[] = value
    .filter((name) => !vocabulary.some((tag) => tag.name.toLowerCase() === name.toLowerCase()))
    .map((name) => ({ id: null, name }));

  const needle = filter.trim().toLowerCase();
  const rows = [...vocabulary.map((tag) => ({ id: tag.id, name: tag.name })), ...unsaved]
    .filter((row) => row.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  const draft = filter.trim();
  // Si crea solo ciò che non esiste già: altrimenti il bottone proporrebbe di
  // inventare una parola che è lì sotto, nella lista.
  const canCreate =
    draft.length > 0 &&
    ![...vocabulary, ...unsaved].some((row) => row.name.toLowerCase() === draft.toLowerCase());

  function toggle(name: string, checked: boolean) {
    if (checked) {
      if (selected.has(name.toLowerCase())) return;
      onChange([...value, name]);
      return;
    }
    onChange(value.filter((item) => item.toLowerCase() !== name.toLowerCase()));
  }

  function create() {
    if (!canCreate) return;
    onChange([...value, draft]);
    setFilter("");
  }

  const remove = useMutation({
    mutationFn: (row: Row) => client.tags.remove({ id: row.id as string }),
    onSuccess: async (_, row) => {
      // Cancellato dal vocabolario, il tag si è staccato da tutti i giochi: il
      // backlog che sta a schermo non lo sa ancora.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.tags.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
        queryClient.invalidateQueries({ queryKey: api.games.byId.key() }),
      ]);
      // Anche dalla scelta in corso, che altrimenti lo ricreerebbe al salvataggio.
      onChange(value.filter((item) => item.toLowerCase() !== row.name.toLowerCase()));
      setConfirming(null);
    },
    onError: (error) => toast.error(errorMessage(error, { fallback: t("deleteTagFailed") })),
  });

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Senza questo l'Invio invierebbe il form e chiuderebbe il dialog.
            event.preventDefault();
            create();
          }}
          placeholder={t(kind === "tag" ? "tagPlaceholder" : "categoryPlaceholder")}
          maxLength={50}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={!canCreate}
          onClick={create}
        >
          <PlusIcon />
          {t("addTag")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {draft.length > 0 ? t("noTagMatch", { query: draft }) : t("noTagsYet")}
        </p>
      ) : (
        <ul className="max-h-40 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
          {rows.map((row) => (
            <li key={row.id ?? `nuovo-${row.name}`} className="flex items-center gap-2 px-2 py-1">
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.has(row.name.toLowerCase())}
                  onChange={(event) => toggle(row.name, event.target.checked)}
                />
                <span>{row.name}</span>
                {row.id === null && (
                  <span className="text-muted-foreground">{t("tagUnsaved")}</span>
                )}
              </label>

              {/* Solo le parole già nel vocabolario si possono cancellare: le
                  altre non esistono ancora da nessuna parte. */}
              {row.id !== null &&
                (confirming === row.id ? (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">{t("deleteTagConfirm")}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(row)}
                    >
                      {t("deleteTagYes")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(null)}
                    >
                      {t("deleteTagNo")}
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("deleteTag", { name: row.name })}
                    onClick={() => setConfirming(row.id)}
                  >
                    <Trash2Icon />
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
