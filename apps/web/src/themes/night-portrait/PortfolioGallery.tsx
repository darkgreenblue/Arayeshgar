"use client";

import { useRef, useState } from "react";
import { toPersianDigits } from "@arayeshgar/core/utils/phone";
import TimeMachineStack from "./TimeMachineStack";

export function PortfolioGallery({ images }: { images: string[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(0);

  if (!images.length) return null;

  function open(index: number, button: HTMLButtonElement) {
    opener.current = button;
    setSelected(index);
    dialog.current?.showModal();
  }

  function move(delta: number) {
    setSelected((current) => (current + delta + images.length) % images.length);
  }

  return (
    <>
      <div className="grid items-center gap-9 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)] lg:gap-16">
        <div className="order-2 lg:order-1">
          <p className="text-xs font-bold text-[#aab1ff]">آرشیو زندهٔ اصلاح‌ها</p>
          <div className="mt-4 flex items-end gap-3" dir="ltr">
            <span className="fa-nums text-[clamp(6rem,13vw,11rem)] leading-none font-[800] tracking-[-.1em] text-white">
              {toPersianDigits(selected + 1).padStart(2, "۰")}
            </span>
            <span className="fa-nums mb-3 border-b border-white/25 pb-2 text-2xl text-white/40">
              / {toPersianDigits(images.length).padStart(2, "۰")}
            </span>
          </div>
          <p className="mt-5 max-w-md text-base leading-[2] text-[#c7c5d1]">
            هر عکس، یک زاویه از کار واقعی رضاست. با اسکرول یا کشیدن کارت‌ها، لایه‌های آرشیو را ورق
            بزنید.
          </p>
          <div className="mt-7 flex gap-3">
            <button
              type="button"
              onClick={() => setSelected((current) => Math.max(0, current - 1))}
              disabled={selected === 0}
              aria-label="نمونه‌کار قبلی"
              className="grid size-12 place-items-center rounded-full border border-white/35 text-xl text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setSelected((current) => Math.min(images.length - 1, current + 1))}
              disabled={selected === images.length - 1}
              aria-label="نمونه‌کار بعدی"
              className="grid size-12 place-items-center rounded-full border border-white/35 text-xl text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              ←
            </button>
          </div>
        </div>

        <TimeMachineStack
          className="order-1 h-[450px] max-w-[680px] lg:order-2 lg:h-[600px]"
          index={selected}
          onIndexChange={setSelected}
          depth={100}
          offsetY={34}
          scaleStep={0.075}
          visibleCount={4}
          items={images.map((src, index) => ({
            id: `reza-work-${index}`,
            content: (
              <button
                type="button"
                onClick={(event) => open(index, event.currentTarget)}
                aria-label={`دیدن نمونه‌کار ${toPersianDigits(index + 1)} از نزدیک`}
                className="group relative block h-full min-h-[330px] w-full overflow-hidden text-start focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--brand)]"
              >
                <img
                  src={src}
                  alt={`نمونه‌کار ${toPersianDigits(index + 1)} رضا حسینی`}
                  loading={index < 4 ? "eager" : "lazy"}
                  className="absolute inset-0 h-full w-full object-cover grayscale transition-[filter,transform] duration-500 group-hover:scale-[1.035] group-hover:grayscale-0 motion-reduce:transition-none"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/85 to-transparent px-5 pt-16 pb-5 text-white sm:px-8">
                  <span className="text-sm font-bold">نمونه‌کار رضا حسینی</span>
                  <span className="text-xs">نمایش کامل ↗</span>
                </span>
              </button>
            ),
          }))}
        />
      </div>

      <dialog
        ref={dialog}
        aria-label="نمایش نمونه‌کارهای رضا حسینی"
        onClose={() => opener.current?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(-1);
          }
        }}
        className="fixed inset-0 m-auto max-h-[100dvh] max-w-[100vw] border-0 bg-[#0b0b0f] p-4 text-[#f2f1f6] backdrop:bg-black/90 sm:rounded-xl sm:p-6"
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-h-[calc(100dvh-3rem)]">
          <div className="flex items-center justify-between gap-6 text-sm">
            <span className="fa-nums text-[#bbb9c5]">
              {toPersianDigits(selected + 1)} از {toPersianDigits(images.length)}
            </span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-md px-3 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              بستن
            </button>
          </div>
          <img
            src={images[selected]}
            alt={`نمونه‌کار ${toPersianDigits(selected + 1)} رضا حسینی`}
            className="min-h-0 max-h-[calc(100dvh-11rem)] max-w-[min(86vw,700px)] self-center rounded-md object-contain"
          />
          <div className="flex items-center justify-between gap-6 text-sm">
            <button
              type="button"
              onClick={() => move(-1)}
              className="rounded-md px-3 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              قبلی
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="rounded-md px-3 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            >
              بعدی
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
