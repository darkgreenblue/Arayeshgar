/**
 * Reza's photo-led site. The structure is deliberately local to night-portrait; shared
 * booking/admin behaviour remains in the common routes and core.
 */
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import { isEnabled } from "@arayeshgar/core/features/registry";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";
import type { ShellProps } from "..";
import { NightPortraitHero } from "./Hero";
import { PortfolioGallery } from "./PortfolioGallery";
import { Faq, Hours, StaffGrid, StickyBookBar } from "../sections";

const surface = "bg-[#0b0b0f] text-[#f2f1f6] [--surface:#0b0b0f] [--brand-contrast:#0b0b0f]";

export function NightPortraitShell({ tenant, children }: ShellProps) {
  const b = tenant.branding;
  return (
    <div className={`${surface} min-h-dvh`}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0f]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="font-heading text-lg font-[800] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]"
          >
            {b.displayName}
          </Link>
          <nav
            className="hidden items-center gap-8 text-sm text-[#c7c5d1] md:flex"
            aria-label="بخش‌های سایت"
          >
            <Link
              href="/#gallery"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              نمونه‌کارها
            </Link>
            <Link
              href="/#services"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              خدمات
            </Link>
            <Link
              href="/#hours"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              ساعت کاری
            </Link>
          </nav>
          <Link
            href="/book"
            className="inline-flex min-h-10 items-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-[var(--brand-contrast)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]"
          >
            رزرو وقت
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

export function NightPortrait({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  const showGallery = isEnabled(content.tenant, "gallery") && b.gallery.length > 0;

  return (
    <NightPortraitShell tenant={content.tenant}>
      <main className="pb-24 sm:pb-0">
        <NightPortraitHero
          displayName={b.displayName}
          neighbourhood={b.address?.split("،").pop()?.trim() || "تهران"}
          gallery={b.gallery}
        />

        {showGallery && (
          <section id="gallery" className="scroll-mt-24 border-t border-white/10 py-16 sm:py-24">
            <div className="mx-auto max-w-7xl px-5 sm:px-8">
              <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
                <h2 className="font-heading text-3xl font-[760] sm:text-5xl">نمونه‌کارها</h2>
                <p className="max-w-sm text-sm text-[#b9b7c4]">
                  جزئیات اصلاح را در عکس‌های واقعی ببینید.
                </p>
              </div>
              <PortfolioGallery images={b.gallery} />
            </div>
          </section>
        )}

        {content.services.length > 0 && (
          <section id="services" className="scroll-mt-24 bg-[#15151b] py-16 sm:py-24">
            <div className="mx-auto max-w-7xl px-5 sm:px-8">
              <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
                <h2 className="font-heading text-3xl font-[760] sm:text-5xl">خدمات و قیمت‌ها</h2>
                <p className="max-w-sm text-sm text-[#b9b7c4]">
                  خدمت موردنظرتان را انتخاب کنید و وقت‌های خالی را ببینید.
                </p>
              </div>
              <ul className="border-t border-white/15">
                {content.services.map((service) => (
                  <li key={service.id} className="border-b border-white/15">
                    <Link
                      href={`/book?service=${service.id}`}
                      className="group grid min-h-28 gap-x-8 gap-y-2 py-6 transition-colors hover:bg-white/[.035] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"
                    >
                      <span>
                        <span className="block font-heading text-xl font-[700] sm:text-2xl">
                          {service.name}
                        </span>
                        {service.description && (
                          <span className="mt-1 block text-sm text-[#b9b7c4]">
                            {service.description}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-[#b9b7c4]">
                          {toPersianDigits(service.durationMin)} دقیقه
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-8 sm:justify-end">
                        <span className="fa-nums whitespace-nowrap font-[700] text-[var(--brand)]">
                          {formatToman(service.price)}
                        </span>
                        <span className="text-sm text-[#c7c5d1] underline-offset-4 group-hover:underline">
                          انتخاب وقت
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-[#aaa8b7]">
                قیمت‌ها در این نسخه برای نمایش فرایند رزرو درج شده‌اند.
              </p>
            </div>
          </section>
        )}

        {content.tenant.mode !== "solo" && (
          <section id="team" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
            <h2 className="mb-8 font-heading text-3xl font-[760]">تیم</h2>
            <StaffGrid content={content} />
          </section>
        )}

        {b.about && (
          <section
            id="about"
            className="mx-auto grid max-w-7xl gap-5 border-b border-white/10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_2fr] lg:gap-20"
          >
            <h2 className="font-heading text-3xl font-[760] sm:text-4xl">دربارهٔ رضا</h2>
            <p className="max-w-[65ch] text-lg leading-[1.9] text-[#cbc9d4]">{b.about}</p>
          </section>
        )}

        <section
          id="hours"
          className="scroll-mt-24 mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20"
        >
          <div>
            <h2 className="mb-6 font-heading text-3xl font-[760] sm:text-4xl">ساعت کاری</h2>
            <Hours content={content} />
            <p className="mt-4 text-xs text-[#aaa8b7]">ساعت‌ها در این نسخه نمایشی‌اند.</p>
          </div>
          <div>
            <h2 className="mb-6 font-heading text-3xl font-[760] sm:text-4xl">راه ارتباط</h2>
            {b.address && <p className="text-lg text-[#d6d4df]">{b.address}</p>}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {b.instagram && (
                <a
                  href={`https://instagram.com/${b.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand)] underline underline-offset-6 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                >
                  اینستاگرام رضا
                </a>
              )}
              {b.phone && (
                <a
                  href={`tel:${b.phone}`}
                  dir="ltr"
                  className="fa-nums text-[var(--brand)] underline underline-offset-6 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                >
                  {toPersianDigits(b.phone)}
                </a>
              )}
              {isEnabled(content.tenant, "map") && b.mapUrl && (
                <a
                  href={b.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand)] underline underline-offset-6 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                >
                  مسیریابی
                </a>
              )}
            </div>
          </div>
        </section>

        {isEnabled(content.tenant, "faq") && b.faq.length > 0 && (
          <section id="faq" className="border-t border-white/10 py-16 sm:py-24">
            <div className="mx-auto max-w-4xl px-5 sm:px-8">
              <h2 className="mb-7 font-heading text-3xl font-[760] sm:text-4xl">پرسش‌های متداول</h2>
              <Faq content={content} />
            </div>
          </section>
        )}

        <footer className="border-t border-white/10 px-5 py-9 text-sm text-[#aaa8b7] sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <span>{b.displayName}</span>
            <Link href="/admin" className="underline underline-offset-4 hover:text-white">
              ورود آرایشگر
            </Link>
          </div>
        </footer>
      </main>
      <StickyBookBar label="رزرو وقت" />
    </NightPortraitShell>
  );
}
