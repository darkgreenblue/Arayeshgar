/**
 * Barrel for the section layer, so a theme can keep one import.
 *
 * Each section now lives in its own file. Adding a *variant* of a section means adding a file
 * beside it and exporting it here — which is the whole point of the split: three themes used
 * to share one fixed set of eight sections in one fixed order, and that, not the palettes, is
 * what made every tenant's site recognisable as the same site.
 */
export { cx, BookButton, StickyBookBar, Section } from "./primitives";
export { ServicesList } from "./services";
export { Gallery } from "./gallery";
export { StaffGrid } from "./staff";
export { Hours } from "./hours";
export { Contact } from "./contact";
export { Faq } from "./faq";
export { Footer } from "./footer";
