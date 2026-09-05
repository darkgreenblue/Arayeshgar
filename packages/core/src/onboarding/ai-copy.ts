/**
 * Optional module: drafts the Persian marketing copy for a new barber's site.
 * Disabled by default. Without an API key (or on any failure) it falls back to templates, so
 * onboarding never depends on an external service.
 *
 * The prompt is deliberately strict: no invented facts, no emoji, fixed JSON shape, and every
 * field length-capped so the layout cannot break.
 */
import { z } from "zod";
import { logger } from "../logger";
import { withRetry } from "../utils/retry";

export const copyResult = z.object({
  tagline: z.string().min(4).max(70),
  about: z.string().min(40).max(600),
  seoTitle: z.string().min(10).max(70),
  seoDescription: z.string().min(30).max(160),
  serviceDescriptions: z.record(z.string(), z.string().max(120)).default({}),
  faq: z
    .array(z.object({ q: z.string().max(120), a: z.string().max(300) }))
    .max(5)
    .default([]),
});
export type CopyResult = z.infer<typeof copyResult>;

export type CopyInput = {
  displayName: string;
  mode: "solo" | "salon_central" | "salon_independent";
  city?: string;
  specialties?: string;
  services: { name: string }[];
  yearsOfExperience?: number;
};

const SYSTEM_PROMPT = `تو یک کپی‌رایتر فارسی‌زبان هستی که برای وب‌سایت آرایشگرهای ایرانی متن می‌نویسی.

قواعد سخت‌گیرانه:
- فقط از اطلاعاتی که به تو داده شده استفاده کن. هیچ ادعای تأییدنشده‌ای نساز (جایزه، تعداد مشتری، سابقه‌ای که گفته نشده، قیمت، گارانتی).
- لحن: ساده، حرفه‌ای، محترمانه، بدون اغراق و بدون کلیشه‌های شبکه‌های اجتماعی.
- بدون ایموجی، بدون هشتگ، بدون علامت تعجب پشت سر هم.
- فارسی روان با نیم‌فاصله درست. از کلمات انگلیسی پرهیز کن مگر نام خدمت رایج باشد.
- خروجی فقط و فقط یک شیء JSON معتبر مطابق اسکیمای خواسته‌شده. هیچ متن دیگری، هیچ بلوک کد.
- اگر اطلاعات کافی نیست، جمله را کوتاه و کلی بنویس، چیزی از خودت اضافه نکن.`;

function userPrompt(input: CopyInput): string {
  return JSON.stringify(
    {
      نام: input.displayName,
      نوع: input.mode === "solo" ? "آرایشگر مستقل" : "آرایشگاه",
      شهر: input.city ?? null,
      تخصص: input.specialties ?? null,
      سابقه_سال: input.yearsOfExperience ?? null,
      خدمات: input.services.map((s) => s.name),
      خروجی_مورد_نیاز: {
        tagline: "یک جمله کوتاه زیر نام، حداکثر ۷۰ کاراکتر",
        about: "دو تا سه جمله معرفی، حداکثر ۶۰۰ کاراکتر",
        seoTitle: "عنوان صفحه برای گوگل، حداکثر ۷۰ کاراکتر",
        seoDescription: "توضیح متا، حداکثر ۱۶۰ کاراکتر",
        serviceDescriptions: "شیء: نام هر خدمت به یک توضیح یک‌خطی حداکثر ۱۲۰ کاراکتر",
        faq: "حداکثر ۳ سؤال متداول واقع‌بینانه (تأخیر، کنسلی، پارکینگ) بدون وعده دروغ",
      },
    },
    null,
    0,
  );
}

/** Deterministic fallback used when the module is off, the key is missing, or the call fails. */
export function templateCopy(input: CopyInput): CopyResult {
  const isSalon = input.mode !== "solo";
  const list = input.services
    .slice(0, 3)
    .map((s) => s.name)
    .join("، ");
  return copyResult.parse({
    tagline: isSalon ? "رزرو آنلاین، بدون معطلی" : "اصلاح حرفه‌ای با وقت دقیق",
    about: isSalon
      ? `${input.displayName} با تیمی از آرایشگران باتجربه در خدمت شماست. برای اینکه وقتتان تلف نشود، نوبت‌دهی کاملاً آنلاین است و زمان هر خدمت از قبل مشخص می‌شود.`
      : `${input.displayName} کار خود را با تمرکز بر کیفیت و احترام به وقت مشتری انجام می‌دهد. نوبت‌ها آنلاین رزرو می‌شوند تا بدون انتظار به موقع پذیرش شوید.`,
    seoTitle: `${input.displayName} | رزرو آنلاین نوبت`,
    seoDescription: `رزرو آنلاین نوبت ${input.displayName}${list ? ` برای ${list}` : ""}. انتخاب روز و ساعت، تأیید فوری.`,
    serviceDescriptions: Object.fromEntries(
      input.services.map((s) => [s.name, `${s.name} با زمان‌بندی مشخص و بدون معطلی.`]),
    ),
    faq: [
      {
        q: "اگر چند دقیقه دیر برسم چه می‌شود؟",
        a: "تا ۱۰ دقیقه تأخیر مشکلی نیست؛ بیشتر از آن ممکن است نوبت به نفر بعد داده شود.",
      },
      {
        q: "چطور نوبتم را لغو کنم؟",
        a: "از همان لینک یا پیام رزرو، دکمه لغو را بزنید. لطفاً هرچه زودتر لغو کنید تا وقت به دیگری برسد.",
      },
    ],
  });
}

export function aiCopyAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Calls the Anthropic Messages API directly (no SDK dependency) and validates the JSON.
 * Any problem — no key, network, malformed output — degrades to templateCopy.
 */
export async function generateCopy(
  input: CopyInput,
): Promise<{ copy: CopyResult; source: "ai" | "template" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { copy: templateCopy(input), source: "template" };
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  try {
    const text = await withRetry(
      async (signal) => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1200,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt(input) }],
          }),
          signal,
        });
        if (!res.ok)
          throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = (await res.json()) as { content?: { type: string; text?: string }[] };
        const out = data.content?.find((c) => c.type === "text")?.text;
        if (!out) throw new Error("empty completion");
        return out;
      },
      { label: "ai.copy", attempts: 2, timeoutMs: 30_000 },
    );
    const json = JSON.parse(stripFences(text)) as unknown;
    const copy = copyResult.parse(json);
    return { copy, source: "ai" };
  } catch (err) {
    logger.warn({ err: String(err) }, "AI copy failed; using templates");
    return { copy: templateCopy(input), source: "template" };
  }
}

/** Models occasionally wrap JSON in ``` fences despite instructions. */
export function stripFences(s: string): string {
  const t = s.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}
