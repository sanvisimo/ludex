"use client";

import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";

const POSITIONS = [1, 2, 3, 4, 5];

/**
 * Voto da mezza stella a cinque.
 *
 * Ogni stella è due bersagli: la metà sinistra vale `n - 0.5`, la destra `n`.
 * È il motivo per cui non è un `input[type=range]` — con dieci valori discreti
 * uno slider costringe a mirare, le stelle no.
 *
 * Ricliccare il valore già scelto lo toglie: "non votato" è uno stato a cui si
 * deve poter tornare, ed è diverso da "votato mezza stella".
 */
export function RatingStars({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations("editEntry");
  const [hovered, setHovered] = useState<number | null>(null);

  // In hover si mostra il voto che si otterrebbe cliccando, non quello salvato.
  const shown = hovered ?? value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHovered(null)}>
        {POSITIONS.map((position) => (
          <div key={position} className="relative">
            <StarIcon className="size-7 text-muted-foreground/40" />

            {/* La stella piena ritagliata: 0%, 50% o 100% di larghezza. Il
                contenitore è largo quanto la stella intera, così la metà
                sinistra resta allineata al posto giusto. */}
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={{ width: `${Math.min(Math.max(shown - position + 1, 0), 1) * 100}%` }}
            >
              <StarIcon className="size-7 max-w-none fill-primary text-primary" />
            </span>

            {[position - 0.5, position].map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-label={t("ratingValue", { value: candidate })}
                onMouseEnter={() => setHovered(candidate)}
                onClick={() => onChange(value === candidate ? null : candidate)}
                className={cn(
                  "absolute inset-y-0 w-1/2 cursor-pointer",
                  candidate === position ? "right-0" : "left-0",
                )}
              />
            ))}
          </div>
        ))}
      </div>

      <span className="text-muted-foreground">
        {value === null ? t("noRating") : t("ratingOf", { value })}
      </span>
    </div>
  );
}
