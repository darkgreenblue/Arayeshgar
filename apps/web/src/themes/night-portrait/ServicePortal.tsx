"use client";

import type { PointerEvent } from "react";
import Link from "next/link";
import type { SiteContent } from "@arayeshgar/core";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";

const photoOrder = [10, 5, 7];

function tilt(event: PointerEvent<HTMLAnchorElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  card.style.setProperty("--tilt-x", `${(0.5 - y) * 7}deg`);
  card.style.setProperty("--tilt-y", `${(x - 0.5) * 7}deg`);
  card.style.setProperty("--spot-x", `${x * 100}%`);
  card.style.setProperty("--spot-y", `${y * 100}%`);
}

function resetTilt(event: PointerEvent<HTMLAnchorElement>) {
  const card = event.currentTarget;
  card.style.setProperty("--tilt-x", "0deg");
  card.style.setProperty("--tilt-y", "0deg");
}

export function ServicePortal({
  services,
  gallery,
}: {
  services: SiteContent["services"];
  gallery: string[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:gap-4">
      {services.map((service, index) => {
        const image =
          gallery[photoOrder[index % photoOrder.length]!] ?? gallery[index % gallery.length];
        return (
          <Link
            key={service.id}
            href={`/book?service=${service.id}`}
            onPointerMove={tilt}
            onPointerLeave={resetTilt}
            onPointerCancel={resetTilt}
            className="group relative isolate flex min-h-[380px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#20202a] p-6 text-white shadow-[0_25px_50px_rgba(0,0,0,.15)] transition-[transform,border-color,box-shadow] duration-300 hover:z-10 hover:border-[#a4aaff]/60 hover:shadow-[0_32px_75px_rgba(65,58,125,.35)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a5acff] motion-reduce:transform-none sm:min-h-[420px] lg:p-8"
            style={{
              transform:
                "perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
            }}
          >
            {image && (
              <img
                src={image}
                alt=""
                loading="lazy"
                className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover grayscale transition-transform duration-700 group-hover:scale-[1.09] motion-reduce:transition-none"
              />
            )}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#0b0b13] via-[#0b0b13]/45 to-[#0b0b13]/25"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
              style={{
                background:
                  "radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(165,172,255,.3), transparent 65%)",
              }}
            />
            <span className="flex items-start justify-between gap-4 text-xs font-bold">
              <span
                dir="ltr"
                className="fa-nums rounded-full border border-white/35 px-3 py-1.5 text-white/85"
              >
                ۰{toPersianDigits(index + 1)} / ۰{toPersianDigits(services.length)}
              </span>
              <span className="fa-nums text-white/80">
                {toPersianDigits(service.durationMin)} دقیقه
              </span>
            </span>
            <span className="block">
              <span className="font-heading block text-[clamp(2rem,3vw,3.25rem)] leading-[1.4] font-[850]">
                {service.name}
              </span>
              {service.description && (
                <span className="mt-1 block text-sm leading-7 text-white/80">
                  {service.description}
                </span>
              )}
              <span className="fa-nums mt-3 block text-lg font-[700] text-[#bbc0ff]">
                {formatToman(service.price)}
              </span>
              <span className="mt-6 flex items-center justify-between border-t border-white/30 pt-4 text-sm font-[750]">
                انتخاب وقت
                <span
                  aria-hidden="true"
                  className="text-xl transition-transform duration-300 group-hover:-translate-x-1 motion-reduce:transition-none"
                >
                  ↖
                </span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
