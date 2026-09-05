"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

export function AdminNav({
  name,
  pending,
  items,
}: {
  name: string;
  pending: number;
  items: Item[];
}) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
        <div className="shrink-0 font-black">{name}</div>
        <button
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            window.location.assign("/admin/login");
          }}
          className="shrink-0 text-xs opacity-60 hover:opacity-100"
        >
          خروج
        </button>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none]">
        {items.map((i) => {
          const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
          const badge = i.href === "/admin/receipts" ? pending : i.badge;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`shrink-0 rounded-full px-3 py-1.5 ${active ? "bg-black text-white" : "bg-black/5 hover:bg-black/10"}`}
            >
              {i.label}
              {badge ? (
                <span className="ms-1 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-black">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
