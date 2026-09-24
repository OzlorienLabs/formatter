import "./globals.css";
import { Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import { AppStateProvider } from "@/src/components/AppState";
import Shell from "@/src/components/Shell";

// Self-hosted by next/font — no runtime font fetch, so offline still works.
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
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
