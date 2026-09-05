"use client";
import { useState } from "react";
import { api } from "./api";

export function ReceiptForm({ code }: { code: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [trackingNo, setTrackingNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("عکس رسید را انتخاب کنید.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    if (trackingNo) fd.set("trackingNo", trackingNo);
    try {
      await api(`/api/b/${code}/receipt`, { method: "POST", body: fd });
      window.location.assign(`/b/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-bold">عکس رسید</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <span className="mt-1 block text-xs opacity-60">JPG یا PNG، حداکثر ۵ مگابایت</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">شماره پیگیری (اختیاری)</span>
        <input
          dir="ltr"
          inputMode="numeric"
          value={trackingNo}
          onChange={(e) => setTrackingNo(e.target.value)}
          className="fa-nums w-full rounded-xl border border-current/20 bg-transparent p-3 text-left"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        disabled={busy || !file}
        className="w-full rounded-2xl bg-[var(--brand)] py-3 font-bold text-[var(--brand-contrast)] disabled:opacity-50"
      >
        {busy ? "در حال ارسال…" : "رسید را فرستادم"}
      </button>
    </form>
  );
}
