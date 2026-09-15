/** Theme registry. Components arrive in phase 2; the registry exists now so tenants.theme is typed. */
export const THEMES = {
  "night-gold": {
    label: "شب و طلا",
    description: "تیره‌ی لوکس با لهجه طلایی",
    defaultPrimary: "#C9A227",
  },
  "light-editorial": {
    label: "روشن و مینیمال",
    description: "روشن، ادیتوریال، یک رنگ اکسنت",
    defaultPrimary: "#1F5F4A",
  },
  "bold-modern": {
    label: "مدرن و پررنگ",
    description: "رنگی، انیمیشن، چیدمان bento",
    defaultPrimary: "#6D28D9",
  },
  "night-portrait": {
    label: "شب و پرتره",
    description: "تیره، نمونه‌کار در صدر، عکس‌محور",
    defaultPrimary: "#7B85E0",
  },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
export function isThemeKey(v: string): v is ThemeKey {
  return v in THEMES;
}
