import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Put every page's title and link-preview tags in the first bytes of the page for every
  // visitor, not only for the chat apps Next.js knows by name. The only page that works its
  // tags out per request is a room link, and that takes no time.
  htmlLimitedBots: /.*/,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
