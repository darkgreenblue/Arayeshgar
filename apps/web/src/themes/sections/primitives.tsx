/**
 * Shared primitives every section and every theme uses: the class joiner, the booking CTA, the mobile sticky bar, and the section wrapper.
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
