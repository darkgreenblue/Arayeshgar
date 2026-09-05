"use client";
import { useState } from "react";
import type { BookingRules, DepositSettings, TenantBranding } from "@arayeshgar/db";
import { toPersianDigits } from "@arayeshgar/core/utils/phone";
import { btnGhost, btnPrimary, Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

const THEMES = [
  { key: "night-gold", label: "شب و طلا (تیره، لوکس)" },
  { key: "light-editorial", label: "روشن و مینیمال" },
  { key: "bold-modern", label: "مدرن و پررنگ" },
];

export function SettingsPanels(props: {
  deposit: DepositSettings;
  depositFeatureOn: boolean;
  rules: BookingRules;
  branding: TenantBranding;
  theme: string;
  bot: {
    telegramLinked: boolean;
    baleLinked: boolean;
    telegramBot: string | null;
    baleBot: string | null;
  };
  perms: { deposit: boolean; rules: boolean; branding: boolean };
}) {
  return (
    <div className="space-y-3">
      {props.perms.deposit && (
        <DepositCard deposit={props.deposit} featureOn={props.depositFeatureOn} />
      )}
      {props.perms.rules && <RulesCard rules={props.rules} />}
      {props.perms.branding && <BrandingCard branding={props.branding} theme={props.theme} />}
      <BotCard bot={props.bot} />
      <PasswordCard />
    </div>
  );
}

function DepositCard({ deposit, featureOn }: { deposit: DepositSettings; featureOn: boolean }) {
  const [d, setD] = useState(deposit);
  const { run, busy, error, ok } = useAction();
  return (
    <Card title="بیعانه (کارت‌به‌کارت)">
      {!featureOn && (
        <p className="mb-3 rounded-xl bg-amber-100 p-3 text-xs">
          ماژول بیعانه برای این آرایشگاه غیرفعال است؛ تنظیمات ذخیره می‌شود ولی تا فعال شدن ماژول
          اثری ندارد.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="وضعیت">
          <select
            value={d.enabled ? "1" : "0"}
            onChange={(e) => setD({ ...d, enabled: e.target.value === "1" })}
            className={inputCls}
          >
            <option value="0">خاموش (رزرو بدون بیعانه)</option>
            <option value="1">روشن (رزرو با بیعانه)</option>
          </select>
        </Field>
        <Field label="نوع مبلغ">
          <select
            value={d.mode}
            onChange={(e) => setD({ ...d, mode: e.target.value as "fixed" | "percent" })}
            className={inputCls}
          >
            <option value="fixed">مبلغ ثابت (تومان)</option>
            <option value="percent">درصدی از قیمت خدمت</option>
          </select>
        </Field>
        <Field
          label={d.mode === "fixed" ? "مبلغ (تومان)" : "درصد"}
          hint={d.mode === "fixed" ? "به نزدیک‌ترین هزار تومان گرد می‌شود" : "بین ۰ تا ۱۰۰"}
        >
          <input
            type="number"
            min={0}
            step={d.mode === "fixed" ? 1000 : 1}
            value={d.amount}
            onChange={(e) => setD({ ...d, amount: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="شماره کارت (۱۶ رقم)">
          <input
            dir="ltr"
            maxLength={16}
            value={d.cardNumber ?? ""}
            onChange={(e) => setD({ ...d, cardNumber: e.target.value.replace(/\D/g, "") })}
            className={inputCls}
          />
        </Field>
        <Field label="به نام">
          <input
            value={d.cardHolder ?? ""}
            onChange={(e) => setD({ ...d, cardHolder: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="بانک">
          <input
            value={d.bankName ?? ""}
            onChange={(e) => setD({ ...d, bankName: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="متن سیاست کنسلی (به مشتری نمایش داده می‌شود)">
        <textarea
          rows={2}
          maxLength={500}
          value={d.policyText ?? ""}
          onChange={(e) => setD({ ...d, policyText: e.target.value })}
          className={inputCls}
        />
      </Field>
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={busy}
          onClick={() =>
            run(
              "settings.deposit",
              {
                ...d,
                cardNumber: d.cardNumber || undefined,
                cardHolder: d.cardHolder || undefined,
                bankName: d.bankName || undefined,
                policyText: d.policyText || undefined,
              },
              { stay: true },
            )
          }
          className={btnPrimary}
        >
          ذخیره
        </button>
        <Msg error={error} ok={ok} />
      </div>
    </Card>
  );
}

function RulesCard({ rules }: { rules: BookingRules }) {
  const [r, setR] = useState(rules);
  const { run, busy, error, ok } = useAction();
  const num = (k: keyof BookingRules, label: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step={step}
        value={r[k] as number}
        onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })}
        className={inputCls}
      />
    </Field>
  );
  return (
    <Card title="قواعد رزرو">
      <div className="grid gap-3 sm:grid-cols-3">
        {num("slotStepMin", "گام اسلات (دقیقه)", "مثلاً ۱۵ ⇒ ۱۰:۰۰، ۱۰:۱۵، …", 5)}
        {num("bufferMin", "فاصله بین نوبت‌ها (دقیقه)", "زمان تمیزکاری/استراحت", 5)}
        {num("minLeadMin", "حداقل فاصله تا نوبت (دقیقه)", "رزرو دقیقه‌نودی را می‌بندد", 15)}
        {num("horizonDays", "تا چند روز آینده قابل رزرو")}
        {num("paymentDeadlineMin", "مهلت پرداخت بیعانه (دقیقه)", "بعد از آن وقت آزاد می‌شود", 5)}
        {num("cancelBeforeHours", "لغو توسط مشتری تا (ساعت) قبل")}
        {num("maxActiveBookingsPerPhone", "حداکثر رزرو پرداخت‌نشده هر شماره")}
        {num("maxBookingsPerPhonePerDay", "حداکثر رزرو روزانه هر شماره")}
        <Field label="بدون بیعانه، رزرو خودکار تأیید شود؟">
          <select
            value={r.autoConfirmWithoutDeposit ? "1" : "0"}
            onChange={(e) => setR({ ...r, autoConfirmWithoutDeposit: e.target.value === "1" })}
            className={inputCls}
          >
            <option value="1">بله (ساده‌تر برای مشتری)</option>
            <option value="0">نه، خودم تأیید می‌کنم</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={busy}
          onClick={() => run("settings.rules", r, { stay: true })}
          className={btnPrimary}
        >
          ذخیره
        </button>
        <Msg error={error} ok={ok} />
      </div>
    </Card>
  );
}

function BrandingCard({ branding, theme }: { branding: TenantBranding; theme: string }) {
  const [b, setB] = useState(branding);
  const [t, setT] = useState(theme);
  const { run, busy, error, ok } = useAction();
  const setFaq = (i: number, patch: Partial<{ q: string; a: string }>) =>
    setB({ ...b, faq: b.faq.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <Card title="سایت و برند">
      <Field label="قالب سایت" hint="هر وقت خواستید می‌توانید عوض کنید؛ محتوا حفظ می‌شود">
        <div className="flex flex-wrap gap-2">
          {THEMES.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => {
                setT(x.key);
                void run(
                  "settings.theme",
                  { theme: x.key },
                  { stay: true, success: "قالب عوض شد" },
                );
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${t === x.key ? "border-black bg-black text-white" : "border-black/20"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="نام نمایشی">
          <input
            value={b.displayName}
            onChange={(e) => setB({ ...b, displayName: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="شعار (یک خط)">
          <input
            value={b.tagline ?? ""}
            onChange={(e) => setB({ ...b, tagline: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="رنگ اصلی">
          <input
            type="color"
            value={b.primaryColor}
            onChange={(e) => setB({ ...b, primaryColor: e.target.value })}
            className="h-10 w-full rounded-xl border border-black/15"
          />
        </Field>
        <Field label="تلفن">
          <input
            dir="ltr"
            value={b.phone ?? ""}
            onChange={(e) => setB({ ...b, phone: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="آدرس">
          <input
            value={b.address ?? ""}
            onChange={(e) => setB({ ...b, address: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="لینک نقشه (نشان/بلد/گوگل)">
          <input
            dir="ltr"
            value={b.mapUrl ?? ""}
            onChange={(e) => setB({ ...b, mapUrl: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="اینستاگرام (بدون @)">
          <input
            dir="ltr"
            value={b.instagram ?? ""}
            onChange={(e) => setB({ ...b, instagram: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="عکس اصلی (URL)">
          <input
            dir="ltr"
            value={b.heroImageUrl ?? ""}
            onChange={(e) => setB({ ...b, heroImageUrl: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="درباره من / ما">
        <textarea
          rows={4}
          maxLength={2000}
          value={b.about ?? ""}
          onChange={(e) => setB({ ...b, about: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="عکس‌های گالری (هر خط یک آدرس)">
        <textarea
          rows={3}
          dir="ltr"
          value={b.gallery.join("\n")}
          onChange={(e) =>
            setB({
              ...b,
              gallery: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 30),
            })
          }
          className={inputCls}
        />
      </Field>
      <div className="mt-2">
        <span className="mb-1 block text-xs font-bold opacity-70">سؤالات متداول</span>
        {b.faq.map((f, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input
              value={f.q}
              placeholder="سؤال"
              onChange={(e) => setFaq(i, { q: e.target.value })}
              className={inputCls}
            />
            <input
              value={f.a}
              placeholder="پاسخ"
              onChange={(e) => setFaq(i, { a: e.target.value })}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setB({ ...b, faq: b.faq.filter((_, j) => j !== i) })}
              className="text-red-600"
            >
              حذف
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setB({ ...b, faq: [...b.faq, { q: "", a: "" }] })}
          className={btnGhost}
        >
          + سؤال
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() =>
            run("settings.branding", { ...b, faq: b.faq.filter((f) => f.q && f.a) }, { stay: true })
          }
          className={btnPrimary}
        >
          ذخیره
        </button>
        <a href="/" target="_blank" rel="noreferrer" className={btnGhost}>
          دیدن سایت ↗
        </a>
        <Msg error={error} ok={ok} />
      </div>
    </Card>
  );
}

function BotCard({
  bot,
}: {
  bot: {
    telegramLinked: boolean;
    baleLinked: boolean;
    telegramBot: string | null;
    baleBot: string | null;
  };
}) {
  const { run, busy, error } = useAction();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  return (
    <Card title="اتصال ربات (نوتیفیکیشن فوری)">
      <p className="text-sm opacity-70">
        با اتصال چت خود به ربات، هر رزرو و رسید جدید بلافاصله برای شما پیام می‌شود و می‌توانید
        همان‌جا تأیید کنید.
      </p>
      <ul className="my-3 space-y-1 text-sm">
        <li>
          تلگرام:{" "}
          {bot.telegramLinked ? (
            <b className="text-emerald-700">متصل ✅</b>
          ) : (
            <span className="opacity-60">متصل نیست</span>
          )}
          {bot.telegramBot ? ` (@${bot.telegramBot})` : ""}
        </li>
        <li>
          بله:{" "}
          {bot.baleLinked ? (
            <b className="text-emerald-700">متصل ✅</b>
          ) : (
            <span className="opacity-60">متصل نیست</span>
          )}
          {bot.baleBot ? ` (@${bot.baleBot})` : ""}
        </li>
      </ul>
      {code && (
        <div className="my-3 rounded-xl bg-black/5 p-3 text-center">
          <div className="text-xs opacity-70">در ربات بفرستید:</div>
          <div className="fa-nums text-2xl font-black tracking-widest" dir="ltr">
            /link {code.code}
          </div>
          <div className="mt-1 text-xs opacity-60">این کد تا ۱۵ دقیقه معتبر است.</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            const r = await run<{ code: string; expiresAt: string }>(
              "bot.issueLinkCode",
              {},
              { stay: true },
            );
            if (r) setCode(r);
          }}
          className={btnPrimary}
        >
          گرفتن کد اتصال
        </button>
        {bot.telegramLinked && (
          <button
            disabled={busy}
            onClick={() => run("bot.unlink", { platform: "telegram" })}
            className={btnGhost}
          >
            قطع تلگرام
          </button>
        )}
        {bot.baleLinked && (
          <button
            disabled={busy}
            onClick={() => run("bot.unlink", { platform: "bale" })}
            className={btnGhost}
          >
            قطع بله
          </button>
        )}
        <Msg error={error} />
      </div>
      <p className="mt-2 text-xs opacity-50">
        ربات‌ها در فاز بعدی فعال می‌شوند؛ کد از همین حالا ساخته می‌شود.
      </p>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { run, busy, error, ok } = useAction();
  return (
    <Card title="تغییر رمز عبور">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="رمز فعلی">
          <input
            dir="ltr"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="رمز جدید" hint={`حداقل ${toPersianDigits(8)} کاراکتر`}>
          <input
            dir="ltr"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={busy || !current || next.length < 8}
          onClick={() =>
            run("settings.password", { current, next }, { stay: true, success: "رمز عوض شد" })
          }
          className={btnPrimary}
        >
          تغییر رمز
        </button>
        <Msg error={error} ok={ok} />
      </div>
    </Card>
  );
}
