"use client";
/**
 * Seven-step onboarding with a live preview beside it. Nothing is written until the final step,
 * and the payload is exactly the CLI's JSON, so both paths stay identical.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/booking/api";
import { SitePreview, type PreviewDraft } from "./SitePreview";

type Service = { name: string; durationMin: number; price: number; description?: string };
type Hour = { weekday: number; startMin: number; endMin: number };
type Mode = "solo" | "salon_central" | "salon_independent";
type Theme = "night-gold" | "light-editorial" | "bold-modern";

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const THEMES: { key: Theme; label: string; hint: string; color: string }[] = [
  { key: "night-gold", label: "شب و طلا", hint: "تیره، لوکس، مردانه", color: "#C9A227" },
  {
    key: "light-editorial",
    label: "روشن و مینیمال",
    hint: "ساده، تمیز، متن‌محور",
    color: "#1F5F4A",
  },
  { key: "bold-modern", label: "مدرن و پررنگ", hint: "رنگی، جوان، پرانرژی", color: "#6D28D9" },
];
const STEPS = ["برند", "خدمات", "ساعت کاری", "بیعانه", "ربات‌ها", "قالب", "تأیید"];

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const input = "w-full rounded-xl border border-black/15 bg-white p-2.5 text-sm";
const label = "mb-1 block text-xs font-bold opacity-70";

export function OnboardingWizard({
  defaults,
  aiAvailable,
}: {
  defaults: { services: Service[]; hours: Hour[] };
  aiAvailable: boolean;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; adminUsername: string; slug: string } | null>(
    null,
  );

  // brand
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("solo");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  // staff & services
  const [staff, setStaff] = useState<{ name: string; bio?: string }[]>([{ name: "" }]);
  const [services, setServices] = useState<Service[]>(defaults.services);
  // hours
  const [hours, setHours] = useState<Hour[]>(defaults.hours);
  // deposit
  const [deposit, setDeposit] = useState({
    enabled: false,
    cardNumber: "",
    cardHolder: "",
    bankName: "",
    mode: "fixed" as "fixed" | "percent",
    amount: 100000,
    policyText: "",
  });
  // bots
  const [telegramBotToken, setTelegram] = useState("");
  const [baleBotToken, setBale] = useState("");
  // look
  const [theme, setTheme] = useState<Theme>("night-gold");
  const [primaryColor, setPrimaryColor] = useState("#C9A227");
  // admin
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [status, setStatus] = useState<"demo" | "active">("demo");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // suggest a slug from the Instagram handle / name until the user edits it
  useEffect(() => {
    if (slugTouched || (!displayName && !instagram)) return;
    const id = setTimeout(async () => {
      try {
        const r = await post<{ slug: string }>("tenant.suggestSlug", {
          displayName,
          instagram: instagram || undefined,
        });
        setSlug(r.slug);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [displayName, instagram, slugTouched]);

  useEffect(() => {
    if (!slug) return setSlugFree(null);
    const id = setTimeout(async () => {
      try {
        const r = await post<{ available: boolean }>("tenant.slugCheck", { slug });
        setSlugFree(r.available);
      } catch {
        setSlugFree(null);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [slug]);

  const draft: PreviewDraft = useMemo(
    () => ({
      theme,
      primaryColor,
      displayName,
      tagline,
      about,
      heroImageUrl,
      gallery,
      services,
      staff,
      address,
      phone,
      mode,
    }),
    [
      theme,
      primaryColor,
      displayName,
      tagline,
      about,
      heroImageUrl,
      gallery,
      services,
      staff,
      address,
      phone,
      mode,
    ],
  );

  async function post<T>(action: string, payload: unknown): Promise<T> {
    const r = await api<{ result: T }>("/api/platform/actions", {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    });
    return r.result;
  }

  async function runAi() {
    setAiBusy(true);
    setAiNote(null);
    try {
      const r = await post<{
        copy: {
          tagline: string;
          about: string;
          serviceDescriptions: Record<string, string>;
          faq: { q: string; a: string }[];
        };
        source: string;
      }>("ai.copy", {
        displayName,
        mode,
        services: services.map((s) => ({ name: s.name })),
      });
      setTagline(r.copy.tagline);
      setAbout(r.copy.about);
      setServices((prev) =>
        prev.map((s) => ({
          ...s,
          description: r.copy.serviceDescriptions[s.name] ?? s.description,
        })),
      );
      setAiNote(
        r.source === "ai"
          ? "متن‌ها با هوش مصنوعی نوشته شد؛ آزادانه ویرایش کنید."
          : "کلید AI تنظیم نیست؛ از متن‌های آماده استفاده شد.",
      );
    } catch (e) {
      setAiNote((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        slug,
        displayName,
        mode,
        tagline: tagline || undefined,
        about: about || undefined,
        phone: phone || undefined,
        address: address || undefined,
        mapUrl: mapUrl || undefined,
        instagram: instagram || undefined,
        heroImageUrl: heroImageUrl || undefined,
        gallery,
        staff: staff.filter((s) => s.name.trim().length >= 2),
        services: services.filter((s) => s.name.trim().length >= 2),
        hours,
        deposit: deposit.enabled
          ? {
              ...deposit,
              cardNumber: deposit.cardNumber || undefined,
              cardHolder: deposit.cardHolder || undefined,
              bankName: deposit.bankName || undefined,
              policyText: deposit.policyText || undefined,
            }
          : { enabled: false, mode: deposit.mode, amount: 0 },
        telegramBotToken: telegramBotToken || undefined,
        baleBotToken: baleBotToken || undefined,
        theme,
        primaryColor,
        adminUsername,
        adminPassword,
        status,
      };
      const r = await post<{ url: string; adminUsername: string; slug: string }>(
        "tenant.create",
        payload,
      );
      setDone(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
        <h2 className="text-xl font-black">✅ آماده شد</h2>
        <p className="mt-2 text-sm opacity-70">سایت و پنل این آرایشگر همین حالا بالاست.</p>
        <div className="mx-auto mt-4 max-w-md space-y-2 text-start text-sm">
          <Row
            k="سایت"
            v={
              <a className="underline" href={done.url} target="_blank" rel="noreferrer">
                {done.url}
              </a>
            }
          />
          <Row
            k="پنل ادمین"
            v={
              <a className="underline" href={`${done.url}/admin`} target="_blank" rel="noreferrer">
                {done.url}/admin
              </a>
            }
          />
          <Row k="نام کاربری" v={<span dir="ltr">{done.adminUsername}</span>} />
          <Row k="رمز" v="همانی که وارد کردید" />
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <a
            href="/platform"
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white"
          >
            لیست مشتری‌ها
          </a>
          <a href="/platform/new" className="rounded-xl border border-black/15 px-4 py-2 text-sm">
            مشتری بعدی
          </a>
        </div>
      </div>
    );
  }

  const canNext =
    (step === 0 &&
      displayName.length >= 2 &&
      slug.length >= 3 &&
      slugFree !== false &&
      staff.some((s) => s.name.trim().length >= 2)) ||
    (step === 1 && services.some((s) => s.name.trim().length >= 2)) ||
    step === 2 ||
    (step === 3 && (!deposit.enabled || /^\d{16}$/.test(deposit.cardNumber))) ||
    step === 4 ||
    step === 5;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <ol className="mb-5 flex flex-wrap gap-1 text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-2.5 py-1 ${i === step ? "bg-black text-white" : i < step ? "bg-black/10" : "bg-black/5 opacity-50"}`}
            >
              {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <L t="نام نمایشی">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={input}
                  placeholder="آرایشگاه علی"
                />
              </L>
              <L
                t="آدرس سایت (زیردامنه)"
                hint={
                  slugFree === false
                    ? "این آدرس گرفته شده است"
                    : slugFree
                      ? "آزاد است ✓"
                      : "حروف انگلیسی کوچک و خط تیره"
                }
              >
                <input
                  dir="ltr"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                  className={`${input} ${slugFree === false ? "border-red-400" : ""}`}
                  placeholder="ali-barber"
                />
              </L>
              <L t="نوع کسب‌وکار">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className={input}
                >
                  <option value="solo">آرایشگر مستقل (یک نفر)</option>
                  <option value="salon_central">آرایشگاه با مدیریت متمرکز</option>
                  <option value="salon_independent">آرایشگاه با آرایشگرهای مستقل</option>
                </select>
              </L>
              <L t="اینستاگرام (بدون @)">
                <input
                  dir="ltr"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className={input}
                />
              </L>
              <L t="تلفن">
                <input
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={input}
                />
              </L>
              <L t="آدرس">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={input}
                />
              </L>
              <L t="لینک نقشه (نشان/بلد)">
                <input
                  dir="ltr"
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  className={input}
                />
              </L>
              <L t="عکس اصلی (URL)">
                <input
                  dir="ltr"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  className={input}
                />
              </L>
            </div>
            <L t="شعار">
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className={input}
              />
            </L>
            <L t="درباره">
              <textarea
                rows={3}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className={input}
              />
            </L>
            <L t="عکس‌های گالری (هر خط یک آدرس)">
              <textarea
                dir="ltr"
                rows={3}
                value={gallery.join("\n")}
                onChange={(e) =>
                  setGallery(
                    e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                className={input}
              />
            </L>
            <div className="mt-2">
              <button
                onClick={runAi}
                disabled={aiBusy || displayName.length < 2}
                className="rounded-xl border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {aiBusy ? "…" : aiAvailable ? "✨ نوشتن خودکار متن‌ها" : "متن‌های پیشنهادی"}
              </button>
              {aiNote && <span className="ms-2 text-xs opacity-60">{aiNote}</span>}
            </div>
            <div className="mt-4">
              <span className={label}>آرایشگرها</span>
              {staff.map((s, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input
                    value={s.name}
                    onChange={(e) =>
                      setStaff(staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    className={input}
                    placeholder="نام آرایشگر"
                  />
                  <input
                    value={s.bio ?? ""}
                    onChange={(e) =>
                      setStaff(staff.map((x, j) => (j === i ? { ...x, bio: e.target.value } : x)))
                    }
                    className={input}
                    placeholder="تخصص (اختیاری)"
                  />
                  {staff.length > 1 && (
                    <button
                      onClick={() => setStaff(staff.filter((_, j) => j !== i))}
                      className="px-2 text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {mode !== "solo" && (
                <button
                  onClick={() => setStaff([...staff, { name: "" }])}
                  className="rounded-xl border border-black/15 px-3 py-1.5 text-sm"
                >
                  + آرایشگر
                </button>
              )}
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card>
            {services.map((s, i) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setServices(
                      services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className={input}
                  placeholder="نام خدمت"
                />
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={s.durationMin}
                  onChange={(e) =>
                    setServices(
                      services.map((x, j) =>
                        j === i ? { ...x, durationMin: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className={input}
                  placeholder="دقیقه"
                />
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={s.price}
                  onChange={(e) =>
                    setServices(
                      services.map((x, j) =>
                        j === i ? { ...x, price: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className={input}
                  placeholder="تومان"
                />
                <button
                  onClick={() => setServices(services.filter((_, j) => j !== i))}
                  className="px-2 text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setServices([...services, { name: "", durationMin: 30, price: 200000 }])
              }
              className="rounded-xl border border-black/15 px-3 py-1.5 text-sm"
            >
              + خدمت
            </button>
            <p className="mt-2 text-xs opacity-50">
              مدت هر خدمت تعیین می‌کند اسلات‌ها چقدر طول بکشند.
            </p>
          </Card>
        )}

        {step === 2 && (
          <Card>
            {DAYS.map((d, wd) => {
              const mine = hours.map((h, i) => ({ h, i })).filter((x) => x.h.weekday === wd);
              return (
                <div
                  key={wd}
                  className="flex flex-wrap items-center gap-2 border-b border-black/5 py-2 last:border-0"
                >
                  <span className="w-20 text-sm font-bold">{d}</span>
                  {mine.length === 0 && <span className="text-xs opacity-50">تعطیل</span>}
                  {mine.map(({ h, i }) => (
                    <span key={i} className="flex items-center gap-1" dir="ltr">
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(h.startMin)}
                        onChange={(e) =>
                          setHours(
                            hours.map((x, j) =>
                              j === i ? { ...x, startMin: fromHHMM(e.target.value) } : x,
                            ),
                          )
                        }
                        className="rounded-lg border border-black/15 p-1 text-sm"
                      />
                      –
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(h.endMin)}
                        onChange={(e) =>
                          setHours(
                            hours.map((x, j) =>
                              j === i ? { ...x, endMin: fromHHMM(e.target.value) } : x,
                            ),
                          )
                        }
                        className="rounded-lg border border-black/15 p-1 text-sm"
                      />
                      <button
                        onClick={() => setHours(hours.filter((_, j) => j !== i))}
                        className="px-1 text-red-600"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() =>
                      setHours([...hours, { weekday: wd, startMin: 600, endMin: 1200 }])
                    }
                    className="text-xs opacity-60 hover:opacity-100"
                  >
                    + بازه
                  </button>
                </div>
              );
            })}
          </Card>
        )}

        {step === 3 && (
          <Card>
            <L t="بیعانه">
              <select
                value={deposit.enabled ? "1" : "0"}
                onChange={(e) => setDeposit({ ...deposit, enabled: e.target.value === "1" })}
                className={input}
              >
                <option value="0">لازم نیست (رزرو مستقیم تأیید می‌شود)</option>
                <option value="1">لازم است (کارت‌به‌کارت + رسید)</option>
              </select>
            </L>
            {deposit.enabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <L t="شماره کارت (۱۶ رقم)">
                  <input
                    dir="ltr"
                    maxLength={16}
                    value={deposit.cardNumber}
                    onChange={(e) =>
                      setDeposit({ ...deposit, cardNumber: e.target.value.replace(/\D/g, "") })
                    }
                    className={input}
                  />
                </L>
                <L t="به نام">
                  <input
                    value={deposit.cardHolder}
                    onChange={(e) => setDeposit({ ...deposit, cardHolder: e.target.value })}
                    className={input}
                  />
                </L>
                <L t="بانک">
                  <input
                    value={deposit.bankName}
                    onChange={(e) => setDeposit({ ...deposit, bankName: e.target.value })}
                    className={input}
                  />
                </L>
                <L t="نوع مبلغ">
                  <select
                    value={deposit.mode}
                    onChange={(e) =>
                      setDeposit({ ...deposit, mode: e.target.value as "fixed" | "percent" })
                    }
                    className={input}
                  >
                    <option value="fixed">مبلغ ثابت</option>
                    <option value="percent">درصدی</option>
                  </select>
                </L>
                <L t={deposit.mode === "fixed" ? "مبلغ (تومان)" : "درصد"}>
                  <input
                    type="number"
                    min={0}
                    value={deposit.amount}
                    onChange={(e) => setDeposit({ ...deposit, amount: Number(e.target.value) })}
                    className={input}
                  />
                </L>
                <L t="متن سیاست کنسلی">
                  <input
                    value={deposit.policyText}
                    onChange={(e) => setDeposit({ ...deposit, policyText: e.target.value })}
                    className={input}
                  />
                </L>
              </div>
            )}
          </Card>
        )}

        {step === 4 && (
          <Card>
            <p className="mb-3 text-sm opacity-70">
              توکن ربات را از <b>BotFather</b> بگیرید: در تلگرام (یا بله) به{" "}
              <span dir="ltr">@BotFather</span> پیام دهید، <span dir="ltr">/newbot</span> بزنید، نام
              و آی‌دی ربات را بدهید و توکن را اینجا بچسبانید. خالی گذاشتن یعنی آن کانال فعلاً
              غیرفعال است.
            </p>
            <L t="توکن ربات تلگرام">
              <input
                dir="ltr"
                value={telegramBotToken}
                onChange={(e) => setTelegram(e.target.value.trim())}
                className={input}
                placeholder="123456:ABC-DEF..."
              />
            </L>
            <L t="توکن ربات بله">
              <input
                dir="ltr"
                value={baleBotToken}
                onChange={(e) => setBale(e.target.value.trim())}
                className={input}
              />
            </L>
            <p className="text-xs opacity-50">وب‌هوک‌ها بعد از ساخت به‌صورت خودکار ست می‌شوند.</p>
          </Card>
        )}

        {step === 5 && (
          <Card>
            <span className={label}>قالب سایت</span>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTheme(t.key);
                    setPrimaryColor(t.color);
                  }}
                  className={`rounded-2xl border p-3 text-start ${theme === t.key ? "border-black bg-black/5" : "border-black/15"}`}
                >
                  <div className="font-bold">{t.label}</div>
                  <div className="text-xs opacity-60">{t.hint}</div>
                </button>
              ))}
            </div>
            <L t="رنگ اصلی">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-full rounded-xl border border-black/15"
              />
            </L>
            <p className="text-xs opacity-50">آرایشگر بعداً می‌تواند خودش قالب و رنگ را عوض کند.</p>
          </Card>
        )}

        {step === 6 && (
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <L t="نام کاربری پنل">
                <input
                  dir="ltr"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value.toLowerCase())}
                  className={input}
                />
              </L>
              <L t="رمز عبور پنل" hint="حداقل ۸ کاراکتر؛ به آرایشگر تحویل دهید">
                <input
                  dir="ltr"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className={input}
                />
              </L>
              <L t="وضعیت">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "demo" | "active")}
                  className={input}
                >
                  <option value="demo">دمو (برای ارائه)</option>
                  <option value="active">فعال (فروخته شده)</option>
                </select>
              </L>
            </div>
            <ul className="mt-4 space-y-1 rounded-2xl bg-black/5 p-4 text-sm">
              <li>
                نام: <b>{displayName || "—"}</b>
              </li>
              <li>
                آدرس: <span dir="ltr">{slug || "—"}</span>
              </li>
              <li>
                آرایشگرها: {staff.filter((s) => s.name).length} · خدمات:{" "}
                {services.filter((s) => s.name).length}
              </li>
              <li>
                بیعانه: {deposit.enabled ? "دارد" : "ندارد"} · ربات:{" "}
                {[telegramBotToken && "تلگرام", baleBotToken && "بله"].filter(Boolean).join("، ") ||
                  "هیچ‌کدام"}
              </li>
            </ul>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
          </Card>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-xl border border-black/15 px-4 py-2 text-sm disabled:opacity-40"
          >
            ‹ قبلی
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="rounded-xl bg-black px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              بعدی ›
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || adminPassword.length < 8 || !slug || slugFree === false}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? "در حال ساخت…" : "ایجاد کن"}
            </button>
          )}
        </div>
      </div>

      <SitePreview draft={draft} />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white p-4 shadow-sm">{children}</section>;
}
function L({ t, hint, children }: { t: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="mb-1 block text-xs font-bold opacity-70">{t}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] opacity-50">{hint}</span>}
    </label>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-black/5 pb-1">
      <span className="opacity-60">{k}</span>
      <span className="font-bold">{v}</span>
    </div>
  );
}
