import type { ReactNode } from "react";

export const inputCls = "w-full rounded-xl border border-black/15 bg-white p-2.5 text-sm";
export const btnPrimary =
  "rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
export const btnGhost = "rounded-xl border border-black/15 px-4 py-2 text-sm disabled:opacity-50";
export const btnDanger =
  "rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-600 disabled:opacity-50";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-black">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold opacity-70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] opacity-50">{hint}</span>}
    </label>
  );
}
export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error)
    return (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    );
  if (ok) return <p className="text-sm text-emerald-700">{ok}</p>;
  return null;
}
