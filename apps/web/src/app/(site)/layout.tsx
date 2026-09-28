import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeStyle } from "@/components/ThemeStyle";
import { currentTenant } from "@/lib/tenant";
import { isThemeKey } from "@arayeshgar/themes";

export async function generateMetadata(): Promise<Metadata> {
  const r = await currentTenant();
  const b = r.tenant?.branding;
  if (!b) return { title: "آرایشگر" };
  return {
    title: b.seo?.title ?? `${b.displayName} | رزرو وقت آنلاین`,
    description: b.seo?.description ?? b.tagline ?? `رزرو آنلاین نوبت ${b.displayName}`,
    openGraph: {
      title: b.displayName,
      description: b.tagline ?? undefined,
      images: b.heroImageUrl ? [b.heroImageUrl] : undefined,
    },
  };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const r = await currentTenant();
  if (r.kind === "platform") return <>{children}</>;
  if (!r.tenant || r.tenant.status === "suspended") {
    return (
      <main className="grid min-h-dvh place-items-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold">این آدرس هنوز به آرایشگری متصل نیست</h1>
          <p className="mt-2 opacity-60">اگر صاحب این دامنه هستید، از پنل پلتفرم آن را ثبت کنید.</p>
        </div>
      </main>
    );
  }
  const theme = isThemeKey(r.tenant.theme) ? r.tenant.theme : "night-gold";
  return (
    <div data-theme={theme} className={`theme-${theme} min-h-dvh`}>
      <ThemeStyle branding={r.tenant.branding} />
      {children}
      {r.tenant.status === "demo" && (
        // برند خودِ مستاجر، نه رنگ ثابت — و بدون نام داخلیِ تم، که برای مشتری بی‌معنی است.
        <div
          className={`fixed start-0 z-50 m-2 rounded-lg bg-[var(--brand)] px-2 py-0.5 text-[11px] font-bold shadow ${theme === "night-portrait" ? "bottom-20 text-[#0b0b0f] sm:bottom-0" : "bottom-0 text-[var(--brand-contrast)]"}`}
        >
          نسخه نمایشی
        </div>
      )}
    </div>
  );
}
