# Persian web typography — rules, with the reason for each

Every measurement here was taken from the actual font files or by compiling against the
Tailwind version installed in this repo. Where something is not verified, it says so.

## 1. The three unavailable devices, and what replaces them

| Unavailable                                         | Why                                                                                                                                                                      | Use instead                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `uppercase`, small-caps, ALL-CAPS eyebrows          | Arabic script has no letter case                                                                                                                                         | Weight jump (e.g. 560 label vs 420 body), a rule, or colour |
| Italic, accenting one word in italic                | No italic tradition; obliquing is a distortion                                                                                                                           | Weight, size, or a colour shift on the whole phrase         |
| `letter-spacing`, `tracking-wide`, `tracking-tight` | The script joins by glyph overlap — left-joining letters extend past their bounding box, so tracking visibly tears words apart (W3C ALReq documents this as a known gap) | Size, weight, and space _around_ the block                  |

`tracking-tight` on a large heading is the reflex of every modern Latin design system and of
every generated Tailwind hero. In Persian it is a defect. **`letter-spacing: 0` on all
Persian text, always.** Tracking is legitimate only on a Latin run that is scoped and
isolated — a booking code, for instance, where `tracking-widest` is correct.

## 2. Line height is a floor, not a preference

Persian has deep descenders (ج چ ح خ ع غ ی), tall ascenders (ا ل ک گ), and dots above and
below. Measured font metrics:

| Font              | upem | typoAscender | typoDescender | Minimum content box |
| ----------------- | ---- | ------------ | ------------- | ------------------- |
| Vazirmatn v33.003 | 2048 | 2100         | −1100         | **1.5625em**        |
| Estedad v8.5      | 1000 | 1025         | −500          | **1.525em**         |

So `leading-tight` / `leading-none` will clip descenders. Body **1.8–2.0**, headings
**1.4–1.55**. The repo already sets 1.9 / 1.5.

Also set Persian roughly 1px larger than the Latin equivalent at the same optical weight —
Persian x-height runs low (Vazirmatn 1082/2048 ≈ 0.53em).

## 3. Fonts — licence status matters because we sell these sites

We are the supplier of record. A licence claim over a font on a client's site arrives at
**our** invoice, not theirs.

### Safe: OFL 1.1, commercial use and embedding permitted

| Font                                           | Notes                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estedad**                                    | **Prefer as primary.** Actively maintained, variable `wght 100–900`, 2276 glyphs, rich OpenType (`frac`, `onum`, `smcp`, `ss01–ss20`, `zero`)                                |
| **Vazirmatn**                                  | Excellent and familiar, variable, but **frozen**: the author died in Nov 2023 and the last release was mid-2024. Fine as body or fallback; do not build new capability on it |
| **Sahel**                                      | Has a `Farsi-Digits` build that remaps Latin digit codepoints to Persian outlines — zero-JS Persian digits if ever needed                                                    |
| **Lalezar**                                    | A genuine free Persian _display_ face. Rare and useful                                                                                                                       |
| **Arad**                                       | The most credible newer open variable Persian font; self-host, not on npm                                                                                                    |
| Shabnam, Samim, Gandom, Tanha, Nahid, Parastoo | All OFL, but all **archived / discontinued**. Legally safe, strategically dead                                                                                               |
| **IranNastaliq**                               | OFL. Useful for a single decorative logotype. Never for body text                                                                                                            |

### Not free — do not ship without a purchased licence

**IRANSans / IRANSansX · IRANYekan / IRANYekanX · Dana · Morabba · Kalameh · Peyda · Ravi ·
Rokh · Yekan Bakh.** All commercial, sold through fontiran.com.

Two specific traps:

- **`irfont.ir` claims Kalameh is "MIT". It is not.** There is no official repository; the
  only GitHub copy is an unlicensed dump.
- **Yekan Bakh**'s rights holders actively issue takedowns.

Treat these as infringing sources regardless of what they call themselves: `download-font.ir`,
`fontchi.com`, `fontyar.com`, `marava.ir`, `sanagraphic.ir`, `ufont.ir`, `fonnts.com`,
`onlinewebfonts.com`, and the GitHub dumps `Ghalbeyou/Free-Iran-Fonts-Repo`,
`akiarostami/iransans`, `rahatool/persian-fonts`, `TechDude9/font`.

**The legitimate route, and the only one payable from Iran:** fontiran sells a **web-font
licence per domain**, one-time, no expiry, in Toman on a Shetab card — roughly 20k–100k T
per project. That maps exactly onto one-customer-at-a-time. A distinctive licensed display
face is the cheapest available route to "you can't find one like it."

### Use the variable builds

Measured, `arabic` subset: Vazirmatn variable **46 KB** vs four static weights **86 KB**;
Estedad variable **57 KB** vs three static **81 KB**. Smaller _and_ it unlocks the whole
100–900 axis.

That axis is the point. Since case and italic are unavailable, **weight is the primary
hierarchy tool**, and nothing says "a machine chose this" faster than every heading at 700
and every paragraph at 400. Use real values: hero 820, section label 560, body 420,
caption 380.

Caveat: the Google Fonts and Fontsource builds strip roughly 60% of the glyphs and almost
all OpenType features — Vazirmatn drops from 1333 glyphs to 541, Estedad from 2276 to 774,
and `frac`, `onum`, `lnum`, `smcp`, `salt`, `ss01…` disappear. `tnum` survives in every
build. If a design needs fractions or old-style figures, self-host the upstream file.

## 4. Numbers, and the bidi rules that actually bite

Persian uses Extended Arabic-Indic digits ۰۱۲۳۴۵۶۷۸۹ (U+06F0–06F9). Two facts that trip
people up:

- **`font-variant-numeric` cannot change numeral systems.** Neither does `lang="fa"`.
  Conversion is a JS/Intl concern — `toPersianDigits` in `packages/core` does it.
- `font-variant-numeric: tabular-nums` **does** work and is worth using: put it on price
  columns and time-slot grids so `۰۹:۳۰` and `۱۱:۰۰` align. Ragged price columns are the
  visual signature of a cheap site; aligned ones read as typeset.

Where to use which:

| Context                                                             | Digits                                          |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| Display — prices, hours, dates, counts                              | **Persian**                                     |
| Form inputs, `tel:` hrefs, booking codes, card numbers being copied | **Latin** (they get typed, pasted, and dialled) |

**Isolation.** A Latin or neutral run inside Persian text reorders: the neutral characters
around it take the paragraph direction. On the web use `bdi` (or `dir="ltr"`, which the
HTML5 UA stylesheet also makes an isolate). In Telegram messages there is no `bdi`, so use
U+2068/U+2069 — that is what `isolate()` in `packages/core/src/utils/phone.ts` is for.

Already verified safe in this repo: prices (`۴۵۰٬۰۰۰ تومان`, Persian digits + U+066C) and
phone numbers (`dir="ltr"`). The case that needed fixing was the six-letter booking code.

## 5. Text correctness that a Persian reader notices instantly

- **ZWNJ (نیم‌فاصله, U+200C)** is required inside words: `می‌شود` not `میشود` or `می شود`;
  `آرایشگاه‌ها` not `آرایشگاه ها`. Its absence is the fastest way for a Persian reader to
  identify machine-written or carelessly-pasted copy. One malformed `میشود` in a hero
  undoes the whole visual design.
- **Persian letterforms, never Arabic ones:** `ی` (U+06CC) not `ي` (U+064A); `ک` (U+06A9)
  not `ك` (U+0643). Mixed forms render inconsistently and read as broken.
- `@persian-tools/persian-tools` has both the Arabic→Persian normaliser and a half-space
  fixer, plus number-to-words (`چهارصد و پنجاه هزار تومان`), Iranian mobile validation, and
  Sheba/card validation.

## 6. Tailwind v4 and RTL — verified by compiling against the version in this repo

**Automatically logical, no `rtl:` needed:** `ms-* me-* ps-* pe-*`, `start-* end-*`,
`inset-s-*`, `border-s-* border-e-*`, `rounded-s-*`, `text-start text-end`,
`float-start float-end`, `scroll-ms-*`.

**Changed from v3 and easy to get wrong:** `space-x-*` and `divide-x-*` are now logical
(`margin-inline-start/end`). So **`space-x-reverse` and `divide-x-reverse` are no longer
needed for RTL and are actively harmful** — they double-flip.

**Still physical — needs a manual `rtl:` override:** `translate-x-*`, `bg-linear-to-r` /
`to-l`, shadow X offsets, `rotate-*`, `skew-x-*`, `origin-left/right`, `bg-left/right`,
`object-left/right`, and **every icon with an implied direction** (chevrons, arrows, carousel
controls, back buttons).

**A specificity trap:** `rtl:` compiles to a selector wrapped in `:where(...)`, which has
specificity 0 — identical to the plain utility. **Source order decides**, so a later
physical utility can silently beat your `rtl:` override.

**Mirror only what is directional.** Arrows, chevrons, progress: mirror. Clocks, logos,
photographs, scissors and comb imagery: do not.

## 7. Dates and the booking picker

- Jalali is not optional. A premium Iranian site showing Gregorian dates reads as foreign.
- `packages/core/src/utils/jalali.ts` already uses `jalaali-js` + `Intl` with `Asia/Tehran`.
  Keep it as the source of truth; never let a UI date library own slot maths.
- `Intl` alone covers display: `Intl.DateTimeFormat('fa-IR')` → `۱۴۰۵ شهریور ۲۲, یکشنبه`;
  `Intl.NumberFormat('fa-IR')` → `۴۵۰٬۰۰۰`. No library needed.
- **For the customer booking flow, do not use a calendar widget.** It is day chips plus
  time-slot chips: 7–14 day buttons rendered from `Intl` (`شنبه ۲۲ شهریور`) with
  availability on each (`۳ وقت آزاد` / `پُر`), then a grid of time buttons with
  `tabular-nums`. Zero dependencies, better typography, and it can show information a
  calendar cannot.
- A real month grid belongs in `/admin` (holidays, blocking a week), not in the customer
  flow. `@daypicker/persian` is the maintained choice there.
- **Abandoned, do not adopt:** `react-multi-date-picker` (no release in ~27 months, no React
  19 support declared), `zaman`, `persian-date`, `persian-datepicker`, `jalali-moment`,
  `dayjs-jalali`, `react-modern-calendar-datepicker`.

## 8. One trap we have not stepped into — keep it that way

`next/og` / `ImageResponse` is built on Satori, which **does not shape Arabic or Persian**
and has no plan to. Generated OG cards would render as disconnected, reversed letters — and
they would look perfect in development and broken in every Telegram and WhatsApp share,
which is this product's entire distribution channel.

This repo currently generates no OG images; `generateMetadata` points at the tenant's real
hero photo, which is correct. If a generated card is ever wanted, pre-shape the text, render
with a real browser, or hand-make static images per tenant — and verify by pasting a link
into Telegram, because a green build proves nothing here.
