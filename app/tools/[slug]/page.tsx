import { notFound } from "next/navigation";
import ToolShell from "@/src/components/ToolShell";
import dynamic from "next/dynamic";

// Platform pages share the tool route; load them only where they are used.
const Pipelines = dynamic(() => import("@/src/components/platform/Pipelines"));
const Workspaces = dynamic(() => import("@/src/components/platform/Workspaces"));
const Recipes = dynamic(() => import("@/src/components/platform/Recipes"));
import { TOOLS, toolBySlug } from "@/src/lib/tools-registry";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const t = toolBySlug(params.slug);
  if (!t) return {};
  return {
    title: `${t.title} — Formatter`,
    description: `${t.description} Runs entirely in your browser.`,
  };
}

export default function ToolPage({ params }: { params: { slug: string } }) {
  const tool = toolBySlug(params.slug);
  if (!tool) notFound();
  return (
    <>
      {tool.slug === "tool-pipelines" ? <Pipelines /> : tool.slug === "saved-workspaces" ? <Workspaces /> : tool.slug === "developer-recipes" ? <Recipes /> : <ToolShell tool={tool} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: tool.title,
            description: tool.description,
            step: tool.guideSteps.map((s) => ({ "@type": "HowToStep", text: s })),
          }),
        }}
      />
    </>
  );
}
