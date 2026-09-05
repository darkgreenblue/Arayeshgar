"use client";
import { useState } from "react";
import { btnGhost, btnPrimary, Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

type Deposit = { cardNumber?: string; cardHolder?: string; bankName?: string } | null;
type St = {
  id?: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  depositSettings: Deposit;
  loginUsername: string | null;
};

const empty = (): St => ({
  name: "",
  bio: "",
  photoUrl: "",
  sortOrder: 0,
  isActive: true,
  depositSettings: null,
  loginUsername: null,
});

export function StaffEditor({ staff, mode }: { staff: St[]; mode: string }) {
  const [editing, setEditing] = useState<St | null>(null);
  const [login, setLogin] = useState({ username: "", password: "" });
  const { run, busy, error, ok } = useAction();
  const independent = mode === "salon_independent";

  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-black/5">
          {staff.map((s) => (
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
                  {s.bio ? `${s.bio} · ` : ""}
                  {s.loginUsername ? `لاگین: ${s.loginUsername}` : "بدون لاگین"}
                  {independent && s.depositSettings?.cardNumber ? " · کارت اختصاصی دارد" : ""}
                </div>
              </div>
              <button
                onClick={() => {
                  setEditing(s);
                  setLogin({ username: s.loginUsername ?? "", password: "" });
                }}
                className={btnGhost}
              >
                ویرایش
              </button>
            </li>
          ))}
          {staff.length === 0 && (
            <li className="py-4 text-center text-sm opacity-60">هنوز آرایشگری ثبت نشده.</li>
          )}
        </ul>
        <button
          onClick={() => {
            setEditing(empty());
            setLogin({ username: "", password: "" });
          }}
          className={`${btnPrimary} mt-3`}
        >
          + آرایشگر جدید
        </button>
      </Card>

      {editing && (
        <Card title={editing.id ? "ویرایش آرایشگر" : "آرایشگر جدید"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="معرفی کوتاه">
              <input
                value={editing.bio ?? ""}
                onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="آدرس عکس (اختیاری)">
              <input
                dir="ltr"
                value={editing.photoUrl ?? ""}
                onChange={(e) => setEditing({ ...editing, photoUrl: e.target.value })}
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

          {independent && (
            <div className="mt-3 rounded-xl border border-black/10 p-3">
              <h3 className="mb-2 text-sm font-black">کارت بیعانه اختصاصی</h3>
              <p className="mb-2 text-xs opacity-60">
                در آرایشگاه با آرایشگرهای مستقل، بیعانه هر آرایشگر به کارت خودش واریز می‌شود. اگر
                خالی بماند، از کارت آرایشگاه استفاده می‌شود.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="شماره کارت (۱۶ رقم)">
                  <input
                    dir="ltr"
                    maxLength={16}
                    value={editing.depositSettings?.cardNumber ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        depositSettings: {
                          ...editing.depositSettings,
                          cardNumber: e.target.value.replace(/\D/g, ""),
                        },
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="به نام">
                  <input
                    value={editing.depositSettings?.cardHolder ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        depositSettings: { ...editing.depositSettings, cardHolder: e.target.value },
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="بانک">
                  <input
                    value={editing.depositSettings?.bankName ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        depositSettings: { ...editing.depositSettings, bankName: e.target.value },
                      })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() => {
                const d = editing.depositSettings;
                const deposit =
                  d?.cardNumber || d?.cardHolder || d?.bankName
                    ? {
                        cardNumber: d.cardNumber || undefined,
                        cardHolder: d.cardHolder || undefined,
                        bankName: d.bankName || undefined,
                      }
                    : null;
                void run("staff.upsert", {
                  ...editing,
                  bio: editing.bio || null,
                  photoUrl: editing.photoUrl || null,
                  depositSettings: deposit,
                });
              }}
              className={btnPrimary}
            >
              ذخیره
            </button>
            <button onClick={() => setEditing(null)} className={btnGhost}>
              بستن
            </button>
            <Msg error={error} ok={ok} />
          </div>

          {editing.id && independent && (
            <div className="mt-4 rounded-xl border border-black/10 p-3">
              <h3 className="mb-2 text-sm font-black">لاگین اختصاصی</h3>
              <p className="mb-2 text-xs opacity-60">
                با این حساب، آرایشگر فقط وقت‌ها و رسیدهای خودش را می‌بیند و مدیریت می‌کند.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="نام کاربری" hint="حروف انگلیسی، عدد، نقطه یا زیرخط">
                  <input
                    dir="ltr"
                    value={login.username}
                    onChange={(e) => setLogin({ ...login, username: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="رمز عبور جدید" hint="حداقل ۸ کاراکتر">
                  <input
                    dir="ltr"
                    type="text"
                    value={login.password}
                    onChange={(e) => setLogin({ ...login, password: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <button
                disabled={busy || !login.username || login.password.length < 8}
                onClick={() =>
                  run("staff.setLogin", {
                    staffId: editing.id,
                    username: login.username,
                    password: login.password,
                  })
                }
                className={`${btnGhost} mt-2`}
              >
                ذخیره لاگین
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
