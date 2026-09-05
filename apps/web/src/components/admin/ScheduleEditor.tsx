"use client";
import { useState } from "react";
import {
  formatInstantFa,
  formatMinutes,
  isoDate,
  jalaliKey,
  localToInstant,
  parseJalaliKey,
  type LocalDate,
} from "@arayeshgar/core/utils/jalali";
import { toPersianDigits } from "@arayeshgar/core/utils/phone";
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
type Range = { weekday: number; startMin: number; endMin: number };
type Override = {
  id: string;
  day: string;
  kind: "closed" | "open";
  startMin: number | null;
  endMin: number | null;
  reason: string | null;
};

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
function gregToLocal(iso: string): LocalDate {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

export function ScheduleEditor(props: {
  staff: { id: string; name: string }[];
  staffId: string;
  weekly: Range[];
  overrides: Override[];
  manual: boolean;
  manualSlots: { id: string; startAt: string; endAt: string }[];
  timezone: string;
}) {
  const { run, busy, error, ok } = useAction();
  const [rows, setRows] = useState<Range[]>(props.weekly);
  const [ov, setOv] = useState({
    dayKey: "",
    kind: "closed" as "closed" | "open",
    whole: true,
    start: "10:00",
    end: "14:00",
    reason: "",
  });
  const [ms, setMs] = useState({ dayKey: "", start: "10:00", end: "10:30" });

  const setRange = (i: number, patch: Partial<Range>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {props.staff.length > 1 && (
        <div className="flex gap-1 overflow-x-auto text-sm">
          {props.staff.map((s) => (
            <a
              key={s.id}
              href={`/admin/schedule?staff=${s.id}`}
              className={`shrink-0 rounded-full px-3 py-1 ${s.id === props.staffId ? "bg-black text-white" : "bg-white"}`}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      {!props.manual && (
        <Card
          title="برنامه هفتگی"
          actions={
            <button
              disabled={busy}
              onClick={() =>
                run("schedule.setWeekly", { staffId: props.staffId, rows }, { stay: true })
              }
              className={btnPrimary}
            >
              ذخیره
            </button>
          }
        >
          <div className="space-y-2">
            {DAYS.map((label, wd) => {
              const mine = rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === wd);
              return (
                <div
                  key={wd}
                  className="flex flex-wrap items-center gap-2 border-b border-black/5 py-2 last:border-0"
                >
                  <div className="w-20 text-sm font-bold">{label}</div>
                  {mine.length === 0 && <span className="text-xs opacity-50">تعطیل</span>}
                  {mine.map(({ r, i }) => (
                    <span key={i} className="flex items-center gap-1 text-sm" dir="ltr">
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(r.startMin)}
                        onChange={(e) => setRange(i, { startMin: fromHHMM(e.target.value) })}
                        className="rounded-lg border border-black/15 p-1"
                      />
                      –
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(r.endMin)}
                        onChange={(e) => setRange(i, { endMin: fromHHMM(e.target.value) })}
                        className="rounded-lg border border-black/15 p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        className="px-1 text-red-600"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setRows([...rows, { weekday: wd, startMin: 10 * 60, endMin: 20 * 60 }])
                    }
                    className="text-xs text-black/60 hover:text-black"
                  >
                    + بازه
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2">
            <Msg error={error} ok={ok} />
          </div>
        </Card>
      )}

      <Card title="روزهای استثنا (تعطیلی / بازه بسته / ساعت اضافه)">
        <ul className="mb-3 divide-y divide-black/5 text-sm">
          {props.overrides.length === 0 && <li className="py-2 opacity-60">استثنایی ثبت نشده.</li>}
          {props.overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <span className="fa-nums">
                {jalaliKey(gregToLocal(o.day))} ·{" "}
                {o.kind === "closed"
                  ? o.startMin == null
                    ? "کل روز تعطیل"
                    : `بسته ${formatMinutes(o.startMin)} تا ${formatMinutes(o.endMin!)}`
                  : `باز ${formatMinutes(o.startMin!)} تا ${formatMinutes(o.endMin!)}`}
                {o.reason ? ` · ${o.reason}` : ""}
              </span>
              <button
                disabled={busy}
                onClick={() => run("override.remove", { id: o.id })}
                className="text-red-600"
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-5">
          <Field label="تاریخ (جلالی ۱۴۰۵/۰۶/۱۵)">
            <input
              dir="ltr"
              placeholder="1405/06/15"
              value={ov.dayKey}
              onChange={(e) => setOv({ ...ov, dayKey: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="نوع">
            <select
              value={ov.kind}
              onChange={(e) => setOv({ ...ov, kind: e.target.value as "closed" | "open" })}
              className={inputCls}
            >
              <option value="closed">بسته</option>
              <option value="open">باز (اضافه)</option>
            </select>
          </Field>
          <Field label="کل روز؟">
            <select
              value={ov.whole && ov.kind === "closed" ? "1" : "0"}
              disabled={ov.kind === "open"}
              onChange={(e) => setOv({ ...ov, whole: e.target.value === "1" })}
              className={inputCls}
            >
              <option value="1">کل روز</option>
              <option value="0">فقط یک بازه</option>
            </select>
          </Field>
          <Field label="از">
            <input
              dir="ltr"
              type="time"
              step={900}
              value={ov.start}
              onChange={(e) => setOv({ ...ov, start: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="تا">
            <input
              dir="ltr"
              type="time"
              step={900}
              value={ov.end}
              onChange={(e) => setOv({ ...ov, end: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            placeholder="دلیل (اختیاری)"
            value={ov.reason}
            onChange={(e) => setOv({ ...ov, reason: e.target.value })}
            className={`${inputCls} max-w-xs`}
          />
          <button
            disabled={busy}
            onClick={() => {
              const d = parseJalaliKey(
                ov.dayKey.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))),
              );
              if (!d) return alert("تاریخ نامعتبر. نمونه: 1405/06/15");
              const whole = ov.kind === "closed" && ov.whole;
              void run("override.add", {
                staffId: props.staffId,
                day: isoDate(d),
                kind: ov.kind,
                startMin: whole ? null : fromHHMM(ov.start),
                endMin: whole ? null : fromHHMM(ov.end),
                reason: ov.reason || null,
              });
            }}
            className={btnGhost}
          >
            + افزودن
          </button>
        </div>
      </Card>

      {props.manual && (
        <Card title="اسلات‌های دستی (حالت دستی فعال است)">
          <ul className="mb-3 divide-y divide-black/5 text-sm">
            {props.manualSlots.length === 0 && (
              <li className="py-2 opacity-60">اسلاتی تعریف نشده؛ مشتری هیچ وقتی نمی‌بیند.</li>
            )}
            {props.manualSlots.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="fa-nums">
                  {formatInstantFa(new Date(s.startAt), props.timezone)} تا{" "}
                  {formatInstantFa(new Date(s.endAt), props.timezone).split("ساعت ")[1]}
                </span>
                <button
                  disabled={busy}
                  onClick={() => run("manualSlot.remove", { id: s.id })}
                  className={btnDanger}
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="تاریخ (جلالی)">
              <input
                dir="ltr"
                placeholder="1405/06/15"
                value={ms.dayKey}
                onChange={(e) => setMs({ ...ms, dayKey: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="از">
              <input
                dir="ltr"
                type="time"
                step={900}
                value={ms.start}
                onChange={(e) => setMs({ ...ms, start: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="تا">
              <input
                dir="ltr"
                type="time"
                step={900}
                value={ms.end}
                onChange={(e) => setMs({ ...ms, end: e.target.value })}
                className={inputCls}
              />
            </Field>
            <div className="flex items-end">
              <button
                disabled={busy}
                onClick={() => {
                  const d = parseJalaliKey(ms.dayKey);
                  if (!d) return alert("تاریخ نامعتبر");
                  void run("manualSlot.add", {
                    staffId: props.staffId,
                    startAt: localToInstant(d, fromHHMM(ms.start), props.timezone).toISOString(),
                    endAt: localToInstant(d, fromHHMM(ms.end), props.timezone).toISOString(),
                  });
                }}
                className={btnGhost}
              >
                + افزودن
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs opacity-50">
            هر اسلات یک بازه قابل رزرو است؛ خدمت‌ها با گام {toPersianDigits(15)} دقیقه داخل آن جا
            می‌گیرند.
          </p>
        </Card>
      )}
    </div>
  );
}
