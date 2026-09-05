"use client";
import { useState } from "react";
import { api } from "@/components/booking/api";

export function PlatformLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/platform/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
          });
          window.location.assign("/platform");
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm">نام کاربری</span>
        <input
          dir="ltr"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-xl border border-black/15 p-3"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">رمز عبور</span>
        <input
          dir="ltr"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-black/15 p-3"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-black py-3 font-bold text-white disabled:opacity-50"
      >
        {busy ? "…" : "ورود"}
      </button>
    </form>
  );
}
