import { Badge } from '@repo/ui';
import { useTranslations } from 'use-intl';

/** Lo stato di una fonte, nel colore dello stato: ok, da guardare, rotto, in attesa. */
const STATUS_BADGE = {
  ok: 'success',
  not_found: 'warning',
  failed: 'error',
  pending: 'secondary',
} as const;

/**
 * Lo stato è la cosa che l'occhio cerca: un `Badge` coi colori degli stati del
 * design system, non testo uguale al resto. Sta nella scheda del gioco e nella
 * lista dei dati mancanti, così «ok» è lo stesso verde dappertutto.
 */
export function StatusBadge({ status }: { status: keyof typeof STATUS_BADGE }) {
  const t = useTranslations('admin');
  return <Badge variant={STATUS_BADGE[status]}>{t(`status.${status}`)}</Badge>;
}
