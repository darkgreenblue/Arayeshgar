---
name: barbershop-design
description: Design and build the public site for one Iranian barbershop tenant in this repo — Persian RTL, Next.js, Tailwind v4. Use whenever work touches apps/web/src/themes/, a tenant's look, a hero, a landing page, a section layout, fonts, colors, spacing, or motion on a tenant site; whenever onboarding a new barbershop; and whenever the user says a design looks generic, templated, AI-made, cheap, or like every other site — even if they never use the word "design". Persian has no uppercase, no italic, and forbids letter-spacing, so the usual emphasis toolkit is unavailable and must be replaced deliberately rather than faked.
license: Proprietary — internal to Arayeshgar
---

# Barbershop design (Persian, RTL)

Read `/mnt/skills/public/frontend-design/SKILL.md` first and follow it. It covers what makes
any page distinctive rather than templated. **This skill is only the delta**: what changes
because the language is Persian, the direction is RTL, and the client is one specific
barbershop who was told "we made this for you."

## Why this product fails differently

The business is not SaaS. Each site is sold to one barber as bespoke work at a premium, so
the sameness that a SaaS product can tolerate is the one thing that destroys the pitch. Two
customers in the same city receiving recognisably similar sites ends the business, not just
the engagement.

## The Persian constraint — read this before choosing any emphasis device

Persian (Arabic script) removes three of the devices a Latin design reaches for by reflex:

| Device                                   | Why it is unavailable                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `UPPERCASE` labels, eyebrows, small-caps | The script has **no letter case**. There is nothing to capitalise.                                                |
| Italic for emphasis or an accented word  | There is **no italic tradition**. Oblique-ing a Persian face is a distortion.                                     |
| `letter-spacing` / `tracking-*`          | Arabic script **joins by glyph overlap**. Tracking tears joined words apart — it is a rendering bug, not a style. |

This matters more than it first appears. A page that would merely read as _generic_ in
English reads as _unfinished_ in Persian, because the generic toolkit has been removed and
nothing was put in its place. **So emphasis must come from weight, size, colour, position,
rule and space** — the harder and more deliberate devices. That constraint is an advantage
once accepted: it forces the choices that make a page look designed.

Corollary: when you paste any component from an external kit, audit it for `tracking-*`,
`leading-tight`, `leading-none`, `uppercase`, and `italic`. Those arrive silently and undo
the typography.

→ Full rules, with the licence status of every Persian font: `references/persian-typography.md`

## What is already correct in this repo — do not "fix" it

Verified in `apps/web/src/app/globals.css` and `apps/web/src/app/layout.tsx`:

- `lang="fa" dir="rtl"` on `html`. **Load-bearing** — Tailwind's `rtl:` variant compiles to
  `:dir(rtl)`, which responds to the attribute and _not_ to the CSS `direction` property.
  Never remove the attribute.
- `letter-spacing: 0`, body `line-height: 1.9`, headings `1.5`, `text-align: start`. All
  correct for Persian; the line-heights are floors, not preferences (see the reference).
- Prices render `۴۵۰٬۰۰۰ تومان` — Persian digits with U+066C, the Arabic thousands
  separator. Phone numbers are Persian digits inside `dir="ltr"`, which the HTML5 UA
  stylesheet makes an isolate. Both already bidi-safe.
- `isolate()` in `packages/core/src/utils/phone.ts` wraps Latin runs (booking codes) for
  chat messages where `bdi` does not exist.

## Before writing any code: the brief

A barbershop is not interchangeable with another barbershop, and the site should not be
either. Establish, and write down:

1. What kind of shop — one chair, a salon with several barbers, a high-end atelier, a
   neighbourhood storefront.
2. Neighbourhood, clientele, price tier.
3. **The owner's own words** about his shop. This is the single richest source of a
   distinctive direction and it is free.
4. What photography actually exists (see below — it decides the layout, not the reverse).

Write the answers and the resulting direction to
`apps/web/src/themes/tenant-directions/‹slug›.md`. It is the artifact that makes the next
session's work consistent with this one.

## Structure must vary, not just colour

The failure mode this repo already had: three "themes" that rendered the **same eight
sections in the same order**, so every tenant got one macrostructure and the theme only
changed a wrapper and a palette. Colour variation on a fixed skeleton is recognisable as
templated no matter how good the palette is.

So: pick a **layout archetype**, then build the identity on top. Before coding, state which
archetype you picked and how it differs from the last three tenants — it must differ on at
least one of:

- **archetype** (structure and section order),
- **paper band** — dark (L < 30%), mid, or light (L > 85%),
- **display strategy** — weight contrast, width contrast, single weight, or two faces.

Keep the ledger at `assets/tenant-ledger.json` current. A ledger nobody appends to proves
nothing.

## Photography decides the design

Iranian barbershops have an Instagram grid: 4:5 phone photos, mixed white balance, direct
flash, cluttered backgrounds. Design for that reality.

- **Never full-bleed a phone photo.** A 1080px-wide image behind a 1920px hero looks cheap
  instantly. Let type and colour carry the full-bleed moments; constrain photos to columns.
- **Impose one treatment on every photo** — a single grade (high-contrast monochrome, or a
  one-hue duotone) plus light grain. This is the highest-leverage move available and it
  works _better_ on imperfect source material than on clean stock.
- **Crop tight and vertical.** Design a grid that wants 4:5 and 3:4 instead of fighting them.
- **Results, not rooms.** Hair and beard detail crops survive low quality; wide interiors do
  not.
- **Budget 6–10 photos per layout**, because that is what a client will supply.
- Stock photography is a last resort: Unsplash and Pexels grant **no model release**, and
  their barbershop set (beard, fade, Edison bulbs) is on thousands of sites and is itself a
  tell. Twenty minutes with a phone near a window in the actual shop beats all of it, and
  makes "made for you" literally true.

## Then look at what you built

Generating CSS is not designing. Screenshot the page at 320 / 375 / 414 / 768 / 1440,
open the images, and judge them against `references/review-rubric.md`. Fix the worst single
thing, re-capture. Stop after four rounds and show the trace.

If every score is ≥4 on the first round, that is evidence the rubric is being gamed rather
than that the page is good. Say so instead of declaring success.

## Anti-patterns

→ `references/anti-patterns.md` — the AI-design tells, the Iranian-barbershop clichés, and
the RTL-specific ones. Read it before the first commit, not after.

One from it deserves repeating here: **`#c9a227` gold on near-black is this project's own
default** (`globals.css`). It is therefore forbidden unless a specific brief demands it.
