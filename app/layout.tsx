import "./globals.css";
import localFont from "next/font/local";
import { AppStateProvider } from "@/src/components/AppState";
import Shell from "@/src/components/Shell";

// Self-hosted from @fontsource: no build-time or runtime font fetch, so offline works
// and builds never depend on a third-party server.
const serif = localFont({
  src: [
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  display: "swap",
  variable: "--font-serif",
  fallback: ["Georgia", "serif"],
});

const mono = localFont({
  src: [
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
  fallback: ["ui-monospace", "Menlo", "monospace"],
});

export const viewport = { themeColor: "#0088b0" };

export const metadata = {
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }] },
  title: "Formatter — 125 tools that never leave the tab",
  description:
    "JSON, encoding, converters, validators, SQL, security, diagrams — a hundred and twenty-five developer tools, every one of them running in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body>
        <AppStateProvider>
          <Shell>{children}</Shell>
        </AppStateProvider>
      </body>
    </html>
  );
}
