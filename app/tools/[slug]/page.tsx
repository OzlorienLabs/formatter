import { TOOLS, toolBySlug } from "@/src/lib/tools-registry";
import ToolShell from "@/src/components/ToolShell";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const t = toolBySlug(params.slug);
  if (!t) return {};
  return {
    title: `${t.title} – Formatter DevTools`,
    description: `${t.description} Runs 100% client-side.`,
  };
}

export default function ToolPage({ params }: { params: { slug: string } }) {
  const tool = toolBySlug(params.slug);
  if (!tool) notFound();
  const related = TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug).slice(0, 3);
  return (
    <div className="grid gap-3">
      <nav className="text-xs text-[#87867F]"><Link href="/">Home</Link> / {tool.category} / <strong className="text-[#141413]">{tool.title}</strong></nav>
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold">{tool.title}</h1>
        <span className="chip text-xs px-2 py-1">Runs 100% in your browser</span>
      </div>
      <p className="text-sm text-[#87867F]">{tool.description}</p>
      <ToolShell tool={tool} />
      <div className="card p-4">
        <h2 className="font-semibold text-sm mb-2">Related tools</h2>
        <div className="flex gap-2 flex-wrap">
          {related.map((r) => <Link key={r.slug} href={`/tools/${r.slug}`} className="chip px-3 py-1 text-sm">{r.title}</Link>)}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "HowTo", name: tool.title, description: tool.description, step: tool.guideSteps.map((s) => ({ "@type": "HowToStep", text: s })) }) }} />
    </div>
  );
}
