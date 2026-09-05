"use client";
/** Day + time picker reused by "new booking" and "reschedule" (same public availability API). */
import { useEffect, useState } from "react";
import { api } from "@/components/booking/api";

type Day = { key: string; label: string };
type Slot = { iso: string; label: string; staffId: string };

export function SlotPicker({
  serviceId,
  staffId,
  onPick,
}: {
  serviceId: string;
  staffId: string;
  onPick: (slot: Slot) => void;
}) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setDays(null);
    setDay(null);
    api<{ days: Day[] }>(`/api/booking/days?serviceId=${serviceId}&staffId=${staffId}`)
      .then((r) => setDays(r.days))
      .catch((e: Error) => setErr(e.message));
  }, [serviceId, staffId]);
  useEffect(() => {
    if (!day) return;
    setSlots(null);
    api<{ slots: Slot[] }>(
      `/api/booking/slots?serviceId=${serviceId}&staffId=${staffId}&day=${day}`,
    )
      .then((r) => setSlots(r.slots))
      .catch((e: Error) => setErr(e.message));
  }, [serviceId, staffId, day]);
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  return (
    <div className="space-y-2">
      <select
        value={day ?? ""}
        onChange={(e) => setDay(e.target.value || null)}
        className="w-full rounded-xl border border-black/15 p-2.5 text-sm"
      >
        <option value="">{days ? "روز را انتخاب کنید" : "در حال بارگذاری…"}</option>
        {days?.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
      {day && (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {!slots && <span className="text-xs opacity-60">…</span>}
          {slots?.length === 0 && (
            <span className="col-span-full text-xs opacity-60">وقت خالی نیست</span>
          )}
          {slots?.map((s) => (
            <button
              key={s.iso}
              type="button"
              onClick={() => onPick(s)}
              className="fa-nums rounded-lg border border-black/15 py-1.5 text-sm hover:bg-black hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
