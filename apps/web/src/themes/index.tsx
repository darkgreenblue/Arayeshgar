import type { ReactNode } from "react";
import type { Tenant } from "@arayeshgar/db";
import type { SiteContent } from "@arayeshgar/core";
import { isThemeKey, type ThemeKey } from "@arayeshgar/themes";
import { NightGold, NightGoldShell } from "./night-gold/Template";
import { LightEditorial, LightEditorialShell } from "./light-editorial/Template";
import { BoldModern, BoldModernShell } from "./bold-modern/Template";

export type ShellProps = { tenant: Tenant; title?: string; children: ReactNode };
export type Template = (props: { content: SiteContent }) => ReactNode;
export type Shell = (props: ShellProps) => ReactNode;

/**
 * Theme registry for the web app. A theme = full landing template + a "shell" (header/footer +
 * colors) that wraps secondary pages (booking flow, booking status) so the brand stays consistent.
 */
const REGISTRY: Record<ThemeKey, { Template: Template; Shell: Shell }> = {
  "night-gold": { Template: NightGold, Shell: NightGoldShell },
  "light-editorial": { Template: LightEditorial, Shell: LightEditorialShell },
  "bold-modern": { Template: BoldModern, Shell: BoldModernShell },
};

export function themeKey(v: string): ThemeKey {
  return isThemeKey(v) ? v : "night-gold";
}
export function renderTheme(content: SiteContent) {
  const { Template } = REGISTRY[themeKey(content.tenant.theme)]!;
  return <Template content={content} />;
}
export function themeShell(v: string): Shell {
  return REGISTRY[themeKey(v)]!.Shell;
}
