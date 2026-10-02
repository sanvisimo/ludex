import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  YStack,
} from '@repo/ui';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';

import { CardHeaderRow } from '@/components/card-header-row';
import { useSession } from '@/src/use-session';

// Si accende con lo step 16, insieme alla procedura che cancella davvero.
const DELETION_AVAILABLE = false;

/**
 * Esportare e cancellare i propri dati.
 *
 * **Solo la parte che si vede.** L'esportazione e la cancellazione vere sono lo
 * step 16: toccano tutte le tabelle per utente, ed è lì che si decide cosa
 * contiene il file e cosa vuol dire «cancella» per ciò che sta su `games`, che
 * è di tutti. Fino ad allora il bottone dell'esportazione è spento, e il
 * dialogo della cancellazione si apre ma non conferma: così la schermata c'è
 * già, e il giorno che la procedura esiste manca un solo collegamento.
 */
export function AccountData() {
  const t = useTranslations('account.data');
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Card>
        <CardHeaderRow
          title={t('exportTitle')}
          description={t('exportDescription')}
          note={
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('soon')}
            </Text>
          }
          action={
            <Button variant="outline" disabled>
              {t('export')}
            </Button>
          }
        />
      </Card>

      {/* La zona rossa: è l'unica cosa della pagina che non si può disfare. */}
      <Card borderColor="$red7">
        <CardHeaderRow
          title={t('deleteTitle')}
          description={t('deleteDescription')}
          action={
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              {t('delete')}
            </Button>
          }
        />
      </Card>

      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

/**
 * Per cancellare si scrive il proprio nome utente: un gesto che un clic
 * distratto non fa. La conferma resta spenta finché non c'è lo step 16, e il
 * dialogo lo dice.
 */
function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.data');
  const { data: session } = useSession();
  const confirmId = useId();
  const [typed, setTyped] = useState('');

  const name = session?.user.name ?? '';
  const matches = name.length > 0 && typed.trim() === name;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setTyped('');
        onOpenChange(value);
      }}
    >
      <DialogContent maxW={448}>
        <YStack gap={16}>
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogDescription')}</DialogDescription>
          </DialogHeader>

          <YStack gap={8}>
            <Label htmlFor={confirmId}>{t('confirmLabel', { name })}</Label>
            <Input
              id={confirmId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </YStack>

          {!DELETION_AVAILABLE && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('notAvailable')}
            </Text>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!DELETION_AVAILABLE || !matches}
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        </YStack>
      </DialogContent>
    </Dialog>
  );
}
