"use client";
import { useState } from "react";
import { api } from "@/components/booking/api";

/** Posts an admin action; reloads the page on success unless `stay` is set. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function run<T = unknown>(
    action: string,
    payload?: unknown,
    opts: { stay?: boolean; success?: string } = {},
  ): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await api<{ result: T }>("/api/admin/actions", {
        method: "POST",
        body: JSON.stringify({ action, payload }),
      });
      if (opts.stay) setOk(opts.success ?? "ذخیره شد");
      else window.location.reload();
      return r.result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, ok };
}
