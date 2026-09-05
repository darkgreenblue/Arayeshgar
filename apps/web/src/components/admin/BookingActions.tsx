"use client";
import { useState } from "react";
import { SlotPicker } from "./SlotPicker";
import { btnDanger, btnGhost, btnPrimary, Msg } from "./ui";
import { useAction } from "./useAction";

export function BookingActions({
  bookingId,
  status,
  serviceId,
  staffId,
  startAt,
}: {
  bookingId: string;
  status: string;
  serviceId: string;
  staffId: string;
  startAt: string;
}) {
  const { run, busy, error } = useAction();
  const [moving, setMoving] = useState(false);
  const past = new Date(startAt).getTime() < Date.now();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "confirmed" && past && (
          <>
            <button
              disabled={busy}
              onClick={() => run("booking.complete", { id: bookingId })}
              className={btnPrimary}
            >
              ✔ انجام شد
            </button>
            <button
              disabled={busy}
              onClick={() =>
                confirm("مشتری مراجعه نکرد؟") && run("booking.noShow", { id: bookingId })
              }
              className={btnGhost}
            >
              مراجعه نکرد
            </button>
          </>
        )}
        <button disabled={busy} onClick={() => setMoving((m) => !m)} className={btnGhost}>
          🔁 جابجایی
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const reason = prompt("دلیل لغو (برای مشتری):", "");
            if (reason !== null)
              void run("booking.cancel", { id: bookingId, reason: reason || undefined });
          }}
          className={btnDanger}
        >
          لغو رزرو
        </button>
      </div>
      {moving && (
        <div className="rounded-xl border border-black/10 p-3">
          <p className="mb-2 text-xs opacity-70">
            زمان جدید را انتخاب کنید؛ کد رزرو و بیعانه حفظ می‌شوند و به مشتری اطلاع داده می‌شود.
          </p>
          <SlotPicker
            serviceId={serviceId}
            staffId={staffId}
            onPick={(s) =>
              confirm(`جابجایی به ${s.label}؟`) &&
              run("booking.reschedule", { id: bookingId, startAt: s.iso })
            }
          />
        </div>
      )}
      <Msg error={error} />
    </div>
  );
}
