import { ORPCError } from '@orpc/client';
import type { Store } from '@repo/contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  BrandIcon,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollView,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { Download, FileSpreadsheet, Upload } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { useFormatter, useLocale, useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { importTagDate } from '@/lib/import-tag';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { STORE_BRAND } from '@/lib/store-brand';
import { ButtonLink } from '@/src/components/button-link';

/** Il CSV d'esempio, in `apps/web/public`: un test dell'API controlla che si legga. */
const EXAMPLE_URL = '/ludex-import-example.csv';
/** Lo stesso tetto del contratto (`csvImport.upload`). */
const MAX_BYTES = 10 * 1024 * 1024;

/** Le colonne, nell'ordine della tabella: i nomi inglesi, come nel contratto. */
const REQUIRED = [
  ['Name', 'name'],
  ['Sources', 'sources'],
] as const;
const OPTIONAL = [
  ['Game Id', 'gameId'],
  ['Platforms', 'platforms'],
  ['Release Date', 'releaseDate'],
  ['Links', 'links'],
  ['Time Played', 'timePlayed'],
  ['Last Played', 'lastPlayed'],
  ['Completion Status', 'completionStatus'],
  ['Categories', 'categories'],
] as const;

type Report = Awaited<ReturnType<typeof client.csvImport.upload>>;

/** «Importato il 19/10/2026», nella lingua di chi guarda. */
function useImportTag() {
  const t = useTranslations('account.csvImport');
  const locale = useLocale();
  return (date: Date) => t('tag', { date: importTagDate(date, locale) });
}

/**
 * L'import da CSV (10) in Librerie: **un riquadro e non una scheda**, perché
 * un file non è una libreria. Sotto le schede dei negozi collegati, col
 * bottone che apre il dialogo e, dopo il primo import, quando è stato e col
 * tag di quel giorno. Wireframe in `plans/10-import-csv.excalidraw`.
 */
export function CsvImportPanel() {
  const t = useTranslations('account.csvImport');
  const format = useFormatter();
  const tagFor = useImportTag();
  const [open, setOpen] = useState(false);
  // Si rilegge con gli eventi dell'import, come gli account (`useLiveUpdates`).
  const status = useQuery(api.csvImport.status.queryOptions());

  return (
    <XStack
      items="center"
      justify="space-between"
      gap={12}
      flexWrap="wrap"
      p={16}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
    >
      <YStack gap={4} grow={1} shrink={1} flexBasis={320} minW={0}>
        <Text render="h3" m={0} fontWeight="600" color="$color12">
          {t('title')}
        </Text>
        <Text fontSize={13} lineHeight={18} color="$color11">
          {t('description')}
        </Text>
        {status.data?.syncing ? (
          <Badge variant="warning" self="flex-start" mt={4}>
            {t('syncing')}
          </Badge>
        ) : status.data?.lastImportAt ? (
          <Text fontSize={13} lineHeight={18} color="$color11">
            {t('lastImport', {
              date: format.dateTime(status.data.lastImportAt, {
                dateStyle: 'short',
              }),
              tag: tagFor(status.data.lastImportAt),
            })}
          </Text>
        ) : null}
      </YStack>

      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload size={16} color="$color12" />
        {t('open')}
      </Button>

      <CsvImportDialog open={open} onOpenChange={setOpen} />
    </XStack>
  );
}

/**
 * Il dialogo: prima le istruzioni e il file, poi — nello stesso dialogo — il
 * resoconto di cosa si è accodato e cosa si è saltato.
 */
function CsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('account.csvImport');
  const tagFor = useImportTag();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  // Il tag si fissa all'apertura: il resoconto deve dire lo stesso nome che
  // il dialogo ha promesso, anche a cavallo della mezzanotte.
  const [tag, setTag] = useState(() => tagFor(new Date()));

  const upload = useMutation({
    mutationFn: (chosen: File) =>
      client.csvImport.upload({ file: chosen, tag }),
    onSuccess: async (result) => {
      setReport(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: api.csvImport.key() }),
        queryClient.invalidateQueries({ queryKey: api.tags.key() }),
      ]);
    },
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (next) {
      setTag(tagFor(new Date()));
      return;
    }
    setFile(null);
    setReport(null);
    upload.reset();
  };

  const pick = (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    upload.reset();
  };

  const tooBig = file !== null && file.size > MAX_BYTES;
  const error = tooBig
    ? t('errors.tooBig')
    : upload.error
      ? uploadError(upload.error)
      : null;

  function uploadError(failure: Error) {
    // Un file sbagliato torna BAD_REQUEST col perché: la `reason`, e per le
    // colonne quali mancano. Il resto è un errore come gli altri.
    const data =
      failure instanceof ORPCError
        ? (failure.data as { reason?: string; missing?: string[] } | undefined)
        : undefined;
    if (data?.reason === 'missing_columns') {
      return t('errors.missing_columns', {
        count: data.missing?.length ?? 1,
        columns: (data.missing ?? []).join(', '),
      });
    }
    if (data?.reason === 'not_csv') return t('errors.not_csv');
    if (data?.reason === 'empty') return t('errors.empty');
    return errorMessage(failure, { fallback: t('errors.failed') });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeLabel={t('report.close')} maxH="90vh">
        {report ? (
          <CsvImportReport
            report={report}
            tag={tag}
            onClose={() => close(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('dialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('dialogDescription', { tag })}
              </DialogDescription>
            </DialogHeader>

            {/* Si restringe e scorre: le view di Tamagui non si restringono da
                sole, e senza il contenuto uscirebbe dal pannello. */}
            <ScrollView mx={-16} px={16} shrink={1} minH={0}>
              <YStack gap={16}>
                <XStack items="center" gap={8}>
                  <Download size={16} color="$color12" />
                  <Text
                    render="a"
                    // Gli attributi del link arrivano all'`<a>`, ma i tipi del
                    // testo non li conoscono (come in `ExternalLink`).
                    {...({ href: EXAMPLE_URL, download: true } as object)}
                    color="$color12"
                    textDecorationLine="underline"
                    cursor="pointer"
                  >
                    {t('example')}
                  </Text>
                </XStack>

                <Columns />

                <YStack gap={8}>
                  <Heading>{t('sourcesTitle')}</Heading>
                  {/* Chiusi: chi non usa quel programma non deve leggerne i
                      passi. Un programma nuovo è un riquadro in più. */}
                  <Accordion>
                    <SourceSteps source="playnite" />
                    <SourceSteps source="launchbox" />
                  </Accordion>
                </YStack>

                {/* La zona del file: ci si trascina sopra o si sceglie. Il
                    `div` solo per gli eventi del trascinamento, che i tipi di
                    Tamagui non conoscono; l'aspetto è dello stack dentro. */}
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    pick(event.dataTransfer.files[0]);
                  }}
                >
                  <YStack
                    items="center"
                    gap={8}
                    p={16}
                    rounded={12}
                    borderWidth={1}
                    borderStyle="dashed"
                    borderColor={
                      error ? '$red9' : dragging ? '$accent9' : '$borderColor'
                    }
                    bg={dragging ? '$color3' : 'transparent'}
                  >
                    {file ? (
                      <XStack items="center" gap={8} maxW="100%">
                        <FileSpreadsheet size={16} color="$color12" />
                        <Text color="$color12" numberOfLines={1} shrink={1}>
                          {file.name}
                        </Text>
                      </XStack>
                    ) : (
                      // Sul telefono non si trascina: resta il bottone. La
                      // media query su uno stack e non sul testo, o server e
                      // browser scrivono due classi diverse.
                      <YStack $max-sm={{ display: 'none' }}>
                        <Text fontSize={13} color="$color11" text="center">
                          {t('drop')}
                        </Text>
                      </YStack>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => inputRef.current?.click()}
                    >
                      {file ? t('change') : t('choose')}
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,text/csv"
                      aria-label={t('fileLabel')}
                      hidden
                      onChange={(event) => {
                        pick(event.target.files?.[0]);
                        // Lo stesso file scelto di nuovo deve ripartire.
                        event.target.value = '';
                      }}
                    />
                  </YStack>
                </div>
                {error && (
                  <Text
                    fontSize={13}
                    lineHeight={18}
                    color="$red11"
                    role="alert"
                  >
                    {error}
                  </Text>
                )}

                <YStack gap={4} pb={4}>
                  {(t.raw('notes') as string[]).map((note) => (
                    <Text
                      key={note}
                      fontSize={13}
                      lineHeight={18}
                      color="$color11"
                    >
                      · {note}
                    </Text>
                  ))}
                </YStack>
              </YStack>
            </ScrollView>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => file && upload.mutate(file)}
                disabled={!file || tooBig || upload.isPending}
              >
                {t('submit')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Text render="h3" m={0} fontWeight="600" color="$color12">
      {children}
    </Text>
  );
}

/** La tabella delle colonne: il nome a sinistra, cosa contiene a destra. */
function Columns() {
  const t = useTranslations('account.csvImport');

  const rows = (columns: readonly (readonly [string, string])[]) =>
    columns.map(([name, key]) => (
      <XStack key={name} gap={4} columnGap={16} flexWrap="wrap">
        <Text fontWeight="600" color="$color12" width={150}>
          {name}
        </Text>
        <Text
          fontSize={13}
          lineHeight={20}
          color="$color11"
          flexBasis={240}
          grow={1}
          shrink={1}
        >
          {t(`columns.${key}` as 'columns.name')}
        </Text>
      </XStack>
    ));

  return (
    <YStack gap={8}>
      <Heading>{t('columnsTitle')}</Heading>
      <YStack
        gap={8}
        p={12}
        rounded={12}
        bg="$color3"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize={12} color="$color11">
          {t('required')}
        </Text>
        {rows(REQUIRED)}
        <Text fontSize={12} color="$color11" mt={8}>
          {t('optional')}
        </Text>
        {rows(OPTIONAL)}
      </YStack>
      <Text fontSize={13} lineHeight={18} color="$color11">
        {t('columnsNote')}
      </Text>
    </YStack>
  );
}

/** I passi di un programma da cui prendere il file, in un riquadro chiuso. */
function SourceSteps({ source }: { source: 'playnite' | 'launchbox' }) {
  const t = useTranslations('account.csvImport');
  const steps = t.raw(`${source}.steps`) as string[];

  return (
    <AccordionItem value={source}>
      <AccordionTrigger>{t(`${source}.title`)}</AccordionTrigger>
      <AccordionContent>
        <YStack gap={8} pb={8}>
          {steps.map((step, index) => (
            <XStack key={step} gap={8}>
              <Text fontSize={13} lineHeight={18} color="$color11" width={16}>
                {index + 1}.
              </Text>
              <Text fontSize={13} lineHeight={18} color="$color12" shrink={1}>
                {step}
              </Text>
            </XStack>
          ))}
        </YStack>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Il resoconto, nello stesso dialogo: cosa è partito e cosa è rimasto fuori. */
function CsvImportReport({
  report,
  tag,
  onClose,
}: {
  report: Report;
  tag: string;
  onClose: () => void;
}) {
  const t = useTranslations('account.csvImport');
  const storeLabels = useStoreLabels();

  const noStore = Object.entries(report.noStore);
  const noStoreCount = noStore.reduce((sum, [, count]) => sum + count, 0);
  const nothing =
    report.queued.length === 0 && report.alreadyRunning.length === 0;

  const storeRow = (store: Store, detail: string) => {
    const brand = STORE_BRAND[store];
    return (
      <XStack key={store} items="center" gap={12}>
        {brand ? (
          <BrandIcon brand={brand} size={28} label={storeLabels[store]} />
        ) : (
          <YStack width={28} height={28} rounded={6} bg="$color4" />
        )}
        <YStack shrink={1}>
          <Text color="$color12">{storeLabels[store]}</Text>
          <Text fontSize={13} lineHeight={18} color="$color11">
            {detail}
          </Text>
        </YStack>
      </XStack>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('report.title')}</DialogTitle>
        <DialogDescription>
          {nothing ? t('report.nothing') : t('report.description', { tag })}
        </DialogDescription>
      </DialogHeader>

      <YStack gap={12}>
        {report.queued.map(({ store, entries }) =>
          storeRow(store, t('report.rows', { count: entries })),
        )}
        {report.alreadyRunning.map((store) =>
          storeRow(store, t('report.alreadyRunning')),
        )}
      </YStack>

      {(report.noPlatform > 0 || noStoreCount > 0) && (
        <YStack gap={4}>
          <Heading>{t('report.skippedTitle')}</Heading>
          {report.noPlatform > 0 && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              · {t('report.noPlatform', { count: report.noPlatform })}
            </Text>
          )}
          {noStoreCount > 0 && (
            <Text fontSize={13} lineHeight={18} color="$color11">
              ·{' '}
              {t('report.noStore', {
                count: noStoreCount,
                sources: noStore
                  .map(
                    ([source, count]) =>
                      `${source === '—' ? t('report.emptySource') : source} ${count}`,
                  )
                  .join(', '),
              })}
            </Text>
          )}
        </YStack>
      )}

      <DialogFooter>
        {report.tagId && report.queued.length > 0 && (
          <ButtonLink
            variant="outline"
            href={`/backlog?tags=${report.tagId}`}
            onClick={onClose}
          >
            {t('report.seeGames')}
          </ButtonLink>
        )}
        <Button onClick={onClose}>{t('report.close')}</Button>
      </DialogFooter>
    </>
  );
}
