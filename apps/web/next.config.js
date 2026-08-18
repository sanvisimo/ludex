import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // I package interni esportano sorgente TypeScript, non build compilate.
  transpilePackages: ["@repo/auth", "@repo/contracts"],
  images: {
    // Le copertine sono servite dalla CDN di IGDB.
    remotePatterns: [{ protocol: "https", hostname: "images.igdb.com" }],
  },
};

// Senza argomenti cerca `./i18n/request.ts`, che è dove sta la configurazione.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
