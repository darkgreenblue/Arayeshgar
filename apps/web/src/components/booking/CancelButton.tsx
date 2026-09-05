"use client";
import { useState } from "react";
import { toPersianDigits } from "@arayeshgar/core/utils/phone";
import { api } from "./api";

export function CancelButton({ code, hours }: { code: string; hours: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!confirm("رزرو لغو شود؟")) return;
    setBusy(true);
    try {
      await api(`/api/b/${code}/cancel`, { method: "POST" });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-600 disabled:opacity-50"
      >
        لغو رزرو
      </button>
      <span className="ms-2 text-xs opacity-50">تا {toPersianDigits(hours)} ساعت قبل از نوبت</span>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
