import type { TenantBranding } from "@arayeshgar/db";

const FONT_VAR: Record<string, string> = {
  vazirmatn: "var(--font-vazirmatn)",
  estedad: "var(--font-estedad)",
  sahel: "var(--font-sahel)",
};

/** Contrast color (black/white) for text on the brand color. */
export function contrastOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#000000";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0e0e10" : "#ffffff";
}

/** Injects tenant brand tokens as CSS variables on :root. */
export function ThemeStyle({ branding }: { branding: TenantBranding }) {
  const css = `:root{--brand:${branding.primaryColor};--brand-contrast:${contrastOf(branding.primaryColor)};--accent:${branding.accentColor ?? branding.primaryColor};--font-heading:${FONT_VAR[branding.fontHeading] ?? FONT_VAR.estedad};--font-body:${FONT_VAR[branding.fontBody] ?? FONT_VAR.vazirmatn};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
