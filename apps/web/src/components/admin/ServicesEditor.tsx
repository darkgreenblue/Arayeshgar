"use client";
import { useState } from "react";
import { formatToman, toPersianDigits } from "@arayeshgar/core/utils/phone";
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

type Svc = {
  id?: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  sortOrder: number;
  isActive: boolean;
  staffIds: string[];
};
const empty = (): Svc => ({
  name: "",
  description: "",
  durationMin: 30,
  price: 0,
  sortOrder: 0,
  isActive: true,
  staffIds: [],
});

export function ServicesEditor({
  services,
  staff,
}: {
  services: Svc[];
  staff: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<Svc | null>(null);
  const { run, busy, error } = useAction();
  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-black/5">
          {services.map((s) => (
            <li
              key={s.id}
              className={`flex items-center gap-3 py-2 ${s.isActive ? "" : "opacity-40"}`}
            >
              <div className="flex-1">
                <div className="font-bold">
                  {s.name}
                  {!s.isActive && " (غیرفعال)"}
                </div>
                <div className="text-xs opacity-60">
                  {toPersianDigits(s.durationMin)} دقیقه{s.description ? ` · ${s.description}` : ""}
                  {staff.length ? ` · ${s.staffIds.length} آرایشگر` : ""}
                </div>
              </div>
              <div className="fa-nums text-sm font-bold">{formatToman(s.price)}</div>
              <button
                onClick={() =>
                  setEditing({
                    ...s,
                    staffIds: s.staffIds.length ? s.staffIds : staff.map((x) => x.id),
                  })
                }
                className={btnGhost}
              >
                ویرایش
              </button>
            </li>
          ))}
          {services.length === 0 && (
            <li className="py-4 text-center text-sm opacity-60">هنوز خدمتی ثبت نشده.</li>
          )}
        </ul>
        <button
          onClick={() => setEditing({ ...empty(), staffIds: staff.map((s) => s.id) })}
          className={`${btnPrimary} mt-3`}
        >
          + خدمت جدید
        </button>
      </Card>
      {editing && (
        <Card title={editing.id ? "ویرایش خدمت" : "خدمت جدید"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="توضیح کوتاه">
              <input
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="مدت (دقیقه)">
              <input
                type="number"
                min={5}
                step={5}
                value={editing.durationMin}
                onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="قیمت (تومان)">
              <input
                type="number"
                min={0}
                step={1000}
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="ترتیب نمایش">
              <input
                type="number"
                min={0}
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="وضعیت">
              <select
                value={editing.isActive ? "1" : "0"}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.value === "1" })}
                className={inputCls}
              >
                <option value="1">فعال</option>
                <option value="0">غیرفعال</option>
              </select>
            </Field>
          </div>
          {staff.length > 0 && (
            <Field label="کدام آرایشگرها این خدمت را ارائه می‌دهند؟">
              <div className="flex flex-wrap gap-2">
                {staff.map((s) => {
                  const on = editing.staffIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          staffIds: on
                            ? editing.staffIds.filter((x) => x !== s.id)
                            : [...editing.staffIds, s.id],
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-black bg-black text-white" : "border-black/20"}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() =>
                run("service.upsert", {
                  ...editing,
                  description: editing.description || null,
                  staffIds: staff.length ? editing.staffIds : undefined,
                })
              }
              className={btnPrimary}
            >
              ذخیره
            </button>
            <button onClick={() => setEditing(null)} className={btnGhost}>
              بستن
            </button>
            {editing.id && editing.isActive && (
              <button
                disabled={busy}
                onClick={() =>
                  confirm("غیرفعال شود؟ رزروهای قبلی حفظ می‌شوند.") &&
                  run("service.deactivate", { id: editing.id })
                }
                className={btnDanger}
              >
                غیرفعال کردن
              </button>
            )}
            <Msg error={error} />
          </div>
        </Card>
      )}
    </div>
  );
}
