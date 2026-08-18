/** @type {import('next').NextConfig} */
const nextConfig = {
  // I package interni esportano sorgente TypeScript, non build compilate.
  transpilePackages: ["@repo/auth", "@repo/contracts"],
};

export default nextConfig;
