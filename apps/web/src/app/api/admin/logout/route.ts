import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function POST() {
  const s = await getSession();
  s.destroy();
  return Response.json({ ok: true });
}
