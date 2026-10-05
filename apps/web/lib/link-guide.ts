import type { GuidedStore } from '@repo/contracts';

/**
 * Dove stanno, fra i passi del collegamento, le cose che non sono testo.
 *
 * I passi in sé sono nei messaggi (`account.stores.<negozio>.steps`), una frase
 * per azione e l'**ultimo è sempre «incolla»**, con il campo. Qui c'è solo ciò che
 * il testo non può dire: a quale passo sta il pulsante che apre il login, e dove
 * va il disegno.
 *
 * Sono indici e non chiavi, perché i passi sono un elenco ordinato: aggiungerne
 * uno a un negozio sposta i numeri, e questi due con loro.
 */
export const linkGuide: Record<
  GuidedStore,
  {
    /** Il passo col pulsante che apre il login (o la pagina del codice, su PSN). */
    openAt: number;
    /** Il passo che ha un disegno schematico, se ce l'ha. */
    illustrationAt?: number;
  }
> = {
  gog: { openAt: 0 },
  epic: { openAt: 0 },
  amazon: { openAt: 0 },
  // Sony vuole prima il login su playstation.com, a mano; il pulsante apre la
  // pagina che mostra l'npsso, che è il passo dopo.
  psn: { openAt: 1 },
  // Il passo del clic destro è quello che nessuno indovina da solo.
  nintendo: { openAt: 0, illustrationAt: 1 },
};
