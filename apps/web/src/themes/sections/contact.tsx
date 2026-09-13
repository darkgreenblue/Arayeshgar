/**
 * Address, phone and the social links. The phone anchor carries dir=ltr, which the HTML5 UA stylesheet makes a bidi isolate — without it the number reorders inside Persian text.
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
import { toPersianDigits } from "@arayeshgar/core/utils/phone";

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
