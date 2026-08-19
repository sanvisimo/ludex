"use client";

import { useTranslations } from "next-intl";

/**
 * Minuti in una durata leggibile.
 *
 * Sotto le dieci ore si tiene il decimale, sopra no: fra "4,9 h" e "5 h" c'è una
 * serata di differenza, fra "51,7 h" e "52 h" non c'è niente che cambi una
 * decisione — ed è una media su migliaia di segnalazioni, non un cronometro.
 *
 * Sta qui e non dentro un componente perché la stessa durata compare nella
 * scheda del gioco e nelle liste, e due formattatori diversi si vedrebbero.
 */
export function useDuration() {
  const t = useTranslations("hltb");

  return (minuti: number) => {
    if (minuti < 60) return t("minutes", { value: minuti });
    const ore = minuti / 60;
    return t("hours", { value: ore < 10 ? Math.round(ore * 10) / 10 : Math.round(ore) });
  };
}
