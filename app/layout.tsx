import "./globals.css";
import Link from "next/link";
import { CATEGORIES } from "@/src/lib/tools-registry";

export const metadata = {
  title: "Formatter DevTools – 125 client-only developer tools",
  description: "JSON, encoding, converters, validators, SQL, security, diagrams – 100% in your browser. Vercel-ready.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[#D1CFC5] bg-white sticky top-0 z-10">
          <div className="max-w-[1200px] mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/" className="font-bold">Formatter DevTools</Link>
            <span className="chip text-xs px-2 py-1">100% client-only</span>
            <nav className="ml-auto flex gap-3 text-sm">
              <Link href="/pipelines">Pipelines</Link>
              <Link href="/workspaces">Workspaces</Link>
              <Link href="/recipes">Recipes</Link>
              <Link href="/about/privacy">Privacy</Link>
            </nav>
          </div>
        </header>
        <div className="max-w-[1200px] mx-auto px-4 grid md:grid-cols-[220px_1fr] gap-4 py-4">
          <aside className="hidden md:block">
            <div className="card p-3 sticky top-20">
              <p className="text-xs uppercase text-[#87867F] mb-2">Categories</p>
              <ul className="space-y-1 text-sm">
                {CATEGORIES.map((c) => (
                  <li key={c.slug}><Link className="hover:underline" href={`/categories/${c.slug}`}>{c.title}</Link></li>
                ))}
              </ul>
            </div>
          </aside>
          <main>{children}</main>
        </div>
        <footer className="border-t border-[#D1CFC5] mt-8">
          <div className="max-w-[1200px] mx-auto px-4 py-6 text-sm text-[#87867F] flex flex-wrap gap-3">
            <span>Runs 100% in your browser – no uploads.</span>
            <Link href="/about/privacy" className="underline">Privacy</Link>
            <a className="underline" href="https://formatkit.dev/#tools">Inspired by FormatKit</a>
            <a className="underline" href="https://www.devtoolsdaily.com/">Inspired by DevToolsDaily</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
