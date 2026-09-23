import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // L'output di `build-storybook`: codice generato, non nostro.
  { ignores: ["storybook-static/**"] },
  ...config,
];
