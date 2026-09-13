# Review rubric

Load this only at the review step, after the page renders. Two halves, deliberately
separated: the mechanical half is pass/fail and should be scripted; the observational half is
judgement and must not be forced into assertions.

## A. Mechanical — pass/fail, no opinion involved

| Check                          | Fails when                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| No hardcoded colour            | A hex or `oklch()` literal appears outside the token definitions                     |
| Spacing on scale               | A margin or padding value is not on the defined scale                                |
| Persian tracking               | `letter-spacing` is non-zero on any Persian text, or a `tracking-*` class reaches it |
| Line-height floor              | Persian body below 1.8, or headings below 1.4                                        |
| No logical-property violations | `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` appear      |
| No stale v3 RTL hacks          | `space-x-reverse` or `divide-x-reverse` appear                                       |
| No horizontal scroll           | The page scrolls sideways at 320, 375, 414 or 768                                    |
| Grid tracks                    | A grid track lacks `minmax(0, 1fr)` and so overflows its content                     |
| Mirror-only overflow           | A layout overflows under `dir="rtl"` but not under `dir="ltr"`                       |
| Focus ring                     | Contrast under 3:1, or it animates                                                   |
| Reduced motion                 | `prefers-reduced-motion` is not honoured                                             |
| Body contrast                  | Under 4.5:1                                                                          |
| Persian digits                 | A display context (price, hours, date, count) shows Latin digits                     |
| Isolation                      | A Latin or neutral run sits in Persian text without `bdi`, `dir`, or `isolate()`     |
| ZWNJ                           | A known construction is missing U+200C (`میشود` instead of `می‌شود`)                 |
| Persian letterforms            | Arabic `ي` or `ك` appears instead of `ی` / `ک`                                       |

## B. Observational — 1–5, phrased as measurements

Score these by **looking at the screenshots**, and answer the question as asked. They are
written as things to count or name, not as "does this look good", because an evaluative
question invites a generous answer.

1. **Count the words in the hero headline.** Seven or fewer?
2. **How many distinct `border-radius` values appear on screen?** More than two is usually
   an unmade decision.
3. **How many distinct shadow values?**
4. **Is the boldest element on screen the single most important one** — or are three things
   competing for first place?
5. **Name the emphasis device used in the hero.** Is it weight, size, colour, position, rule
   or space? If the answer is "an unavailable-in-Persian device faked badly", that is a 1.
6. **Does the hero show something specific to _this_ shop**, or something any barbershop
   could have used?
7. **If you removed the brand colour entirely, would the page still have hierarchy?** If not,
   colour is carrying structure it should not be carrying.
8. **Count the photographs and name their treatment.** Do they read as one art-directed set,
   or as a folder of phone pictures?
9. **Where does the eye go first, second, third?** Is that the order the business wants?
10. **What would you remove?** There should always be an answer.

## C. The plateau warning

If every item scores 4 or 5 on the first round, do not report success. That pattern means the
rubric is being optimised rather than the page — the known failure mode of self-review. Say
so, show the screenshots, and let a human look.

Cap at four rounds. Show the score trace across rounds so the direction of travel is visible,
not just the final number.
