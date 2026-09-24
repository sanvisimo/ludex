import { nextJsConfig } from "@repo/eslint-config/next-js";
import { globalIgnores } from "eslint/config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // La config che `tamagui build` impacchetta a ogni build: generata, non nostra.
  globalIgnores([".tamagui/**"]),
];
