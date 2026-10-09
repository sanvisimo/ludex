# Dati mancanti: la tabella si aggiorna da sola

**Approvato il 09/10/2026.** Branch `claude/happy-gates-tcls9x`.

## Contesto

In `/admin/missing` il riepilogo («In coda 1») resta quello in cache (`staleTime`
30 s) mentre la lista, che ha una chiave nuova a ogni cambio di tab, si legge
fresca. Dopo «Inserisci id» il job di HLTB finisce in pochi secondi: il chip dice
1 e la lista è vuota.

Gli aggiornamenti in push esistono già (`lib/events.ts`, `use-live-updates.ts`),
ma l'unico evento è `games`, e parte solo quando un enrichment finisce `ok`. Un
`not_found` o un `failed` non manda niente, e il browser rilegge backlog e home,
non l'admin.

## Decisione

Eventi e non polling. Le righe riaperte da un appid nuovo restano `pending` fino
alla spazzata (6 ore), come quelle di OpenCritic fino al budget del giorno: è
attesa, non un guasto, e la tabella ferma è giusta. **Non** si accoda alla
riapertura.

## Passi

1. Evento `sources`, senza dati: `LiveEventSchema` in contracts e `RelayedEvent`;
   `eventForUser` lo lascia passare a tutti, come `games`.
2. Il worker lo manda a ogni job `enrich` concluso, con qualunque esito
   (`completed` e `failed` del Worker), raggruppato: al più uno ogni 2 secondi.
3. `use-live-updates.ts` invalida `api.admin.missing.key()` su `sources` e alla
   riconnessione.
4. Test di `eventForUser` per il nuovo evento.

## Verifica

`/admin/missing` su HLTB, «Inserisci id» su un gioco, tab «In coda»: entro un
paio di secondi dalla fine del job il chip scende e la riga sparisce, senza
ricaricare.
