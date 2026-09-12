"use client";
/**
 * The «ادمین‌ها» page body — CLAUDE.md §6 path 3.
 *
 * Two ways in, because the two situations are genuinely different:
 *  - **Invite code:** you do not know the person's numeric Telegram id, which is the normal
 *    case. In practice this is the only one that works on a non-technical salesperson.
 *  - **Numeric id:** you already have it (from `Ops → admin-list`, or your own account).
 *
 * A row is never deleted, only switched off, so the roster keeps showing who used to have
 * access. Deactivating also burns any unused invite code — that is how you take back a code
 * that reached the wrong chat.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// The deep path, not the barrel: the barrel reaches node:fs and cannot be bundled for the
// browser. Every other client component imports these the same way.
import { toPersianDigits } from "@arayeshgar/core/utils/phone";
import { api } from "@/components/booking/api";

export type AdminRow = {
  id: string;
  displayName: string;
  username: string;
  telegramChatId: number | null;
  baleChatId: number | null;
  isActive: boolean;
  createdAtFa: string;
  pendingInvite: { code: string; expiresAtFa: string; expired: boolean } | null;
};

export function AdminRoster({ rows, meId }: { rows: AdminRow[]; meId: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [name, setName] = useState("");
  const [tgId, setTgId] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The freshly minted code, held separately so it survives the refresh that follows.
  const [fresh, setFresh] = useState<{ code: string; name: string } | null>(null);
  const busy = pending || refreshing;
  const list = rows;

  /**
   * Runs one action, then re-reads the roster from the server rather than patching local
   * state: the server is the authority, and `admin.add` on an existing id can change a row
   * this component never knew about.
   */
  async function run<T>(action: string, payload: unknown): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api<{ result: T }>("/api/platform/actions", {
        method: "POST",
        body: JSON.stringify({ action, payload }),
      });
      startRefresh(() => router.refresh());
      return r.result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card title="دعوت با کد (پیشنهادی)">
        <p className="mb-2 text-xs opacity-60">
          آی‌دی عددی طرف را لازم ندارید. یک کد بسازید، برایش بفرستید، و او در ربات{" "}
          <code dir="ltr">/link ‹کد›</code> را می‌نویسد. کد یک ساعت اعتبار دارد و یک‌بار مصرف است.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نام نمایشی (مثلاً: فروشنده — رضا)"
            className="min-w-48 flex-1 rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            onClick={async () => {
              const r = await run<{ code: string }>("admin.invite", {
                displayName: name.trim() || undefined,
              });
              if (!r) return;
              setFresh({ code: r.code, name: name.trim() });
              setName("");
              setMsg("کد ساخته شد");
            }}
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            ساخت کد دعوت
          </button>
        </div>
        {fresh && (
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm">
            <div className="mb-1 opacity-70">
              این پیام را برای {fresh.name ? `«${fresh.name}»` : "او"} بفرستید:
            </div>
            <code
              className="fa-nums block rounded-lg bg-white px-3 py-2 text-base font-black"
              dir="ltr"
            >
              /link {fresh.code}
            </code>
          </div>
        )}
      </Card>

      <Card title="افزودن با آی‌دی عددی تلگرام">
        <p className="mb-2 text-xs opacity-60">
          وقتی آی‌دی را از قبل دارید. اگر این آی‌دی قبلاً حسابی داشته، همان حساب به ادمین پلتفرم
          برگردانده می‌شود.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={tgId}
            onChange={(e) => setTgId(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            dir="ltr"
            placeholder="123456789"
            className="fa-nums min-w-40 flex-1 rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
          <button
            disabled={busy || tgId.length === 0}
            onClick={async () => {
              const r = await run<{ created: boolean }>("admin.add", { telegramId: tgId });
              if (!r) return;
              setTgId("");
              setMsg(r.created ? "ادمین اضافه شد" : "این حساب به ادمین پلتفرم برگردانده شد");
            }}
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            افزودن
          </button>
        </div>
      </Card>

      <Card title={`ادمین‌ها (${toPersianDigits(list.length)})`}>
        <ul className="space-y-2">
          {list.map((a) => (
            <li
              key={a.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 p-3 ${a.isActive ? "" : "opacity-55"}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-bold">
                  {a.displayName}
                  {a.id === meId && (
                    <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white">
                      شما
                    </span>
                  )}
                  {!a.isActive && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs">غیرفعال</span>
                  )}
                  {a.pendingInvite && !a.pendingInvite.expired && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      منتظر اتصال
                    </span>
                  )}
                  {a.pendingInvite?.expired && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      کد منقضی شد
                    </span>
                  )}
                </div>
                <div className="fa-nums mt-0.5 text-xs opacity-60">
                  {a.telegramChatId != null && (
                    <span className="me-2">تلگرام: {toPersianDigits(a.telegramChatId)}</span>
                  )}
                  {a.baleChatId != null && (
                    <span className="me-2">بله: {toPersianDigits(a.baleChatId)}</span>
                  )}
                  {a.telegramChatId == null && a.baleChatId == null && (
                    <span className="me-2">به هیچ چتی وصل نیست</span>
                  )}
                  <span>· افزوده: {a.createdAtFa}</span>
                </div>
                {a.pendingInvite && !a.pendingInvite.expired && (
                  <div className="fa-nums mt-1 text-xs">
                    کد: <code dir="ltr">/link {a.pendingInvite.code}</code> — تا{" "}
                    {a.pendingInvite.expiresAtFa}
                  </div>
                )}
              </div>
              <button
                disabled={busy || (a.isActive && a.id === meId)}
                title={
                  a.isActive && a.id === meId ? "حساب خودتان را نمی‌توانید غیرفعال کنید" : undefined
                }
                onClick={async () => {
                  const r = await run<{ isActive: boolean }>("admin.setActive", {
                    id: a.id,
                    isActive: !a.isActive,
                  });
                  if (!r) return;
                  setMsg(r.isActive ? "فعال شد" : "غیرفعال شد");
                }}
                className={`rounded-xl px-3 py-1.5 text-sm font-bold disabled:opacity-40 ${
                  a.isActive ? "border border-red-300 text-red-700" : "bg-black text-white"
                }`}
              >
                {a.isActive ? "غیرفعال کردن" : "فعال کردن"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs opacity-50">
          ادمین‌ها حذف نمی‌شوند، فقط خاموش می‌شوند — تا سابقه‌ی دسترسی گم نشود. غیرفعال کردن، کد
          دعوت استفاده‌نشده را هم می‌سوزاند.
        </p>
      </Card>

      {(msg || error) && (
        <p className={`text-sm ${error ? "text-red-600" : "text-emerald-700"}`}>{error ?? msg}</p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-black">{title}</h2>
      {children}
    </section>
  );
}
