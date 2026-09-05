"use client";
import { useState } from "react";
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Msg } from "./ui";
import { useAction } from "./useAction";

export function CustomerActions({
  id,
  blocked,
  notes,
}: {
  id: string;
  blocked: boolean;
  notes: string;
}) {
  const [text, setText] = useState(notes);
  const { run, busy, error, ok } = useAction();
  return (
    <Card>
      <Field
        label="یادداشت خصوصی (فقط شما می‌بینید)"
        hint="مثلاً: مدل مورد علاقه، حساسیت پوستی، سابقه غیبت"
      >
        <textarea
          value={text}
          maxLength={1000}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => run("customer.setNotes", { id, notes: text }, { stay: true })}
          className={btnPrimary}
        >
          ذخیره یادداشت
        </button>
        {blocked ? (
          <button
            disabled={busy}
            onClick={() => run("customer.setBlocked", { id, blocked: false })}
            className={btnGhost}
          >
            رفع مسدودی
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() =>
              confirm("این شماره دیگر نتواند رزرو کند؟") &&
              run("customer.setBlocked", { id, blocked: true })
            }
            className={btnDanger}
          >
            مسدود کردن
          </button>
        )}
        <Msg error={error} ok={ok} />
      </div>
    </Card>
  );
}
