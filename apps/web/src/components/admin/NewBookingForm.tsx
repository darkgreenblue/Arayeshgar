"use client";
import { useState } from "react";
import { SlotPicker } from "./SlotPicker";
import { Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

type Svc = { id: string; name: string; staffIds: string[] };
type St = { id: string; name: string };

export function NewBookingForm({ services, staff }: { services: Svc[]; staff: St[] }) {
  const { run, busy, error } = useAction();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slot, setSlot] = useState<{ iso: string; label: string } | null>(null);
  const eligible = staff.filter((s) =>
    services.find((x) => x.id === serviceId)?.staffIds.includes(s.id),
  );
  const effStaff = eligible.some((s) => s.id === staffId) ? staffId : (eligible[0]?.id ?? "");
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="خدمت">
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
            }}
            className={inputCls}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {staff.length > 1 && (
          <Field label="آرایشگر">
            <select
              value={effStaff}
              onChange={(e) => {
                setStaffId(e.target.value);
                setSlot(null);
              }}
              className={inputCls}
            >
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="نام مشتری">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="موبایل">
          <input
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label={slot ? `زمان: ${slot.label}` : "زمان"}>
          {serviceId && effStaff ? (
            <SlotPicker serviceId={serviceId} staffId={effStaff} onPick={setSlot} />
          ) : (
            <p className="text-xs opacity-60">اول خدمت و آرایشگر</p>
          )}
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={busy || !slot || !name || !phone}
          onClick={() =>
            run(
              "booking.create",
              { staffId: effStaff, serviceId, startAt: slot!.iso, name, phone },
              { stay: false },
            )
          }
          className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          ثبت رزرو (تأیید‌شده)
        </button>
        <Msg error={error} />
      </div>
      <p className="mt-2 text-xs opacity-50">
        رزرو ادمین بدون بیعانه و مستقیماً تأیید‌شده ثبت می‌شود.
      </p>
    </Card>
  );
}
