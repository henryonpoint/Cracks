/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom + readability run only in Node route handlers, never bundled to the client.
  serverExternalPackages: ["jsdom", "@mozilla/readability"],
  async headers() {
    return [
      {
        // The service worker must be served from the root scope with no aggressive caching.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
