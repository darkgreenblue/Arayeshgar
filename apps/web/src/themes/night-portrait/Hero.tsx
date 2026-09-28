"use client";

import Link from "next/link";
import { OrbitStage } from "./OrbitStage";

/** Reza's demo opens like an interactive photographic installation, not a service template. */
export function NightPortraitHero({
  displayName,
  neighbourhood,
  gallery,
}: {
  displayName: string;
  neighbourhood: string;
  gallery: string[];
}) {
  const stageImages = [gallery[2], gallery[4], gallery[1], gallery[6], gallery[8]].filter(
    (src): src is string => Boolean(src),
  );

  return (
    <section className="relative isolate min-h-[690px] overflow-hidden border-b border-white/10 bg-[#08070f] lg:min-h-[min(890px,calc(100svh-72px))]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_62%_47%,rgba(108,78,171,.26),transparent_48%),radial-gradient(ellipse_at_85%_84%,rgba(61,65,143,.22),transparent_42%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[.13] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:76px_76px] [mask-image:linear-gradient(to_left,transparent,black)]"
      />

      <div className="absolute inset-x-0 top-5 z-10 mx-auto flex max-w-[1450px] items-center justify-between px-5 text-[11px] tracking-[.18em] text-white/50 sm:px-9 lg:top-8">
        <span>REZA HOSSEINI · 01 / 04</span>
        <span className="hidden sm:inline">PORTFOLIO / NIAVARAN</span>
      </div>

      <div className="mx-auto grid min-h-[690px] max-w-[1450px] grid-rows-[minmax(330px,42vh)_auto] items-center px-5 pt-12 pb-14 sm:px-9 lg:min-h-[min(890px,calc(100svh-72px))] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.22fr)] lg:grid-rows-1 lg:pt-0 lg:pb-0">
        <div className="relative z-10 order-2 -mt-8 max-w-2xl self-center lg:order-1 lg:mt-0">
          <div className="mb-4 flex items-center gap-3 text-xs font-bold text-[#acb2ff]">
            <span className="h-px w-12 bg-[#acb2ff]" />
            تجربهٔ اختصاصی رضا حسینی
          </div>
          <h1 className="font-heading text-[clamp(4.1rem,9vw,9rem)] leading-[1.1] font-[900] tracking-[-.055em] text-white [text-shadow:0_10px_55px_rgba(76,65,151,.35)]">
            {displayName}
          </h1>
          <div className="mt-5 flex items-center gap-4 text-[clamp(1.35rem,2vw,2rem)] font-[650] text-white/90">
            <span className="h-px w-10 bg-[#a6adff]" />
            اصلاح مو در {neighbourhood}
          </div>
          <p className="mt-6 max-w-md text-sm leading-[2] text-[#cbc8d6] sm:text-base">
            هر اصلاح، یک زاویهٔ تازه. میان نمونه‌کارهای واقعی رضا حرکت کنید و نوبت خودتان را انتخاب
            کنید.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/book"
              className="group relative inline-flex min-h-14 items-center gap-5 overflow-hidden rounded-full bg-[#a5acff] px-7 text-sm font-[800] text-[#11111e] shadow-[0_0_40px_rgba(123,133,224,.25)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_rgba(123,133,224,.5)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              رزرو وقت
              <span
                aria-hidden="true"
                className="text-xl transition-transform group-hover:-translate-x-1"
              >
                ↖
              </span>
            </Link>
            <a
              href="#gallery"
              className="inline-flex min-h-12 items-center border-b border-white/40 px-2 text-sm font-medium text-white/80 transition-colors hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              کشف نمونه‌کارها ↙
            </a>
          </div>
        </div>

        <div className="relative z-0 order-1 h-full min-h-[330px] lg:order-2 lg:me-[-7vw] lg:min-h-[640px]">
          {stageImages.length > 0 && <OrbitStage images={stageImages} />}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#08070f] to-transparent"
      />
    </section>
  );
}
