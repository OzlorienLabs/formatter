import { DUOTONE, FILL } from "./icon-data";
import { FALLBACK_ICON } from "./icons";
import { toolBySlug } from "@/src/lib/tools-registry";

type Props = {
  /** A tool slug — its Phosphor name is resolved from the registry. */
  slug?: string;
  /** Or a Phosphor name directly, for chrome icons that belong to no tool. */
  name?: string;
  size?: number;
  color?: string;
  weight?: "duotone" | "fill";
  className?: string;
  /** Icons are decoration unless they carry a label of their own. */
  label?: string;
};

/**
 * The one place an icon is resolved. Duotone is the house weight; the SVG
 * markup is pre-rendered into icon-data.ts so the icon library itself never
 * ships to the browser.
 */
export default function ToolIcon({ slug, name, size = 20, color = "currentColor", weight = "duotone", className, label }: Props) {
  const key = name ?? (slug ? toolBySlug(slug)?.icon : undefined) ?? FALLBACK_ICON;
  const markup = (weight === "fill" && FILL[key]) || DUOTONE[key] || DUOTONE[FALLBACK_ICON];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={color}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      style={{ flex: "none", color }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
