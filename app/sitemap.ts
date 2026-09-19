import { MetadataRoute } from "next";
import { TOOLS } from "@/src/lib/tools-registry";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://formatter.example.com";
  return [{ url: base, lastModified: new Date() }, ...TOOLS.map((t) => ({ url: `${base}/tools/${t.slug}`, lastModified: new Date() }))];
}
