/**
 * Theme B «روشن و مینیمال»: warm off-white, editorial typography, one accent color. Text-led hero,
 * service cards, alternating gallery. Inspired by minimal salon templates (docs/RESEARCH.md §8).
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

const surface = "bg-[#faf7f2] text-[#1c1a17] [--surface:#faf7f2]";

export function LightEditorialShell({ tenant, children }: ShellProps) {
  const b = tenant.branding;
  return (
    <div className={`${surface} min-h-dvh`}>
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" className="font-heading text-xl font-bold tracking-tight">
          {b.displayName}
        </Link>
        <nav className="hidden gap-6 text-sm sm:flex">
          <a href="/#services" className="hover:text-[var(--brand)]">
            خدمات
          </a>
          <a href="/#gallery" className="hover:text-[var(--brand)]">
            نمونه‌کارها
          </a>
          <a href="/#hours" className="hover:text-[var(--brand)]">
            ساعت کاری
          </a>
          <Link href="/book" className="font-bold text-[var(--brand)]">
            رزرو وقت
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function LightEditorial({ content }: { content: SiteContent }) {
  const b = content.tenant.branding;
  return (
    <LightEditorialShell tenant={content.tenant}>
      <main className="pb-24 sm:pb-0">
        <section className="mx-auto grid max-w-4xl gap-8 px-5 pb-12 pt-8 sm:grid-cols-[1.4fr_1fr] sm:items-center sm:pt-16">
          <div>
            <h1 className="text-4xl font-bold leading-[1.35] sm:text-5xl">
              {b.tagline ?? b.displayName}
            </h1>
            {b.about && (
              <p className="mt-5 max-w-prose text-lg leading-loose opacity-75">{b.about}</p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <BookButton className="rounded-full px-8" />
              <a
                href="#services"
                className="text-sm underline underline-offset-8 opacity-70 hover:opacity-100"
              >
                قیمت‌ها را ببینید
              </a>
            </div>
          </div>
          {b.heroImageUrl && (
            <img
              src={b.heroImageUrl}
              alt=""
              className="aspect-[4/5] w-full rounded-[2rem] object-cover"
            />
          )}
        </section>

        <Section id="services" title="خدمات" className="max-w-4xl">
          <ServicesList content={content} variant="cards" />
        </Section>

        <Section id="team" className="max-w-4xl">
          <StaffGrid content={content} />
        </Section>

        <Section id="gallery" title="نمونه‌کارها" className="max-w-4xl">
          <Gallery content={content} variant="editorial" />
        </Section>

        <Section id="hours" className="max-w-4xl">
          <div className="grid gap-10 border-y border-black/10 py-8 sm:grid-cols-2">
            <div>
              <h2 className="mb-4 text-xl font-bold">ساعت کاری</h2>
              <Hours content={content} />
            </div>
            <div>
              <h2 className="mb-4 text-xl font-bold">آدرس و تماس</h2>
              <Contact content={content} />
            </div>
          </div>
        </Section>

        <Section id="faq" title="سؤالات متداول" className="max-w-4xl">
          <Faq content={content} />
        </Section>

        <Footer content={content} />
      </main>
      <StickyBookBar label="رزرو وقت" />
    </LightEditorialShell>
  );
}
