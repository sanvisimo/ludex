/**
 * L'iconografia: **lucide**, la stessa che `apps/web` già usava con
 * `lucide-react`, quindi il passaggio non cambia un disegno.
 *
 * Il pacchetto è `@tamagui/lucide-icons-2`, che rende su entrambe le
 * piattaforme perché sotto usa `react-native-svg`. Attenzione al nome: esiste
 * anche `@tamagui/lucide-icons` **senza** il `-2`, fermo a un `2.0.0-rc` di
 * marzo che pinna un `@tamagui/core` diverso dal nostro — due copie di core
 * nello stesso bundle, e il contesto del tema si spacca. Non è quello.
 *
 * Sta in un sottopercorso suo (`@repo/ui/icons`) e non in `index.ts` per un
 * motivo pratico: sono oltre millecinquecento nomi, e mescolarli ai quindici
 * componenti renderebbe illeggibile l'autocompletamento. Il tree-shaking
 * regge perché ogni icona è un modulo a sé.
 */
export * from '@tamagui/lucide-icons-2';
