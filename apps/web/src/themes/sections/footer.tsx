/**
 * Footer, including the barber's own way into the admin panel.
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
import { toPersianDigits } from "@arayeshgar/core/utils/phone";

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
