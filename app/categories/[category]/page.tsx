import Link from "next/link";
import { CATEGORIES, TOOLS } from "@/src/lib/tools-registry";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  const cat = CATEGORIES.find((c) => c.slug === params.category);
  if (!cat) return <p>Unknown category</p>;
  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-bold">{cat.title}</h1>
      <p className="text-sm text-[#87867F]">{cat.blurb}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {TOOLS.filter((t) => t.category === cat.title).map((t) => (
          <Link key={t.slug} href={`/tools/${t.slug}`} className="card p-3">
            <p className="font-medium text-sm">{t.title}</p>
            <p className="text-xs text-[#87867F]">{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
