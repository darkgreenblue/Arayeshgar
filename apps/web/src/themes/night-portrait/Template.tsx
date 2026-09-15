/**
 * Theme D «شب و پرتره»: built for a solo barber whose trust signal is his own work, not a
 * shopfront — an Instagram-led business where the photo grid IS the pitch. Two structural
 * differences from «شب و طلا» (which shares the same dark paper band): the hero is a contained,
 * framed portrait next to a typographic identity block instead of a full-bleed stretched photo,
 * and the gallery moves directly after the hero — before services, before about — because for
 * this kind of client the work sells the booking, not the other way around. See
 * apps/web/src/themes/tenant-directions/reza-hosseini.md for the brief this was built from.
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

const surface = "bg-[#0b0b0f] text-[#f2f1f6] [--surface:#0b0b0f]";

export function NightPortraitShell({ tenant, children }: ShellProps) {
  const b = tenant.branding;
  return (
    <div className={`${surface} min-h-dvh`}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0b0f]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-heading text-lg font-extrabold">
            {b.displayName}
          </Link>
          <BookButton className="hidden px-4 py-2 text-sm sm:inline-flex" />
        </div>
      </header>
      {children}
    </div>
  );
}

export function NightPortrait({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  return (
    <NightPortraitShell tenant={content.tenant}>
      <main className="pb-24 sm:pb-0">
        {/* The one deliberate "premium" moment on the page (see the skill's own note that a
         * single orchestrated effect reads as intentional where scattered per-card motion
         * reads as generic): a slow-drifting glow field in the tenant's own brand colour behind
         * the hero, and a one-time light-reveal on the headline. Both pure CSS (see globals.css
         * .np-*), no animation library, inert under prefers-reduced-motion. */}
        <section className="relative isolate mx-auto grid max-w-5xl gap-10 overflow-hidden px-4 pb-14 pt-10 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:pt-20">
          <div className="np-glow-field" aria-hidden />
          <div className="np-lamp-reveal">
            <h1 className="font-heading text-5xl font-extrabold leading-[1.15] sm:text-6xl">
              {b.displayName}
            </h1>
            <p className="mt-4 max-w-md text-xl leading-relaxed opacity-90">
              اصلاح موی مردانه در {b.address?.split("،").pop()?.trim() || "تهران"}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <BookButton className="px-8 py-3" />
              <a
                href="#gallery"
                className="text-sm font-medium opacity-75 underline underline-offset-8 transition hover:opacity-100"
              >
                دیدن نمونه‌کارها
              </a>
            </div>
          </div>
          {b.heroImageUrl && (
            <div className="np-ring rounded-3xl border border-[var(--brand)]/25 p-2">
              <img
                src={b.heroImageUrl}
                alt=""
                className="aspect-[4/5] w-full rounded-2xl object-cover"
              />
            </div>
          )}
        </section>

        <Section id="gallery" title="نمونه‌کارها">
          <Gallery content={content} variant="portrait" />
        </Section>

        <Section id="services" title="خدمات و قیمت‌ها">
          <ServicesList content={content} variant="cards" />
        </Section>

        {content.tenant.mode !== "solo" && (
          <Section id="team">
            <StaffGrid content={content} />
          </Section>
        )}

        {b.about && (
          <Section id="about" title="درباره">
            <p className="max-w-2xl text-lg leading-loose opacity-85">{b.about}</p>
          </Section>
        )}

        <Section id="hours" title="ساعت کاری و آدرس">
          <div className="grid gap-6 sm:grid-cols-2">
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
    </NightPortraitShell>
  );
}
