import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.gr-assets.com" },
      { protocol: "https", hostname: "covers.openlibrary.org" },   // estimated books
    ],
  },
};

export default nextConfig;
