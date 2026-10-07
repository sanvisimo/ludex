/**
 * Dal testo di un campo numerico accanto a uno slider al valore dello slider.
 *
 * - **vuoto** → `null`: «nessun limite», come la maniglia all'estremo;
 * - **non un numero** → `undefined`: il campo torna al valore di prima, senza
 *   cambiare il filtro;
 * - **un numero** → quello, portato al passo dello slider (0,3 con passo 0,5
 *   diventa 0,5) e dentro gli estremi (150 ore con tetto 100 diventa 100).
 *
 * La virgola vale come il punto: chi scrive «0,5» in italiano non sbaglia.
 */
export function parseRangeInput(
  text: string,
  range: { min: number; max: number; step: number },
): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;

  const { min, max, step } = range;
  const snapped = min + Math.round((value - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  // 0.5 + 3 × 0.1 non è 0.8 in virgola mobile: si arrotonda ai decimali del passo.
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(clamped.toFixed(decimals));
}
