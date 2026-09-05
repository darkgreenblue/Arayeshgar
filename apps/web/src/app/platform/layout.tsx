import type { ReactNode } from "react";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#f6f6f7] text-[#151515]">{children}</div>;
}
