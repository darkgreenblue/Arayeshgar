# Anti-patterns

Three lists. The first is generic AI-design tells, the second is specific to Iranian
barbershops, the third is RTL. Read before the first commit.

## 1. The generated-page tells

`frontend-design` names five clusters that read as machine-made. Condensed, with the values
so they are recognisable:

1. **Warm cream ground (about `#F4F1EA`) + high-contrast serif + terracotta accent (about `#D97757`)**
   — that accent is Anthropic's own, so on a client brief it reads as a tell.
2. **Near-black + one acid-green or vermilion accent.**
3. **Broadsheet**: hairline rules, zero radius, dense columns.
4. **The SaaS-card kit**: identical rounded cards, one radius on everything, the same
   `rgba(0,0,0,.1)` shadow, gradient washes used as decoration.
5. **Template chrome**: tracked-out ALL-CAPS eyebrows, meta joined with middle dots
   (`A · B · C`), `WORD — fragment` with a spaced em dash, tinted near-black (`#0B0B0B`,
   `#111`) standing in for black, monospace small labels, `→` appended to buttons.

Plus, from the same source: no accenting a single word in a headline; no all-caps labels; no
labels above content for their own sake; numbered markers (01 / 02 / 03) **only** if the
content genuinely is a sequence; measure under 80 characters; one orchestrated motion moment
beats per-section fade-and-slide-up; spend boldness in one place; remove one accessory.

Note how many of these are _already impossible_ in Persian — all-caps eyebrows, italic
accents, tracked-out labels. That is the constraint working in our favour.

## 2. Iranian barbershop clichés

- **Gold-on-black.** Specifically `#c9a227`, which is this repo's own default `--brand` in
  `globals.css`. It is the single most predictable choice for a Persian barbershop site.
  Forbidden unless a brief demands it.
- Persian-rug or tile patterns used as a background texture.
- Crossed scissors / straight razor / barber pole iconography.
- **"BARBER SHOP" set in English display type above Persian copy.** Extremely common,
  instantly cheap, and it fights the RTL reading order.
- Stock photos of Western bearded men. See the photography section of `SKILL.md`.
- Marble texture overlays.
- A before/after slider as the hero.
- Faux-vintage badge lockups ("EST. ۱۳۸۵" inside a circle with laurels).

## 3. RTL tells

- Physical properties left in place: `ml-*`, `pr-*`, `left-*`, `text-left`. Use the logical
  equivalents.
- **Un-mirrored chevrons and arrows** — the most frequently shipped RTL bug. A "next" arrow
  pointing right in an RTL flow.
- **Over-mirrored content**: flipped photographs, flipped logos, flipped clock faces. Mirror
  direction, not imagery.
- Gregorian dates.
- Latin digits in prices and hours.
- `tracking-*` or `leading-tight` arriving inside a pasted component and silently breaking
  Persian text.
- A scrambled phone number or price caused by a missing isolate — a Persian reader reads
  that as "the site is broken", not as a bidi subtlety.
- `space-x-reverse` / `divide-x-reverse` left over from a Tailwind v3 RTL workaround. In v4
  those utilities are already logical and the reverse variants double-flip.

## 4. Sources that look usable and are not

Licences verified by reading the actual file, because search results were wrong on all three:

| Source                    | Claimed | Actual                                                                                                                                                                                                                  |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cruip free templates      | MIT     | **GPL-3.0** — copyleft on a proprietary client site                                                                                                                                                                     |
| Once UI "Magic Portfolio" | MIT     | **CC BY-NC 4.0** — non-commercial. The sibling `core` and `nextjs-starter` repos _are_ MIT; only the good-looking starter is poisoned, which is why people get caught                                                   |
| HTML5 UP                  | free    | **CC BY 3.0** — visible attribution is mandatory, which directly contradicts "we made this for you"                                                                                                                     |
| Origin UI                 | MIT     | **AGPL-3.0** with an MIT carve-out for two subdirectories. Not worth the per-file audit                                                                                                                                 |
| PersianLabs/ui            | —       | **No LICENSE file at all** ⇒ all rights reserved by default. It has exactly the pieces we lack (Jalali picker, Iranian bank/mobile inputs, Toman icon) — ask the maintainer for a licence or re-implement, do not paste |

Also: reusing one ThemeForest Regular License across two clients is an explicit violation —
it is one licence per client site. Webflow and Framer template licences are per-platform, so
porting one of those designs into Next.js is an unlicensed derivative.

## 5. Component kits: take the mechanism, not the look

- **shadcn/ui** — MIT, and its RTL support is first-class as of early 2026 (`rtl: true` in
  `components.json`; the CLI rewrites `ml-*→ms-*`, `left-*→start-*`, `text-left→text-start`
  and mirrors icons). Use the CLI transform rather than hand-auditing, because hand-auditing
  is exactly what ships one un-mirrored chevron. But **its default theme is the most
  recognisable "AI-generated" look on the web right now** — take the copy-in distribution
  model and the RTL transform, discard the visual defaults. Also ignore its suggestion of
  `Noto_Sans_Arabic`: that is an Arabic-first face and looks wrong for Persian.
- **Radix Primitives / Base UI / Ark UI** — MIT, unstyled, zero visual opinion. That is the
  point: it is the precondition for ten clients looking like ten different studios.
- **Ant Design** — mature RTL, but it is a dashboard aesthetic. Acceptable in `/admin`,
  never on a tenant's marketing site.
- **Free Tailwind block libraries** (Tailblocks, Wicked Blocks, and most of that category) —
  MIT and genuinely free, but described by their own authors as unopinionated with
  placeholder content. That _is_ the generic look. Useful as structural scaffolding you then
  restyle heavily; never as the design.

## 6. Motion

GSAP's full plugin set is free for commercial use as of April 2025 — including `SplitText`,
`ScrollSmoother`, `MorphSVG`, `DrawSVG`, `InertiaPlugin`. Verified by unpacking the public
package. `SplitText` on a Persian headline is the strongest premium signal available at zero
cost.

Two obligations: the licence forbids removing the proprietary notices, so **verify the
production build preserves the `/*!` legal comments**, and it contains a unilateral
amendment clause, so **pin the version per client project**.

Also free and MIT, all verified: Motion, Lenis, Embla (which has native `direction: 'rtl'`
— use it rather than hand-rolling a carousel), AutoAnimate.

Animate `transform` and `opacity` only. Entrances `ease-out`, exits `ease-in`, most UI
200–300ms. Honour `prefers-reduced-motion`.
