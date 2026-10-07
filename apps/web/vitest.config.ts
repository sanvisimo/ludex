import { defineConfig } from 'vitest/config';

// Solo la logica pura di `lib/`: conversioni dei filtri, numeri per pagina, ore
// giocate. Niente browser e niente DOM, e non carica `vite.config.ts` (il
// compilatore di Tamagui e il plugin di TanStack Start non servono a nessun
// test). Le schermate si provano a occhio; un test sui componenti sarebbe
// un'altra cosa, con un altro ambiente.
export default defineConfig({
  // I `.ts` prima dei `.js`, come in `apps/api`: un `tsc file.ts` lanciato a mano
  // scrive un `.js` accanto al sorgente, e con l'ordine di default vitest
  // caricherebbe quello.
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
