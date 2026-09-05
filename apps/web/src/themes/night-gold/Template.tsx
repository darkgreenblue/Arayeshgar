/**
 * Theme A «شب و طلا»: dark luxury, gold accent. Full-bleed photo hero, dotted price list, masonry
 * gallery, sticky mobile CTA. Inspired by classic barbershop landings (see docs/RESEARCH.md §8).
 */
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import type { ShellProps } from "..";
import {
  BookButton,
  Contact,
  Faq,
  Footer,
  Gallery,
  Hours,
  Section,
  ServicesList,
  StaffGrid,
  StickyBookBar,
} from "../sections";

const surface = "bg-[#0e0e10] text-[#f5f1e8] [--surface:#0e0e10]";

export function NightGoldShell({ tenant, children }: ShellProps) {
  const b = tenant.branding;
  return (
    <div className={`${surface} min-h-dvh`}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0e0e10]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-heading text-lg font-black">
            {b.logoUrl ? (
              <img src={b.logoUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="grid size-8 place-items-center rounded-full bg-[var(--brand)] text-sm text-[var(--brand-contrast)]">
                {b.displayName.slice(0, 1)}
              </span>
            )}
            {b.displayName}
          </Link>
          <BookButton className="hidden px-4 py-2 text-sm sm:inline-flex" />
        </div>
      </header>
      {children}
    </div>
  );
}

export function NightGold({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  return (
    <NightGoldShell tenant={content.tenant}>
      <main className="pb-24 sm:pb-0">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          {b.heroImageUrl && (
            <img
              src={b.heroImageUrl}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
            />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[#0e0e10]/60 to-[#0e0e10]" />
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-5 px-4 pb-16 pt-20 sm:pt-32">
            <span className="rounded-full border border-[var(--brand)]/50 px-3 py-1 text-xs text-[var(--brand)]">
              رزرو آنلاین · بدون تماس
            </span>
            <h1 className="max-w-2xl text-4xl font-black leading-tight sm:text-6xl">
              {b.displayName}
            </h1>
            {b.tagline && <p className="max-w-xl text-lg opacity-80">{b.tagline}</p>}
            <div className="flex flex-wrap gap-3">
              <BookButton className="px-8" />
              <a
                href="#services"
                className="inline-flex items-center rounded-2xl border border-white/20 px-6 py-3 font-bold transition hover:border-[var(--brand)]"
              >
                خدمات و قیمت‌ها
              </a>
            </div>
          </div>
        </section>

        {b.about && (
          <Section id="about" title="درباره">
            <p className="max-w-2xl text-lg leading-loose opacity-85">{b.about}</p>
          </Section>
        )}

        <Section id="services" title="خدمات و قیمت‌ها">
          <ServicesList content={content} variant="list" />
          <div className="mt-6">
            <BookButton />
          </div>
        </Section>

        <Section id="team">
          <StaffGrid content={content} />
        </Section>

        <Section id="gallery" title="نمونه‌کارها">
          <Gallery content={content} variant="grid" />
        </Section>

        <Section id="hours" title="ساعت کاری و آدرس">
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 p-5">
              <Hours content={content} />
            </div>
            <div className="rounded-3xl border border-white/10 p-5">
              <Contact content={content} />
            </div>
          </div>
        </Section>

        <Section id="faq" title="سؤالات متداول">
          <Faq content={content} />
        </Section>

        <Footer content={content} />
      </main>
      <StickyBookBar label="رزرو وقت" />
    </NightGoldShell>
  );
}
