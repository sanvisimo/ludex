import { designSystemBoundary } from "@repo/eslint-config/boundaries";
import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // L'output di `build-storybook`: codice generato, non nostro.
  { ignores: ["storybook-static/**"] },
  ...config,
  // Niente next/*, @repo/contracts, @repo/db: vedi boundaries.js.
  ...designSystemBoundary,
];
