/**
 * The barbers. Hidden in solo mode and when there is only one — a grid of one is worse than nothing.
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
