import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">صفحه پیدا نشد</h1>
        <Link href="/" className="mt-4 inline-block underline">
          صفحه اصلی
        </Link>
      </div>
    </main>
  );
}
