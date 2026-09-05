"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "امروز" },
  { href: "/admin/receipts", label: "رسیدها" },
];

export function AdminNav({ name, pending }: { name: string; pending: number }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="font-black">{name}</div>
        <nav className="flex items-center gap-1 text-sm">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-full px-3 py-1.5 ${path === i.href ? "bg-black text-white" : "hover:bg-black/5"}`}
            >
              {i.label}
              {i.href === "/admin/receipts" && pending > 0 && (
                <span className="ms-1 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-black">
                  {pending}
                </span>
              )}
            </Link>
          ))}
          <form
            action="/api/admin/logout"
            method="post"
            onSubmit={async (e) => {
              e.preventDefault();
              await fetch("/api/admin/logout", { method: "POST" });
              window.location.assign("/admin/login");
            }}
          >
            <button className="rounded-full px-3 py-1.5 text-xs opacity-60 hover:opacity-100">
              خروج
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
