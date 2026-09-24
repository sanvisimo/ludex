# Il mobile, per provarlo

Due domande diverse, in quest'ordine: **provare l'app sul telefono mentre la si
sviluppa**, e **testare in automatico il codice mobile** — l'equivalente di ciò
che Storybook e vitest fanno per il web.

Il contesto che decide: il telefono è un **Pixel 9a con GrapheneOS**, e si
sviluppa su **Windows dentro WSL2**.

## 1. Sul telefono — fatto

WSL2 sta dietro un NAT: il telefono non raggiunge Metro sulla rete locale. Tre
strade valutate:

- **USB + `adb reverse`** — scelta. `adb.exe` di Windows inoltra la 8081 del
  telefono al PC, e Windows la passa a WSL da solo. Non dipende dalla rete, ed è
  quella che regge anche dopo: l'API sarà un secondo `adb reverse tcp:3005`, e
  il telefono la troverà su `localhost:3005`.
- **Tunnel** (`expo start --tunnel`, ngrok): tenuto come ripiego, senza cavo ma
  più lento e dipendente da internet.
- **Rete mirrored di WSL** (`networkingMode=mirrored`): scartata qui perché è
  configurazione della macchina e non del repo.

Nel repo: in [apps/mobile/package.json](../apps/mobile/package.json)
`start:usb` (`${ADB:-adb.exe} reverse tcp:8081 tcp:8081`, poi `expo start
--localhost`) e `start:tunnel`, con `@expo/ngrok` fra le devDependency perché
Expo non chieda di installarlo al primo uso. Nel CLAUDE.md, sotto «Ambiente».

Verificato nel container, dove telefono e Windows non ci sono: con `ADB=echo`
lo script parte, il manifest punta a `127.0.0.1:8081` — cioè dove `adb reverse`
porta il telefono — e il server di sviluppo serve il bundle Android. La catena
USB → Windows → WSL e Expo Go sul Pixel restano da provare sul posto.

Da fare una volta sul telefono: opzioni sviluppatore e debug USB, ed Expo Go —
su GrapheneOS dal Play Store in sandbox o dall'APK di expo.dev.

### Cosa viene dopo, e non si fa adesso

- **L'API dal telefono**: `adb reverse tcp:3005`, `EXPO_PUBLIC_API_URL` a
  `http://localhost:3005`, e il plugin Expo di Better Auth per tenere la
  sessione (i cookie del browser lì non ci sono). Quando l'app chiamerà l'API.
- **La build di sviluppo**: alla prima libreria nativa che Expo Go non contiene.
  È lì che va decisa `react-native-reanimated@4.7.0`, che arriva con
  `@tamagui/config` e non corrisponde alla 4.5.1 di Expo (vedi il passo 5 del
  [12a](12a-design-system.md)).

## 2. Test automatici — da pianificare
