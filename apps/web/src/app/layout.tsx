import type { Metadata, Viewport } from "next";
import "@places/ui/src/app.css";
import "@places/ui/src/mobile.css";
import "@places/ui/src/theme.css"; // design 2 «مخطط»: the architectural-sheet look, after app.css
import "./app.css";

export const metadata: Metadata = { title: "Places ERP", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

/** Light only for now (client decision); the dark tokens stay in app.css for later. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
