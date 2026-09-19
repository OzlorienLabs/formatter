import { ICONS, FALLBACK_ICON } from "./icons";
import { toolBySlug } from "@/src/lib/tools-registry";

type Props = {
  /** A tool slug — its Phosphor name is resolved from the registry. */
  slug?: string;
  /** Or a Phosphor name directly, for chrome icons that belong to no tool. */
  name?: string;
  size?: number;
  color?: string;
  weight?: "duotone" | "fill" | "regular";
  className?: string;
  /** Icons are decoration unless they carry a label of their own. */
  label?: string;
};

/**
 * The one place an icon is resolved. Duotone is the house weight; pages never
 * import from @phosphor-icons directly.
 */
export default function ToolIcon({
  slug,
  name,
  size = 20,
  color = "currentColor",
  weight = "duotone",
  className,
  label,
}: Props) {
  const key = name ?? (slug ? toolBySlug(slug)?.icon : undefined);
  const Cmp = (key && ICONS[key]) || FALLBACK_ICON;
  return (
    <Cmp
      size={size}
      color={color}
      weight={weight}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      style={{ flex: "none" }}
    />
  );
}
