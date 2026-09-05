"use client";
import { useState } from "react";
import { api } from "@/components/booking/api";

type Meta = { key: string; label: string; description: string; mvp: boolean };

export function TenantControls(props: {
  id: string;
  status: string;
  customDomain: string | null;
  features: Record<string, boolean>;
  featureMeta: Meta[];
  hasTelegram: boolean;
  hasBale: boolean;
  baseDomainHint: string;
}) {
  const [features, setFeatures] = useState(props.features);
  const [status, setStatus] = useState(props.status);
  const [domain, setDomain] = useState(props.customDomain ?? "");
  const [telegram, setTelegram] = useState("");
  const [bale, setBale] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: string, payload: unknown, success: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api<{ result: T }>("/api/platform/actions", {
        method: "POST",
        body: JSON.stringify({ action, payload }),
      });
      setMsg(success);
      return r.result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card title="وضعیت">
        <div className="flex flex-wrap gap-2">
          {(["demo", "active", "suspended"] as const).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={async () => {
                const r = await run<{ status: string }>(
                  "tenant.setStatus",
                  { id: props.id, status: s },
                  "وضعیت تغییر کرد",
                );
                if (r) setStatus(r.status);
              }}
              className={`rounded-full border px-4 py-1.5 text-sm ${status === s ? "border-black bg-black text-white" : "border-black/20"}`}
            >
              {s === "demo" ? "دمو" : s === "active" ? "فعال (فروخته شده)" : "معلق"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-50">
          «معلق» سایت و ربات‌ها را موقتاً می‌بندد؛ داده‌ها دست‌نخورده می‌ماند.
        </p>
      </Card>

      <Card title="ماژول‌ها">
        <ul className="grid gap-2 sm:grid-cols-2">
          {props.featureMeta.map((f) => (
            <li
              key={f.key}
              className={`flex items-start gap-2 rounded-xl border border-black/10 p-2 ${f.mvp ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={features[f.key] === true}
                disabled={busy || !f.mvp}
                onChange={async (e) => {
                  const next = { ...features, [f.key]: e.target.checked };
                  setFeatures(next);
                  const r = await run<Record<string, boolean>>(
                    "tenant.setFeatures",
                    { id: props.id, features: { [f.key]: e.target.checked } },
                    "ذخیره شد",
                  );
                  if (r) setFeatures(r);
                }}
              />
              <span>
                <span className="block text-sm font-bold">
                  {f.label}
                  {!f.mvp && " (به‌زودی)"}
                </span>
                <span className="block text-xs opacity-60">{f.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="دامنه اختصاصی">
        <p className="mb-2 text-xs opacity-60">
          مشتری یک رکورد CNAME از دامنه‌اش به{" "}
          <span dir="ltr" className="font-bold">
            {props.baseDomainHint}
          </span>{" "}
          بزند، بعد دامنه را اینجا ثبت کنید. گواهی SSL خودکار صادر می‌شود.
        </p>
        <div className="flex gap-2">
          <input
            dir="ltr"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="alibarber.ir"
            className="flex-1 rounded-xl border border-black/15 p-2.5 text-sm"
          />
          <button
            disabled={busy}
            onClick={() =>
              run("tenant.setDomain", { id: props.id, domain: domain || null }, "دامنه ذخیره شد")
            }
            className="rounded-xl bg-black px-4 text-sm font-bold text-white"
          >
            ذخیره
          </button>
        </div>
      </Card>

      <Card title="توکن ربات‌ها">
        <p className="mb-2 text-xs opacity-60">
          فعلی: تلگرام {props.hasTelegram ? "✅" : "—"} · بله {props.hasBale ? "✅" : "—"}. وارد
          کردن توکن تازه، قبلی را جایگزین می‌کند و وب‌هوک خودکار ست می‌شود.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            dir="ltr"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="توکن تلگرام"
            className="rounded-xl border border-black/15 p-2.5 text-sm"
          />
          <input
            dir="ltr"
            value={bale}
            onChange={(e) => setBale(e.target.value)}
            placeholder="توکن بله"
            className="rounded-xl border border-black/15 p-2.5 text-sm"
          />
        </div>
        <button
          disabled={busy || (!telegram && !bale)}
          onClick={() =>
            run(
              "tenant.setTokens",
              { id: props.id, ...(telegram ? { telegram } : {}), ...(bale ? { bale } : {}) },
              "توکن‌ها ذخیره شد",
            )
          }
          className="mt-2 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          ذخیره توکن‌ها
        </button>
      </Card>

      <Card title="بازنشانی رمز آرایشگر">
        <div className="flex gap-2">
          <input
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="رمز جدید (حداقل ۸ کاراکتر)"
            className="flex-1 rounded-xl border border-black/15 p-2.5 text-sm"
          />
          <button
            disabled={busy || password.length < 8}
            onClick={async () => {
              const r = await run<{ username: string }>(
                "tenant.resetOwnerPassword",
                { id: props.id, password },
                "رمز عوض شد",
              );
              if (r) setMsg(`رمز حساب «${r.username}» عوض شد`);
              setPassword("");
            }}
            className="rounded-xl bg-black px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            تغییر
          </button>
        </div>
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
