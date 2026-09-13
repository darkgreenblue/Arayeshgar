/**
 * Portfolio of past work. Feature-flagged, because a barber with no photos is better served by no gallery than an empty one.
 *
 * Split out of a single 284-line `index.tsx` where every section lived together. That file
 * was imported wholesale by all three themes, which is why all three rendered the same eight
 * sections in the same order — the structural reason the sites read as templated. One file
 * per section is what makes a second *variant* of a section possible.
 *
 * This split changed no behaviour: the rendered HTML of all three themes was captured before
 * and after and diffed byte for byte.
 */
import type { SiteContent } from "@arayeshgar/core";
import { isEnabled } from "@arayeshgar/core/features/registry";

export function Gallery({
  content,
  variant = "grid",
}: {
  content: SiteContent;
  variant?: "grid" | "editorial" | "bento";
}) {
  if (!isEnabled(content.tenant, "gallery")) return null;
  const imgs = content.tenant.branding.gallery;
  if (!imgs.length) return null;
  const cls =
    variant === "bento"
      ? "grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2"
      : variant === "editorial"
        ? "grid gap-4 sm:grid-cols-3 [&>*:nth-child(3n+1)]:sm:col-span-2"
        : "grid grid-cols-2 gap-2 sm:grid-cols-3";
  return (
    <div className={cls}>
      {imgs.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          loading="lazy"
          className="aspect-square w-full rounded-2xl object-cover"
        />
      ))}
    </div>
  );
}
