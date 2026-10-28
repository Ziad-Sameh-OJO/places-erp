import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@places/domain", "@places/contracts", "@places/ui"],
  // the API is reached through the same origin, so the session cookie is first-party
  async rewrites() { return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:4000"}/api/:path*` }]; },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ] }];
  },
};
export default config;
