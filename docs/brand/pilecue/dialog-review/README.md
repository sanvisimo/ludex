# Revisione dialog — 12 novembre 2026

Direzione approvata in chat, implementata nel componente condiviso e nelle
prime dialog di dettaglio. Piano: [revisione-dialog](../../../../plans/revisione-dialog.md).

## Aspetto

- Tre larghezze, titoli di 20 px, padding di 24/20 px e chiusura fuori dallo scroll.
- Footer sticky sul web e focus restituito anche senza Dialog.Trigger.
- Durate con accenti blu/viola e avvisi distinti per poche segnalazioni.
- Voti raggruppati per fonte e piattaforma, con icone hardware già distribuite
  nel progetto e badge rosso/ambra/verde su 100. I colori seguono il valore
  arrotondato: sotto 50, da 50 a 74, da 75. Fonti e link conservati.
- Copie con piattaforma, account e abbonamento separati, mantenendo i tooltip.

## Verifiche

Typecheck e lint web/UI, build di produzione client/server. 17 storie UI
in Chromium: dialog, moduli lunghi, ritorno del focus, menu verso dialog e galleria.

36 casi browser con i componenti reali montati su una pagina temporanea,
poi rimossa, con dati di esempio: nessuna lettura o scrittura su dati utente.
Temi chiaro/scuro a 1440, 768, 390 e 320 px; dettagli, copie, modulo lungo e
rinomina. Casi aggiuntivi in inglese con durate/voti mancanti, dati non ancora
recuperati, gioco senza fine e senza collegamento IGDB. Controllati margini,
overflow, caricamento delle icone, Escape, focus e azioni durante lo scroll.
Nessuna violazione axe WCAG A/AA nelle dialog esaminate; nessun pageerror.
Il [report](report.json) distingue questi casi dalle storie UI.

Le prove non comprendono autenticazione o import dai negozi, né ogni singola
dialog dell'app. Le chiamate API e i dati rimangono quelli esistenti.

## Schermate

I dati sono di esempio, compresa una piattaforma sconosciuta per il fallback.

- Durata: [scuro desktop](durata-dark-1440.png), [chiaro desktop](durata-light-1440.png),
  [scuro telefono](durata-dark-390.png), [chiaro telefono](durata-light-390.png).
- Critica dopo lo scroll: [scuro desktop](critica-dark-1440.png), [chiaro desktop](critica-light-1440.png),
  [scuro telefono](critica-dark-390.png), [chiaro telefono](critica-light-390.png).
- Copie: [scuro](copie-dark-390.png), [chiaro](copie-light-390.png).

Lotto approvato dall'utente il 12 novembre 2026 e segnato come completato nella roadmap.

## Disposizione desktop approvata dopo la prova in uso

Da 1024 px la sola dialog durata/critica arriva a 960 px, con durata a sinistra
e critica a destra; titolo e nome del gioco sopra entrambe. Sotto il breakpoint
mantiene larghezza e disposizione precedenti.

14 controlli aggiuntivi in Chromium nei due temi, a 1440, 1024, 1023, 768, 390 e
320 px, più un caso con molte piattaforme. Verificati disposizione delle sezioni,
misure, assenza di overflow, axe, scorrimento, chiusura e ritorno del focus.
Con i dati di esempio standard la dialog desktop misura 960 × 826 px e mostra
il contenuto intero nel viewport alto 1000 px. Typecheck, lint e build web riusciti.
La pagina temporanea di verifica è stata rimossa; nessun dato utente modificato.

[Scuro desktop](desktop-columns-dark-1440.png) ·
[Chiaro desktop](desktop-columns-light-1440.png) ·
[Report dei 14 casi](desktop-columns-report.json).

Le schermate desktop precedenti documentano la prima versione a colonna singola.
