import { Suspense } from "react";
import { notFound } from "next/navigation";
import ToolIndex from "@/src/components/ToolIndex";
import { CATEGORIES, categoryBySlug } from "@/src/lib/tools-registry";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export function generateMetadata({ params }: { params: { category: string } }) {
  const c = categoryBySlug(params.category);
  if (!c) return {};
  return { title: `${c.title} — Formatter`, description: c.blurb };
}

/** The index page with the chip pre-selected. No second template. */
export default function CategoryPage({ params }: { params: { category: string } }) {
  if (!categoryBySlug(params.category)) notFound();
  return (
    <Suspense>
      <ToolIndex category={params.category} />
    </Suspense>
  );
}
