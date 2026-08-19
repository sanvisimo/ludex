"use client";

import type { UserTag, UserTagKind } from "@repo/contracts";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Sceglie i tag (o le categorie) di un gioco.
 *
 * Lavora sui **nomi**, non sugli id, perché è così che l'API li accetta: chi
 * scrive una parola non sa se quel tag esiste già, e non deve saperlo. I
 * suggerimenti servono solo a non far riscrivere a mano ciò che si è già usato —
 * il confronto lato server è insensibile alle maiuscole, quindi ripescare dalla
 * lista o riscrivere portano allo stesso tag.
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
  const [draft, setDraft] = useState("");

  const selected = new Set(value.map((name) => name.toLowerCase()));

  function add(name: string) {
    const trimmed = name.trim();
    // Il doppione va fermato qui e non lato server: là verrebbe assorbito in
    // silenzio, e chi scrive vedrebbe il tag sparire senza capire perché.
    if (trimmed.length === 0 || selected.has(trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  const available = suggestions
    .filter((tag) => tag.kind === kind && !selected.has(tag.name.toLowerCase()))
    .filter((tag) => tag.name.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1">
              {name}
              <button
                type="button"
                aria-label={t("removeTag", { name })}
                onClick={() => onChange(value.filter((item) => item !== name))}
                className="opacity-50 hover:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Senza questo l'Invio invierebbe il form e chiuderebbe il dialog
            // invece di aggiungere il tag.
            event.preventDefault();
            add(draft);
          }}
          placeholder={t(kind === "tag" ? "tagPlaceholder" : "categoryPlaceholder")}
          maxLength={50}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={draft.trim().length === 0}
          onClick={() => add(draft)}
        >
          {t("addTag")}
        </Button>
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map((tag) => (
            <button key={tag.id} type="button" onClick={() => add(tag.name)}>
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                + {tag.name}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
