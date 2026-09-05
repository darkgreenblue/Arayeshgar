/**
 * Theme-agnostic building blocks. Themes decide order, layout, spacing and colors; content and
 * feature-flag gating live here so all three templates stay behaviourally identical.
 */
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import { isEnabled } from "@arayeshgar/core/features/registry";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function BookButton({
  className = "",
  children = "رزرو وقت",
  href = "/book",
}: {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center rounded-2xl bg-[var(--brand)] px-6 py-3 font-bold text-[var(--brand-contrast)] transition hover:opacity-90",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Fixed bottom CTA on phones — the single most important conversion element. */
export function StickyBookBar({ label }: { label: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-current/10 bg-[var(--surface)]/95 p-3 backdrop-blur sm:hidden">
      <BookButton className="w-full">{label}</BookButton>
    </div>
  );
}

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

export function StaffGrid({ content }: { content: SiteContent }) {
  if (content.tenant.mode === "solo" || content.staff.length < 2) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {content.staff.map((s) => (
        <div key={s.id} className="rounded-3xl border border-current/10 p-4 text-center">
          {s.photoUrl ? (
            <img
              src={s.photoUrl}
              alt={s.name}
              className="mx-auto size-20 rounded-full object-cover"
            />
          ) : (
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--brand)]/20 text-2xl font-black">
              {s.name.slice(0, 1)}
            </div>
          )}
          <h3 className="mt-2 font-bold">{s.name}</h3>
          {s.bio && <p className="text-xs opacity-70">{s.bio}</p>}
        </div>
      ))}
    </div>
  );
}

export function Hours({ content }: { content: SiteContent }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {content.hours.map((h) => (
          <tr key={h.weekday} className="border-b border-current/5 last:border-0">
            <th className="py-2 text-start font-medium">{h.label}</th>
            <td className="fa-nums py-2 text-end">
              {h.ranges.length ? h.ranges.join("، ") : <span className="opacity-50">تعطیل</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Contact({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  const map = isEnabled(content.tenant, "map") ? b.mapUrl : undefined;
  return (
    <div className="space-y-2 text-sm">
      {b.address && <p>📍 {b.address}</p>}
      {b.phone && (
        <p>
          📞{" "}
          <a
            dir="ltr"
            className="fa-nums underline-offset-4 hover:underline"
            href={`tel:${b.phone}`}
          >
            {toPersianDigits(b.phone)}
          </a>
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-current/20 px-3 py-1"
          >
            مسیریابی
          </a>
        )}
        {b.instagram && (
          <a
            href={`https://instagram.com/${b.instagram.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-current/20 px-3 py-1"
          >
            اینستاگرام
          </a>
        )}
        {b.telegram && (
          <a
            href={`https://t.me/${b.telegram.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-current/20 px-3 py-1"
          >
            تلگرام
          </a>
        )}
        {b.bale && (
          <a
            href={`https://ble.ir/${b.bale.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-current/20 px-3 py-1"
          >
            بله
          </a>
        )}
      </div>
    </div>
  );
}

export function Faq({ content }: { content: SiteContent }) {
  if (!isEnabled(content.tenant, "faq") || !content.tenant.branding.faq.length) return null;
  return (
    <div className="divide-y divide-current/10">
      {content.tenant.branding.faq.map((f, i) => (
        <details key={i} className="group py-3">
          <summary className="cursor-pointer list-none font-bold marker:content-none">
            <span className="me-2 inline-block transition group-open:rotate-90">›</span>
            {f.q}
          </summary>
          <p className="mt-2 ps-5 text-sm opacity-80">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function Footer({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  return (
    <footer className="mt-16 border-t border-current/10 py-8 text-center text-xs opacity-60">
      © {toPersianDigits(new Date().getFullYear())} {b.displayName} ·{" "}
      <Link href="/admin" className="hover:opacity-100">
        ورود آرایشگر
      </Link>
    </footer>
  );
}

export function Section({
  id,
  title,
  children,
  className = "",
}: {
  id: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx("mx-auto w-full max-w-5xl px-4 py-10 sm:py-14", className)}>
      {title && <h2 className="mb-6 text-2xl font-black sm:text-3xl">{title}</h2>}
      {children}
    </section>
  );
}
