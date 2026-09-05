"use client";
/**
 * Live preview of the site while the wizard is being filled in. It is a faithful miniature of the
 * real templates (same sections, same order, same brand tokens) rendered from the draft, so the
 * salesperson can show the barber their site before anything is saved.
 */
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";

export type PreviewDraft = {
  theme: "night-gold" | "light-editorial" | "bold-modern";
  primaryColor: string;
  displayName: string;
  tagline?: string;
  about?: string;
  heroImageUrl?: string;
  gallery: string[];
  services: { name: string; price: number; durationMin: number }[];
  staff: { name: string }[];
  address?: string;
  phone?: string;
  mode: "solo" | "salon_central" | "salon_independent";
};

const SKINS = {
  "night-gold": {
    bg: "#0e0e10",
    fg: "#f5f1e8",
    card: "rgba(255,255,255,.06)",
    head: "font-[Estedad]",
  },
  "light-editorial": {
    bg: "#faf7f2",
    fg: "#1c1a17",
    card: "rgba(0,0,0,.04)",
    head: "font-[Sahel]",
  },
  "bold-modern": { bg: "#ffffff", fg: "#141414", card: "#f4f4f5", head: "font-[Estedad]" },
} as const;

function contrast(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000";
  const n = parseInt(m[1]!, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#0e0e10" : "#fff";
}

export function SitePreview({ draft }: { draft: PreviewDraft }) {
  const skin = SKINS[draft.theme];
  const onBrand = contrast(draft.primaryColor);
  return (
    <div className="sticky top-4">
      <div className="mb-2 flex items-center justify-between text-xs opacity-60">
        <span>پیش‌نمایش زنده</span>
        <span dir="ltr">{draft.theme}</span>
      </div>
      <div
        className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[2rem] border-8 border-black/80 shadow-xl"
        style={{ background: skin.bg, color: skin.fg }}
      >
        <div className="max-h-[70vh] overflow-y-auto text-[11px] leading-relaxed">
          {/* hero */}
          <div className="relative">
            {draft.heroImageUrl ? (
              <img
                src={draft.heroImageUrl}
                alt=""
                className="h-32 w-full object-cover opacity-70"
              />
            ) : (
              <div
                className="h-24 w-full"
                style={{
                  background: `linear-gradient(180deg, ${draft.primaryColor}33, transparent)`,
                }}
              />
            )}
            <div className="p-3">
              <div className={`text-lg font-black ${skin.head}`}>
                {draft.displayName || "نام آرایشگاه"}
              </div>
              {draft.tagline && <div className="opacity-70">{draft.tagline}</div>}
              <button
                className="mt-2 w-full rounded-xl py-2 font-bold"
                style={{ background: draft.primaryColor, color: onBrand }}
              >
                رزرو وقت
              </button>
            </div>
          </div>
          {draft.about && (
            <div className="px-3 pb-3">
              <div className="mb-1 font-bold">درباره</div>
              <p className="opacity-75">{draft.about.slice(0, 220)}</p>
            </div>
          )}
          <div className="px-3 pb-3">
            <div className="mb-1 font-bold">خدمات و قیمت‌ها</div>
            <ul className="space-y-1">
              {draft.services.slice(0, 6).map((s, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span>{s.name}</span>
                  <span className="flex-1 border-b border-dotted opacity-30" />
                  <span className="fa-nums font-bold" style={{ color: draft.primaryColor }}>
                    {formatToman(s.price)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {draft.mode !== "solo" && draft.staff.length > 1 && (
            <div className="px-3 pb-3">
              <div className="mb-1 font-bold">تیم ما</div>
              <div className="flex flex-wrap gap-1">
                {draft.staff.map((s, i) => (
                  <span
                    key={i}
                    className="rounded-full px-2 py-0.5"
                    style={{ background: skin.card }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {draft.gallery.length > 0 && (
            <div className="px-3 pb-3">
              <div className="mb-1 font-bold">نمونه‌کارها</div>
              <div className="grid grid-cols-3 gap-1">
                {draft.gallery.slice(0, 6).map((g, i) => (
                  <img
                    key={i}
                    src={g}
                    alt=""
                    className="aspect-square w-full rounded object-cover"
                  />
                ))}
              </div>
            </div>
          )}
          <div className="px-3 pb-4 opacity-70">
            {draft.address && <div>📍 {draft.address}</div>}
            {draft.phone && (
              <div className="fa-nums" dir="ltr">
                📞 {toPersianDigits(draft.phone)}
              </div>
            )}
          </div>
          <div
            className="p-2 text-center"
            style={{ background: draft.primaryColor, color: onBrand }}
          >
            <span className="font-bold">رزرو وقت</span>
          </div>
        </div>
      </div>
    </div>
  );
}
