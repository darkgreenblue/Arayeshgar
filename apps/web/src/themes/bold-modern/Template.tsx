/**
 * Theme C «مدرن و پررنگ»: vivid gradient, bento gallery, horizontal service cards, team cards.
 * Inspired by motion-heavy salon templates with booking modals (docs/RESEARCH.md §8); we keep the
 * motion CSS-only for performance on low-end phones.
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

const surface = "bg-white text-[#141414] [--surface:#ffffff]";

export function BoldModernShell({ tenant, children }: ShellProps) {
  const b = tenant.branding;
  return (
    <div className={`${surface} min-h-dvh`}>
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-heading text-xl font-black">
            <span className="bg-gradient-to-l from-[var(--brand)] to-[var(--accent)] bg-clip-text text-transparent">
              {b.displayName}
            </span>
          </Link>
          <BookButton className="rounded-full px-5 py-2 text-sm" />
        </div>
      </header>
      {children}
    </div>
  );
}

export function BoldModern({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  return (
    <BoldModernShell tenant={content.tenant}>
      <main className="pb-24 sm:pb-0">
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-10 sm:grid-cols-2 sm:items-center">
          <div className="relative">
            <div className="absolute -start-10 -top-10 -z-10 size-56 rounded-full bg-[var(--brand)]/25 blur-3xl" />
            <h1 className="text-5xl font-black leading-[1.2] sm:text-6xl">
              {b.displayName}
              {b.tagline && (
                <span className="mt-3 block bg-gradient-to-l from-[var(--brand)] to-[var(--accent)] bg-clip-text text-3xl text-transparent sm:text-4xl">
                  {b.tagline}
                </span>
              )}
            </h1>
            {b.about && <p className="mt-5 max-w-prose text-lg opacity-75">{b.about}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <BookButton className="rounded-full px-8 py-4 text-lg shadow-lg shadow-[var(--brand)]/30" />
            </div>
          </div>
          {b.heroImageUrl ? (
            <img
              src={b.heroImageUrl}
              alt=""
              className="aspect-square w-full rounded-[2.5rem] object-cover shadow-2xl"
            />
          ) : (
            <div className="aspect-square w-full rounded-[2.5rem] bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] opacity-90" />
          )}
        </section>

        <Section id="services" title="خدمات" className="max-w-6xl">
          <ServicesList content={content} variant="scroll" />
        </Section>

        <Section
          id="team"
          title={content.tenant.mode === "solo" ? undefined : "تیم ما"}
          className="max-w-6xl"
        >
          <StaffGrid content={content} />
        </Section>

        <Section id="gallery" title="نمونه‌کارها" className="max-w-6xl">
          <Gallery content={content} variant="bento" />
        </Section>

        <Section id="hours" className="max-w-6xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[2rem] bg-[#f4f4f5] p-6">
              <h2 className="mb-4 text-xl font-black">ساعت کاری</h2>
              <Hours content={content} />
            </div>
            <div className="rounded-[2rem] bg-[#f4f4f5] p-6">
              <h2 className="mb-4 text-xl font-black">آدرس و تماس</h2>
              <Contact content={content} />
            </div>
          </div>
        </Section>

        <Section id="faq" title="سؤالات متداول" className="max-w-6xl">
          <Faq content={content} />
        </Section>

        <Footer content={content} />
      </main>
      <StickyBookBar label="رزرو وقت" />
    </BoldModernShell>
  );
}
