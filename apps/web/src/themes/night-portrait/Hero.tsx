"use client";
import { motion } from "motion/react";
import { LampContainer } from "@/components/ui/lamp";
import { BookButton } from "../sections";

/**
 * The one deliberate "premium" moment on the page: Aceternity UI's "Lamp" component
 * (https://ui.aceternity.com/registry/lamp.json, MIT, by Manu Arora) in its own canonical
 * full-width layout -- see apps/web/src/components/ui/lamp.tsx for exactly what was adapted
 * (brand colour, surface colour, hero height) versus untouched. Split into its own client
 * component because `motion` only renders on the client, and the rest of the theme stays a
 * server component.
 */
export function NightPortraitHero({
  displayName,
  neighbourhood,
}: {
  displayName: string;
  neighbourhood: string;
}) {
  return (
    <LampContainer className="rounded-none">
      <motion.h1
        initial={{ opacity: 0.5, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
        className="bg-gradient-to-b from-white to-white/60 bg-clip-text py-2 text-center font-heading text-5xl font-extrabold text-transparent sm:text-6xl"
      >
        {displayName}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8, ease: "easeInOut" }}
        className="mt-4 max-w-md text-center text-xl leading-relaxed opacity-90"
      >
        اصلاح موی مردانه در {neighbourhood}
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8, ease: "easeInOut" }}
        className="mt-8 flex flex-wrap items-center justify-center gap-4"
      >
        <BookButton className="px-8 py-3" />
        <a
          href="#gallery"
          className="text-sm font-medium opacity-75 underline underline-offset-8 transition hover:opacity-100"
        >
          دیدن نمونه‌کارها
        </a>
      </motion.div>
    </LampContainer>
  );
}
