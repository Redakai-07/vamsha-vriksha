import type { NextConfig } from "next";

/**
 * Vamsha-Vriksha is an offline-first application.
 *
 * `output: "export"` produces a fully static bundle in `out/`, which means:
 *  - the app shell can be precached by the service worker and served with no
 *    network at all (the primary product requirement), and
 *  - the same `out/` directory can be dropped straight into a Capacitor
 *    Android/iOS shell later (see `capacitor.config.json`).
 *
 * Because of that there is no server runtime: no route handlers, no server
 * actions, no server-only APIs. All persistence happens in IndexedDB.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  // `next export` cannot run the Image Optimization API.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
