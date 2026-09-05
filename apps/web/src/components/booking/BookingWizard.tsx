"use client";
/**
 * 4-step booking flow shared by every theme: service (+staff) → day → time → details.
 * Stateless with respect to the server: every step re-fetches from the same availability
 * functions the bots use, so what the customer sees is always live.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";
import { api } from "./api";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
};
type Staff = {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  serviceIds: string[];
};
type Options = { mode: string; showStaffPicker: boolean; services: Service[]; staff: Staff[] };
type Day = { key: string; label: string; weekday: string };
type Slot = { iso: string; label: string; staffId: string };
type Created = {
  code: string;
  status: string;
  depositAmount: number;
  expiresAt: string | null;
  payTo: { cardNumber?: string; cardHolder?: string } | null;
};

const steps = ["خدمت", "روز", "ساعت", "اطلاعات شما"];

export function BookingWizard({ initialServiceId }: { initialServiceId?: string }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [staffId, setStaffId] = useState<string>("any");
  const [days, setDays] = useState<Day[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = !serviceId ? 0 : !day ? 1 : !slot ? 2 : 3;

  useEffect(() => {
    api<Options>("/api/booking/options")
      .then(setOpts)
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadDays = useCallback(async (svc: string, st: string) => {
    setDays(null);
    setDay(null);
    setSlots(null);
    setSlot(null);
    try {
      const r = await api<{ days: Day[] }>(`/api/booking/days?serviceId=${svc}&staffId=${st}`);
      setDays(r.days);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (serviceId) void loadDays(serviceId, staffId);
  }, [serviceId, staffId, loadDays]);

  useEffect(() => {
    if (!serviceId || !day) return;
    setSlots(null);
    setSlot(null);
    api<{ slots: Slot[] }>(
      `/api/booking/slots?serviceId=${serviceId}&staffId=${staffId}&day=${day}`,
    )
      .then((r) => setSlots(r.slots))
      .catch((e: Error) => setError(e.message));
  }, [serviceId, staffId, day]);

  const service = useMemo(
    () => opts?.services.find((s) => s.id === serviceId) ?? null,
    [opts, serviceId],
  );
  const eligibleStaff = useMemo(
    () => (opts && serviceId ? opts.staff.filter((s) => s.serviceIds.includes(serviceId)) : []),
    [opts, serviceId],
  );

  async function submit() {
    if (!serviceId || !slot) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Created>("/api/booking", {
        method: "POST",
        body: JSON.stringify({
          serviceId,
          staffId: slot.staffId === "any" ? "any" : slot.staffId,
          startAt: slot.iso,
          name,
          phone,
          notes: notes || undefined,
        }),
      });
      window.location.assign(`/b/${r.code}?new=1`);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message);
      if (err.code === "SLOT_TAKEN" || err.code === "SLOT_UNAVAILABLE") {
        setSlot(null);
        if (day) setDay(day); // triggers slot refresh
      }
      setBusy(false);
    }
  }

  if (!opts) return <div className="p-6 text-center opacity-70">در حال بارگذاری…</div>;

  return (
    <div className="mx-auto w-full max-w-xl">
      <ol className="mb-6 flex items-center gap-2 text-xs sm:text-sm">
        {steps.map((s, i) => (
          <li
            key={s}
            className={`flex items-center gap-2 ${i <= step ? "opacity-100" : "opacity-40"}`}
          >
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${i <= step ? "bg-[var(--brand)] text-[var(--brand-contrast)]" : "bg-black/10"}`}
            >
              {toPersianDigits(i + 1)}
            </span>
            <span className="hidden sm:inline">{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-current opacity-30" />}
          </li>
        ))}
      </ol>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm"
        >
          {error}
        </div>
      )}

      {/* Step 1: service (+ staff) */}
      {step === 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">چه خدمتی می‌خواهید؟</h2>
          <ul className="grid gap-2">
            {opts.services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-current/15 p-4 text-start transition hover:border-[var(--brand)]"
                >
                  <span>
                    <span className="block font-bold">{s.name}</span>
                    {s.description && (
                      <span className="block text-sm opacity-70">{s.description}</span>
                    )}
                    <span className="block text-xs opacity-60">
                      {toPersianDigits(s.durationMin)} دقیقه
                    </span>
                  </span>
                  <span className="fa-nums font-bold text-[var(--brand)]">
                    {formatToman(s.price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step >= 1 && service && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Chip
            onClick={() => {
              setServiceId(null);
              setStaffId("any");
            }}
          >
            {service.name} ✕
          </Chip>
          {day && (
            <Chip onClick={() => setDay(null)}>{days?.find((d) => d.key === day)?.label} ✕</Chip>
          )}
          {slot && <Chip onClick={() => setSlot(null)}>{slot.label} ✕</Chip>}
        </div>
      )}

      {/* Step 2: staff picker (salons) + day */}
      {step === 1 && (
        <section className="space-y-4">
          {opts.showStaffPicker && eligibleStaff.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-bold">با کدام آرایشگر؟</h2>
              <div className="flex flex-wrap gap-2">
                <Pill active={staffId === "any"} onClick={() => setStaffId("any")}>
                  فرقی نمی‌کند
                </Pill>
                {eligibleStaff.map((s) => (
                  <Pill key={s.id} active={staffId === s.id} onClick={() => setStaffId(s.id)}>
                    {s.name}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          <h2 className="text-lg font-bold">کدام روز؟</h2>
          {!days ? (
            <p className="opacity-70">در حال بارگذاری روزها…</p>
          ) : days.length === 0 ? (
            <p className="opacity-70">
              در دو هفته آینده وقت خالی نیست. لطفاً با آرایشگر تماس بگیرید.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDay(d.key)}
                  className="min-w-24 shrink-0 rounded-2xl border border-current/15 p-3 text-center transition hover:border-[var(--brand)]"
                >
                  <span className="block text-xs opacity-70">{d.weekday}</span>
                  <span className="block text-sm font-bold">
                    {d.label.replace(d.weekday, "").trim()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Step 3: time */}
      {step === 2 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">کدام ساعت؟</h2>
          {!slots ? (
            <p className="opacity-70">در حال بارگذاری ساعت‌ها…</p>
          ) : slots.length === 0 ? (
            <p className="opacity-70">این روز پر شده است. روز دیگری انتخاب کنید.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {slots.map((s) => (
                <button
                  key={s.iso}
                  type="button"
                  onClick={() => setSlot(s)}
                  className="fa-nums rounded-xl border border-current/15 py-2 text-sm font-bold transition hover:border-[var(--brand)] hover:bg-[var(--brand)] hover:text-[var(--brand-contrast)]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Step 4: details */}
      {step === 3 && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-lg font-bold">اطلاعات شما</h2>
          <label className="block">
            <span className="mb-1 block text-sm">نام</span>
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-current/20 bg-transparent p-3"
              placeholder="مثلاً رضا احمدی"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">شماره موبایل</span>
            <input
              required
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="fa-nums w-full rounded-xl border border-current/20 bg-transparent p-3 text-left"
              placeholder="0912 345 6789"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">توضیح (اختیاری)</span>
            <textarea
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-current/20 bg-transparent p-3"
              rows={2}
            />
          </label>
          <button
            disabled={busy}
            className="w-full rounded-2xl bg-[var(--brand)] py-3 font-bold text-[var(--brand-contrast)] disabled:opacity-60"
          >
            {busy ? "در حال ثبت…" : "ثبت رزرو"}
          </button>
        </form>
      )}
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-current/20 px-3 py-1 text-xs"
    >
      {children}
    </button>
  );
}
function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm ${active ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]" : "border-current/20"}`}
    >
      {children}
    </button>
  );
}
