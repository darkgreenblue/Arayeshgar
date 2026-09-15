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
import { cx } from "./primitives";

export function Gallery({
  content,
  variant = "grid",
}: {
  content: SiteContent;
  variant?: "grid" | "editorial" | "bento" | "portrait";
}) {
  if (!isEnabled(content.tenant, "gallery")) return null;
  const imgs = content.tenant.branding.gallery;
  if (!imgs.length) return null;

  // "portrait" is the one variant that does not crop every photo to a square: a barber's work
  // photos are shot vertical (a fade or a line-up needs the height), and forcing them into
  // aspect-square loses exactly the detail that made them worth including. See the photography
  // section of the barbershop-design skill -- "design a grid that wants 4:5 and 3:4 instead of
  // fighting them". The second photo (index 1) gets a wider feature slot on desktop rather than
  // the first, so the very top-right tile a visitor's eye lands on first (RTL reading order)
  // still opens on a normal portrait crop instead of a stretched one.
  if (variant === "portrait") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {imgs.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className={cx(
              "w-full rounded-2xl object-cover aspect-[4/5] transition duration-300",
              "hover:scale-[1.03] hover:shadow-[0_0_36px_-6px_var(--brand)]",
              i === 1 && "sm:col-span-2 sm:aspect-[16/10]",
            )}
          />
        ))}
      </div>
    );
  }

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
