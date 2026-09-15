/**
 * Theme D «شب و پرتره»: built for a solo barber whose trust signal is his own work, not a
 * shopfront — an Instagram-led business where the photo grid IS the pitch. Two structural
 * differences from «شب و طلا» (which shares the same dark paper band): the hero itself is an
 * animated marquee of the tenant's own work photos (Magic UI's "Marquee", see
 * components/ui/marquee.tsx) instead of a static hero photo, and the full gallery moves directly
 * after it — before services, before about — because for this kind of client the work sells the
 * booking, not the other way around. See apps/web/src/themes/tenant-directions/reza-hosseini.md
 * for the brief this was built from.
 */
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import type { ShellProps } from "..";
import { NightPortraitHero } from "./Hero";
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
        <NightPortraitHero
          displayName={b.displayName}
          neighbourhood={b.address?.split("،").pop()?.trim() || "تهران"}
          gallery={b.gallery}
        />

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
