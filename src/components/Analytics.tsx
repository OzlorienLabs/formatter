import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// Page-view analytics only: tool input never leaves the tab, these see URLs and nothing else.
// Vercel Web Analytics is served from this origin (/_vercel/insights) once enabled in the
// Vercel dashboard; it tracks client-side navigations on its own and is a no-op in dev.
export default function Analytics() {
  return (
    <>
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
      {process.env.NODE_ENV === "production" && (
        <>
          <Script id="vercel-analytics-queue" strategy="afterInteractive">
            {`window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };`}
          </Script>
          <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
        </>
      )}
    </>
  );
}
