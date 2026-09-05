import { can, effectiveDeposit, effectiveRules } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsPanels } from "@/components/admin/SettingsPanels";
import { requireAdminPage } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireAdminPage();
  const t = { tenant: ctx.tenant };
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">تنظیمات</h1>
      <SettingsPanels
        deposit={effectiveDeposit(ctx.tenant)}
        depositFeatureOn={ctx.tenant.features.deposit === true}
        rules={effectiveRules(ctx.tenant)}
        branding={ctx.tenant.branding}
        theme={ctx.tenant.theme}
        bot={{
          telegramLinked: ctx.user.telegramChatId != null,
          baleLinked: ctx.user.baleChatId != null,
          telegramBot: ctx.tenant.telegramBotUsername,
          baleBot: ctx.tenant.baleBotUsername,
        }}
        perms={{
          deposit: can(ctx.user, "manage_deposit", t),
          rules: can(ctx.user, "manage_schedule", t),
          branding: can(ctx.user, "manage_branding", t),
        }}
      />
    </AdminShell>
  );
}
