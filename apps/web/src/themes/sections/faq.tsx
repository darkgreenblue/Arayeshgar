/**
 * Questions the barber answers on the phone all day. Feature-flagged.
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
