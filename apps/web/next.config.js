import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // I package interni esportano sorgente TypeScript, non build compilate.
  transpilePackages: [
    "@repo/auth",
    "@repo/contracts",
    "@repo/ui",
    "react-native-web",
  ],
  images: {
    // Le copertine sono servite dalla CDN di IGDB.
    remotePatterns: [{ protocol: "https", hostname: "images.igdb.com" }],
  },
  // Il design system è universale: i suoi componenti importano
  // `react-native`, che sul web è `react-native-web`. È ciò che su Vite fa
  // `tamaguiAliases({ svg: true })` in `packages/ui/.storybook/main.ts`,
  // scritto per Turbopack, che plugin di bundler non ne accetta.
  turbopack: {
    resolveAlias: {
      "react-native": "react-native-web",
      // Le icone disegnano in SVG: sul web basta quello del DOM, non la
      // libreria per telefoni. Vedi il commento in `.storybook/main.ts`.
      "react-native-svg": "@tamagui/react-native-svg",
    },
    // I gemelli `.web.*` prima degli altri, come fanno Metro e webpack.
    resolveExtensions: [
      ".web.tsx",
      ".web.ts",
      ".web.mjs",
      ".web.js",
      ".tsx",
      ".ts",
      ".mjs",
      ".js",
      ".json",
    ],
  },
};

// Senza argomenti cerca `./i18n/request.ts`, che è dove sta la configurazione.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
