"use client";
import { BlurFade } from "@/components/ui/blur-fade";
import { Marquee } from "@/components/ui/marquee";
import { BookButton } from "../sections";

/**
 * The hero for night-portrait: two real, sourced Magic UI components (MIT,
 * magicuidesign/magicui) -- BlurFade for the headline/subtext reveal
 * (https://magicui.design/r/blur-fade.json) and Marquee for an infinite scrolling strip of the
 * tenant's own work photos (https://magicui.design/r/marquee.json) -- composed the same way
 * Magic UI's own marquee-demo.tsx does (two rows, second one reversed, edge fade masks). See
 * components/ui/blur-fade.tsx and components/ui/marquee.tsx for exactly what was adapted (only
 * `from-background` swapped for the tenant's own `--surface`) versus untouched. Split into its
 * own client component because `motion` only renders on the client.
 */
export function NightPortraitHero({
  displayName,
  neighbourhood,
  gallery,
}: {
  displayName: string;
  neighbourhood: string;
  gallery: string[];
}) {
  const firstRow = gallery.filter((_, i) => i % 2 === 0);
  const secondRow = gallery.filter((_, i) => i % 2 === 1);

  return (
    <div className="relative flex flex-col items-center overflow-hidden pt-14 pb-10 sm:pt-20">
      <BlurFade inView delay={0}>
        <h1 className="px-4 text-center font-heading text-5xl font-extrabold sm:text-6xl">
          {displayName}
        </h1>
      </BlurFade>
      <BlurFade inView delay={0.1}>
        <p className="mt-4 px-4 text-center text-xl leading-relaxed opacity-90">
          اصلاح موی مردانه در {neighbourhood}
        </p>
      </BlurFade>
      <BlurFade inView delay={0.2}>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <BookButton className="px-8 py-3" />
          <a
            href="#gallery"
            className="text-sm font-medium opacity-75 underline underline-offset-8 transition hover:opacity-100"
          >
            دیدن نمونه‌کارها
          </a>
        </div>
      </BlurFade>

      {gallery.length > 0 && (
        <BlurFade inView delay={0.3} className="relative mt-12 w-full">
          <Marquee pauseOnHover className="[--duration:32s]">
            {firstRow.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                loading="lazy"
                className="h-40 w-32 rounded-2xl object-cover sm:h-56 sm:w-44"
              />
            ))}
          </Marquee>
          {secondRow.length > 0 && (
            <Marquee reverse pauseOnHover className="mt-3 [--duration:32s]">
              {secondRow.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="h-40 w-32 rounded-2xl object-cover sm:h-56 sm:w-44"
                />
              ))}
            </Marquee>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[var(--surface)] sm:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[var(--surface)] sm:w-32" />
        </BlurFade>
      )}
    </div>
  );
}
