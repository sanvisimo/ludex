# Midnight Cue — mappa proposta dei token

Stato: **mappa approvata e applicata ai token runtime il 10/11/2026**.
Riferimento: preview del backlog con schede più neutre, filtri viola tenui e
azione primaria viola piena (10/11/2026). Il marchio approvato è già integrato.

## Riscontri nel codice

- `packages/ui/src/palettes.ts`: base Radix slate/slateDark, un accento teal,
  quattro stati indipendenti red/green/amber/blue.
- `packages/ui/src/themes.ts`: `createV5Theme`, sottotemi di stato, nessun tema
  di componente. L'accento selezionato genera un solo set di temi.
- Il template v5 mappa `background` al passo **2** (non al primo).
  `Card` usa esplicitamente `color2`: pagina e scheda hanno oggi lo stesso fondo.
- `Button.default` usa `accent9`, `accent10` in hover, `accent8` in pressione;
  testo `black1`. I colori di queste tre superfici non condividono automaticamente
  lo stesso contrasto quando si cambia scala.
- `backlog-filters.tsx` usa `Button.default` per ogni stato attivo e imposta
  nero anche sul testo e sull'icona figli: non basta cambiare il colore del Button.
- Input e controlli outline usano `color9` per il contorno, non `borderColor`.
- `apps/web/src/globals.css` contiene variabili Tailwind autonome, attualmente
  neutre: vanno collegate agli stessi ruoli, altrimenti le due UI divergono.

## Scale primitive proposte

Scale originali a dodici passi compatibili con il generatore esistente;
**non** sono le scale Radix originali e non ereditano le loro garanzie di contrasto.
Le verifiche sotto riguardano le combinazioni effettivamente proposte.

### Base navy / neutra

| Passo | Scuro     | Chiaro    | Ruolo proposto        |
| ----- | --------- | --------- | --------------------- |
| 1     | `#0D1020` | `#FDFDFF` | Base profonda         |
| 2     | `#101426` | `#F5F6FF` | Pagina                |
| 3     | `#1A1E2B` | `#EDEFF7` | Scheda / superficie   |
| 4     | `#232737` | `#E3E6F0` | Hover superficie      |
| 5     | `#2B3041` | `#D8DDEB` | Press superficie      |
| 6     | `#343A4E` | `#C9D0E1` | Superficie secondaria |
| 7     | `#424A61` | `#B6BFD3` | Separatore marcato    |
| 8     | `#59637E` | `#9BA8C2` | Contorno intermedio   |
| 9     | `#6C7794` | `#7A87A2` | Bordo controllo       |
| 10    | `#8C96AF` | `#68758F` | Hover bordo           |
| 11    | `#B9BED2` | `#525E78` | Testo secondario      |
| 12    | `#F5F6FF` | `#101426` | Testo principale      |

Il fondo mantiene Midnight Cue; le schede sono charcoal freddo, più neutro di
`#1C2540` della prima proposta. Il bianco puro non è necessario nel tema chiaro.
I bordi decorativi delle schede possono essere tenui; i bordi che identificano
un controllo usano il passo 9, misurato separatamente.

### Viola

| Passo | Scuro     | Chiaro    | Ruolo proposto           |
| ----- | --------- | --------- | ------------------------ |
| 1     | `#141127` | `#FDFCFF` | Base                     |
| 2     | `#1B1731` | `#F7F5FF` | Superficie molto tenue   |
| 3     | `#29243F` | `#EFEBFF` | Selezione tenue          |
| 4     | `#352D55` | `#E4DDFF` | Hover selezione          |
| 5     | `#42366C` | `#D7CDFF` | Press selezione          |
| 6     | `#514384` | `#C4B5FA` | Tinta intermedia         |
| 7     | `#66589F` | `#AA98EE` | Bordo intermedio         |
| 8     | `#8172C1` | `#8D78DD` | Bordo selezionato        |
| 9     | `#8B7CFF` | `#6654C9` | Azione primaria          |
| 10    | `#9C90FF` | `#5945B8` | Hover azione             |
| 11    | `#B8AEFF` | `#5541AD` | Testo selezionato / link |
| 12    | `#E5E1FF` | `#2E215B` | Testo forte su tinta     |

Nel tema scuro il passo 9 coincide con il viola del marchio. Nel tema chiaro
la UI usa una variante più scura per il testo chiaro sul pulsante e per il focus.
Il viola del logo resta invariato: la variante UI non ridisegna il marchio.
Il passo 8 serve al bordo della selezione, **non** alla pressione del pulsante
primario. Per quella sono indicati valori dedicati sotto.

## Mappa semantica e corrispondenza CSS

I ruoli nuovi sono ora dichiarati in `packages/ui/src/themes.ts`.

| Ruolo                       | Tamagui                                                   | CSS/Tailwind                                                | Sorgente scuro / chiaro                    |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Pagina                      | `background` esistente                                    | `--background`                                              | base 2                                     |
| Testo principale            | `color12` / `color` esistenti                             | `--foreground`, `--card-foreground`, `--popover-foreground` | base 12                                    |
| Testo secondario            | `color11` esistente                                       | `--muted-foreground`                                        | base 11                                    |
| Superficie                  | **`surface` nuovo**                                       | `--card`, `--popover`                                       | base 3                                     |
| Hover superficie            | **`surfaceHover` nuovo**                                  | ruoli di componente                                         | base 4                                     |
| Press superficie            | **`surfacePress` nuovo**                                  | ruoli di componente                                         | base 5                                     |
| Superficie secondaria       | **`surfaceSecondary` nuovo**                              | `--secondary`, `--muted`                                    | base 6 / base 4                            |
| Testo su secondaria         | `color12`                                                 | `--secondary-foreground`                                    | base 12                                    |
| Bordo decorativo            | `borderColor` generato                                    | `--border`                                                  | base 4 nel tema base; rimisurare sottotemi |
| Bordo controllo             | `color9` esistente                                        | `--input`                                                   | base 9                                     |
| Hover bordo controllo       | `color10` esistente                                       | ruoli di componente                                         | base 10                                    |
| Azione                      | **`actionBackground` nuovo**                              | `--primary`                                                 | viola 9                                    |
| Hover azione                | **`actionBackgroundHover` nuovo**                         | ruoli di componente                                         | viola 10                                   |
| Press azione                | **`actionBackgroundPress` nuovo**                         | ruoli di componente                                         | `#8072EC` / `#5C49BB`                      |
| Testo e icona azione        | **`actionColor` nuovo**                                   | `--primary-foreground`                                      | `#101426` / `#F5F6FF`                      |
| Selezione tenue             | **`selectionBackground` nuovo**                           | `--accent`                                                  | viola 3                                    |
| Hover selezione             | **`selectionBackgroundHover` nuovo**                      | ruoli di componente                                         | viola 4                                    |
| Press selezione             | **`selectionBackgroundPress` nuovo**                      | ruoli di componente                                         | viola 5                                    |
| Testo e icona selezionati   | **`selectionColor` nuovo**                                | `--accent-foreground`                                       | viola 11                                   |
| Bordo selezione             | **`selectionBorder` nuovo**                               | ruoli di componente                                         | viola 8                                    |
| Bordo selezione hover/press | **`selectionBorderHover` / `selectionBorderPress` nuovi** | ruoli di componente                                         | viola 9                                    |
| Focus tastiera              | `outlineColor` esplicito                                  | `--ring`                                                    | viola 9                                    |

Non sostituire `black1` o il generico `accentBackground` globalmente: altri
componenti li usano con significati diversi. Cambiare gli usi specifici del
primario e dei filtri. Lo stesso vale per `color2`: è un livello della scala,
non un alias della nuova superficie.

`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`,
`--sidebar-primary-foreground`, `--sidebar-accent`,
`--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` seguiranno,
rispettivamente, superficie, testo, azione e sua controparte, selezione e sua
controparte, bordo, focus. Non introducono una nuova sidebar.
I grafici mantengono i significati esistenti: nessuna assegnazione automatica
alternata viola/aqua/ambra alle serie.

## Stati di componente

| Elemento               | Normale                                                | Hover                    | Pressione                | Focus                                 |
| ---------------------- | ------------------------------------------------------ | ------------------------ | ------------------------ | ------------------------------------- |
| Azione primaria        | actionBackground + actionColor                         | actionBackgroundHover    | actionBackgroundPress    | anello outlineColor 2 px, staccato    |
| Filtro selezionato     | selectionBackground + selectionColor + selectionBorder | selectionBackgroundHover | selectionBackgroundPress | anello outlineColor                   |
| Filtro non selezionato | neutro, bordo color9, testo color12                    | superficie tenue         | superficie più marcata   | anello outlineColor                   |
| Scheda interattiva     | surface                                                | surfaceHover             | surfacePress             | anello solo se attivabile da tastiera |
| Campo                  | fondo attuale, testo color12, bordo color9             | bordo color10            | n/a                      | bordo viola e anello                  |
| Elemento disabilitato  | opacità e comportamento esistenti                      | nessuna nuova enfasi     | nessuna azione           | comportamento accessibile esistente   |

Per i filtri, introdurre una variante condivisa `selection` del Button;
aggiornare anche icone e Text figli ora impostati a `black1`. `aria-pressed` e
la logica di selezione restano gli indicatori di stato accessibili.
Controllare `ToggleGroupItem`: la vista scelta ora usa un neutro; la proposta
è usare il medesimo ruolo di selezione tenue. Nessun colore scelto per singola pagina.
Le superfici del backlog compatto che usano `color2` vanno verificate insieme
alle Card per mantenere coerenza fra viste.

## Accenti riservati

- Aqua `#4DDED3`: marchio e futuro motore decisionale; non assegnarlo a stati
  di successo. Nessun badge Consigliato aggiunto al backlog attuale.
- Ambra `#FFBE69`: eventuale evidenza di un gioco scelto; non assegnarla a ogni
  selezione e non sostituire la scala `states.amber` degli avvisi.
- Per testo aqua/ambra su superfici chiare serviranno varianti scure dedicate
  quando esisteranno componenti che le usano: non dichiararle ora accessibili
  solo perché i colori del marchio funzionano sul navy.
- Errore, successo, avviso e informazione: restano le quattro scale di stato.

## Contrasti calcolati

Calcolo di luminanza relativa sRGB e rapporto `(Lchiaro + .05)/(Lscuro + .05)`.
Rapporti dei colori piatti: non includono opacità di elementi disabilitati,
antialias dei glifi, fotografie o un audit completo delle schermate.

| Coppia (testo o bordo / sfondo)                                    | Rapporto |
| ------------------------------------------------------------------ | -------: |
| Primario scuro: navy / viola                                       |   5,59:1 |
| Hover primario scuro: navy / viola hover                           |   6,82:1 |
| Press primario scuro: navy / `#8072EC`                             |   4,81:1 |
| Primario chiaro: soft white / viola scuro                          |   5,31:1 |
| Hover primario chiaro: soft white / viola hover                    |   6,57:1 |
| Press primario chiaro: soft white / `#5C49BB`                      |   6,24:1 |
| Testo selezionato scuro / tinta tenue                              |   7,43:1 |
| Testo selezionato chiaro / tinta tenue                             |   6,55:1 |
| Bordo selezione scuro / tinta tenue                                |   3,60:1 |
| Bordo selezione chiaro / tinta tenue                               |   3,07:1 |
| Bordo controllo scuro / superficie                                 |   3,72:1 |
| Bordo controllo chiaro / pagina                                    |   3,36:1 |
| Testo secondario scuro / scheda                                    |   8,98:1 |
| Testo secondario chiaro / scheda                                   |   5,66:1 |
| Soft white / viola del marchio (**da evitare sui pulsanti scuri**) |   3,04:1 |

Le coppie di testo elencate superano 4,5:1; quelle di bordo elencate 3:1.
In hover e pressione il bordo selezionato passa al viola 9: il passo 8 non
resterebbe sopra 3:1 contro tutte le tinte più marcate. Le misure aggiuntive
sono riportate sotto. Overlay e sottotemi richiedono verifica sui componenti reali. Dopo la modifica,
verificare contrasto e stati nei componenti reali, tema di sistema e mobile.

## Implementazione

1. Inserire le due scale in `palettes.ts`, accento viola predefinito unico,
   senza generare un secondo set teal inutilizzato.
2. In `themes.ts` mantenere il generatore e aggiungere i ruoli semantici,
   senza usare hex nei componenti. Rispettare l'ereditarietà dei sottotemi.
3. Applicare i ruoli a Card, Button, filtri e viste selezionate; ricontrollare
   checkbox, switch, slider e badge che dipendono dall'accento.
4. Collegare il CSS transitorio alla stessa sorgente, preferibilmente mediante
   variabili Tamagui (verificandone i nomi effettivamente emessi), evitando una
   seconda lista autonoma di hex. Il CSS caricato prima dei temi deve avere un
   fallback coerente anche per SSR e preferenza di sistema.
5. Aggiornare le due meta theme-color della pagina con i fondi effettivi;
   rivedere le assunzioni teal nei commenti/storie/documentazione.
6. Verificare Storybook/axe, build/typecheck, backlog nei due temi e nelle viste,
   cambio Sistema da sloggato, viewport stretto e contrasto dei controlli.

### Contrasti aggiuntivi degli stati

| Coppia                              | Rapporto |
| ----------------------------------- | -------: |
| Testo selezionato scuro, hover      |   6.36:1 |
| Testo selezionato scuro, pressione  |   5.33:1 |
| Testo selezionato chiaro, hover     |   5.86:1 |
| Testo selezionato chiaro, pressione |   5.12:1 |
| Bordo selezionato scuro, hover      |   3.88:1 |
| Bordo selezionato scuro, pressione  |   3.25:1 |
| Bordo selezionato chiaro, hover     |   4.38:1 |
| Bordo selezionato chiaro, pressione |   3.83:1 |
| Focus scuro / pagina                |   5.59:1 |
| Focus scuro / scheda                |   5.08:1 |
| Focus chiaro / pagina               |   5.31:1 |
| Focus chiaro / scheda               |   4.98:1 |

I temi base preservano gli HEX esatti per evitare gli arrotondamenti HSL del
generatore; i sottotemi di stato continuano a essere generati. Gli stati dei
primari sono stati misurati anche nel browser con i valori CSS renderizzati.

### Riscontri della revisione web

- Il footer e i titoli attenuati dei giochi correlati usano `color11`, senza
  abbassare l’opacità del testo. Le copertine non possedute restano attenuate.
- Il residuo Tailwind `text-destructive` punta a `red11` (testo d’errore);
  il vecchio `red9` era sotto soglia sul fondo chiaro. I componenti Tamagui
  di errore continuano a usare i propri ruoli di stato.
- Le checkbox HTML dei tag usano `accent-primary`, alias dell’azione viola.
- L’illustrazione Nintendo usa la coppia `red3`/`red12` per il testo decorativo.

Esiti e limiti: [audit web](web-audit/README.md).
