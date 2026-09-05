import { redirect } from "next/navigation";
import { PlatformLoginForm } from "@/components/platform/PlatformLoginForm";
import { currentUser } from "@/lib/session";
import { currentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function PlatformLogin() {
  const r = await currentTenant();
  if (r.kind !== "platform") redirect("/");
  const u = await currentUser(null);
  if (u?.role === "platform_admin") redirect("/platform");
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center p-6">
      <div className="w-full rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-black">پنل پلتفرم</h1>
        <PlatformLoginForm />
      </div>
    </main>
  );
}
