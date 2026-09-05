"use client";
import { useState } from "react";
import { api } from "@/components/booking/api";

export function ReceiptActions({
  bookingId,
  mode,
}: {
  bookingId: string;
  mode: "receipt" | "approval";
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(kind: "approve" | "reject") {
    let reason: string | undefined;
    if (kind === "reject") {
      const r = prompt(
        "دلیل رد (به مشتری نمایش داده می‌شود):",
        mode === "receipt" ? "مبلغ یا رسید نامعتبر" : "",
      );
      if (r === null) return;
      reason = r || undefined;
    }
    setBusy(kind);
    setError(null);
    try {
      await api(`/api/admin/bookings/${bookingId}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => act("approve")}
        disabled={busy !== null}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy === "approve" ? "…" : mode === "receipt" ? "✅ تأیید رسید" : "✅ تأیید رزرو"}
      </button>
      <button
        onClick={() => act("reject")}
        disabled={busy !== null}
        className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-600 disabled:opacity-50"
      >
        {busy === "reject" ? "…" : "❌ رد"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
