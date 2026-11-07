import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const config: NextConfig = {
  transpilePackages: ["@places/domain", "@places/contracts", "@places/ui"],
  // the API is reached through the same origin, so the session cookie is first-party
  async rewrites() { return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:4000"}/api/:path*` }]; },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      // 13.3: the API sends these through helmet, the pages didn't (browsers ignore HSTS on plain-http localhost)
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ] }];
  },
};
// the language of each request: src/i18n/request.ts
export default createNextIntlPlugin("./src/i18n/request.ts")(config);
