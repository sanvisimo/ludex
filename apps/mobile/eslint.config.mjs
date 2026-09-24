import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // `metro.config.js` è CommonJS, come Metro lo vuole; l'output di
  // `expo export` è generato.
  { ignores: ["metro.config.js", "dist/**", ".expo/**"] },
  ...config,
];
