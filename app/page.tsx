"use client";
import Link from "next/link";
import { TOOLS, CATEGORIES } from "@/src/lib/tools-registry";

export default function Home() {
  return (
    <div className="grid gap-4">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">125 developer tools, private by design</h1>
        <p className="text-[#87867F] mt-1">Format, convert, validate, diagram – all client-side. Search below, open any tool for a guided walkthrough.</p>
        <input id="home-search" placeholder="Search tools… (e.g. json, base64, cron)" className="mt-3 w-full p-3 text-sm"
          onChange={(e) => {
            const q = e.currentTarget.value.toLowerCase();
            document.querySelectorAll("[data-tool]").forEach((el) => {
              const t = (el as HTMLElement).dataset.tool || "";
              (el as HTMLElement).style.display = t.includes(q) ? "" : "none";
            });
          }} />
      </section>
      {CATEGORIES.map((c) => (
        <section key={c.slug}>
          <h2 className="font-semibold mb-2">{c.title} <span className="text-xs text-[#87867F]">{c.blurb}</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TOOLS.filter((t) => t.category === c.title).map((t) => (
              <Link key={t.slug} href={`/tools/${t.slug}`} data-tool={`${t.title.toLowerCase()} ${t.slug} ${t.description.toLowerCase()}`} className="card p-3 hover:border-[#D97757]">
                <p className="font-medium text-sm">{t.title}</p>
                <p className="text-xs text-[#87867F]">{t.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
