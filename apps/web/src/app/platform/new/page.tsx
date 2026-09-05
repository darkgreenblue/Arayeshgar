import Link from "next/link";
import { aiCopyAvailable, DEFAULT_HOURS, DEFAULT_SERVICES } from "@arayeshgar/core";
import { OnboardingWizard } from "@/components/platform/OnboardingWizard";
import { requirePlatformPage } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function NewTenant() {
  await requirePlatformPage();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black">مشتری جدید</h1>
        <Link href="/platform" className="text-sm opacity-70 hover:opacity-100">
          ← بازگشت
        </Link>
      </div>
      <OnboardingWizard
        defaults={{ services: DEFAULT_SERVICES, hours: DEFAULT_HOURS }}
        aiAvailable={aiCopyAvailable()}
      />
    </main>
  );
}
