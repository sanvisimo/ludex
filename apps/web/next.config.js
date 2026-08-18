/** @type {import('next').NextConfig} */
const nextConfig = {
  // I package interni esportano sorgente TypeScript, non build compilate.
  transpilePackages: ["@repo/auth", "@repo/contracts"],
  images: {
    // Le copertine sono servite dalla CDN di IGDB.
    remotePatterns: [{ protocol: "https", hostname: "images.igdb.com" }],
  },
};

export default nextConfig;
