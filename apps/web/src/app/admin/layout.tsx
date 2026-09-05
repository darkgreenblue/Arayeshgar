import type { ReactNode } from "react";

/** Admin panel uses a neutral light UI regardless of the public theme; mobile-first. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#f6f6f7] text-[#151515]">{children}</div>;
}
