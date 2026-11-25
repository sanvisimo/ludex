import { mobileBoundary } from '@repo/eslint-config/boundaries';
import { config } from '@repo/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config[]} */
export default [
  // `metro.config.js` e i config plugin sono CommonJS, come li vogliono Metro
  // e `expo prebuild`; l'output di `expo export` e `android/` sono generati.
  {
    ignores: [
      'metro.config.js',
      'plugins/**',
      'dist/**',
      '.expo/**',
      'android/**',
    ],
  },
  ...config,
  // Niente @repo/db né next/*: vedi boundaries.js.
  ...mobileBoundary,
];
