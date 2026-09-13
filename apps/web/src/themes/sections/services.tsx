/**
 * The services and prices list — the section a barber's customer actually came for.
 *
 * Split out of a single 284-line `index.tsx` where every section lived together. That file
 * was imported wholesale by all three themes, which is why all three rendered the same eight
 * sections in the same order — the structural reason the sites read as templated. One file
 * per section is what makes a second *variant* of a section possible.
 *
 * This split changed no behaviour: the rendered HTML of all three themes was captured before
 * and after and diffed byte for byte.
 */
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";
import { cx } from "./primitives";

export function ServicesList({
  content,
  variant = "list",
}: {
  content: SiteContent;
  variant?: "list" | "cards" | "scroll";
}) {
  const items = content.services;
  if (!items.length) return null;
  if (variant === "cards" || variant === "scroll")
    return (
      <div
        className={cx(
          variant === "scroll"
            ? "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
            : "grid gap-3 sm:grid-cols-2",
        )}
      >
        {items.map((s) => (
          <Link
            key={s.id}
            href={`/book?service=${s.id}`}
            className={cx(
              "rounded-3xl border border-current/10 p-5 transition hover:border-[var(--brand)]",
              variant === "scroll" && "min-w-60 shrink-0",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold">{s.name}</h3>
              <span className="fa-nums whitespace-nowrap text-sm font-bold text-[var(--brand)]">
                {formatToman(s.price)}
              </span>
            </div>
            {s.description && <p className="mt-1 text-sm opacity-70">{s.description}</p>}
            <p className="mt-2 text-xs opacity-60">{toPersianDigits(s.durationMin)} دقیقه</p>
          </Link>
        ))}
      </div>
    );
  return (
    <ul className="divide-y divide-current/10">
      {items.map((s) => (
        <li key={s.id}>
          <Link
            href={`/book?service=${s.id}`}
            className="flex items-baseline gap-3 py-3 transition hover:text-[var(--brand)]"
          >
            <span className="font-bold">{s.name}</span>
            <span className="flex-1 border-b border-dotted border-current/30" />
            <span className="fa-nums font-bold">{formatToman(s.price)}</span>
            <span className="fa-nums text-xs opacity-50">{toPersianDigits(s.durationMin)}′</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
