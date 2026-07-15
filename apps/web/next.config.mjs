/** @type {import('next').NextConfig} */
const nextConfig = {
  // @blackbox/core ships as TypeScript source (no build step); let Next compile it.
  transpilePackages: ["@blackbox/core"],
};

export default nextConfig;
