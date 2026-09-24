/**
 * Cosa ottimizza `tamagui build`, la CLI che in produzione sta davanti a
 * `next build` (vedi lo script `build`).
 *
 * Su Next 16 il compilatore di Tamagui non si monta come plugin: Turbopack
 * plugin di bundler non ne accetta. La CLI fa lo stesso lavoro prima della
 * build — appiattisce i componenti e ne estrae lo stile in CSS atomico —
 * riscrivendo i sorgenti sul posto e rimettendoli com'erano alla fine.
 *
 * `config` punta al design system e non a una copia: è lo stesso oggetto che
 * monta `app/providers.tsx`. `components` dice all'estrattore dove stanno i
 * componenti da riconoscere nelle schermate.
 */
export default {
  components: ['@repo/ui'],
  config: '../../packages/ui/src/config.ts',
};
