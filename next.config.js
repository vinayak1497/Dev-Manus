/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow an isolated build/output directory when NEXT_BUILD_DIR is set, so a
  // verification build can run without colliding with a live `next dev` server
  // that holds the default `.next`. Normal dev/build (env unset) is unaffected.
  ...(process.env.NEXT_BUILD_DIR ? { distDir: process.env.NEXT_BUILD_DIR } : {}),
};

module.exports = nextConfig;
