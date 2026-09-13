/**
 * Weekly opening hours, Saturday first.
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
