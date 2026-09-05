import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { currentUser } from "@/lib/session";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const tenant = await requireTenant();
  if (await currentUser(tenant.id)) redirect("/admin");
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center p-6">
      <div className="w-full rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-black">ورود به پنل</h1>
        <p className="mb-6 text-sm opacity-60">{tenant.branding.displayName}</p>
        <LoginForm />
      </div>
    </main>
  );
}
