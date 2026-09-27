# SKILLS — قواعد کار روی این پروژه

برای هر کسی (انسان یا AI) که روی کد کار می‌کند. اگر با ARCHITECTURE.md تضاد دیدید، این فایل را به‌روز کنید، نه این‌که قاعده را بشکنید.

## اصول

1. **سادگی بر پیچیدگی.** قبل از اضافه کردن جدول، سرویس یا وابستگی جدید بپرسید: بدون آن نمی‌شود؟
2. **یک منبع حقیقت.** همه کانال‌ها (وب، تلگرام، بله) از `packages/core` و همان Postgres می‌خوانند/می‌نویسند. هیچ کشی روی اسلات‌ها.
3. **هر جدول tenant_id دارد** و هر کوئری از repository های tenant-scoped در core می‌گذرد. کوئری بین‌مستاجری فقط در پنل پلتفرم و با نام صریح `platform*`.
4. **قید در دیتابیس، نه فقط در کد.** دوبل‌بوک با EXCLUDE gist جلوگیری می‌شود؛ تغییر وضعیت‌ها همیشه شرطی (`WHERE status = ...`) و صفر ردیف = تعارض.
5. **هیچ فراخوانی خارجی بدون `withRetry`** (تلگرام، بله، AI). نوتیف‌ها فقط از outbox، هرگز درجا.
6. **لاگ ساختاری** با pino: همیشه `tenant_id`, و در صورت وجود `booking_id`, `platform`, `chat_id`. توکن و پسورد هرگز لاگ نمی‌شوند (redact فعال است).
7. **فلگ‌ها** فقط از `FEATURES` در `packages/core/src/features/registry.ts`. ماژول جدید = کلید جدید + گارد `isEnabled()` در UI، API و ربات.
8. **زمان:** ذخیره `timestamptz`؛ محاسبه در timezone مستاجر (پیش‌فرض Asia/Tehran)؛ روز هفته فارسی (شنبه=۰)؛ تبدیل جلالی فقط در لایه نمایش/ورودی.
9. **پول:** عدد صحیح تومان. نمایش با ارقام فارسی.
10. **موبایل:** همیشه با `normalizeIranMobile` نرمال شود قبل از ذخیره یا جستجو.

## ساختار کد

- `packages/core/src/<domain>/` — یک پوشه به‌ازای هر دامنه (availability, booking, payments, notifications, features, authz, onboarding). توابع خالص جدا از توابع DB.
- توابع بلندتر از ~۴۰ خط را به helper بشکنید. Single Responsibility.
- تایپ‌های JSONB در `packages/db/src/schema.ts` تعریف و با zod در core اعتبارسنجی می‌شوند.
- ربات‌ها: فلو stateless با `callback_data`؛ session فقط برای «منتظر شماره» و «منتظر عکس رسید».
- Next.js: کامپوننت سرور پیش‌فرض؛ فرم‌ها با route handler (نه server action) تا همان منطق برای ربات قابل استفاده بماند.

## کیفیت و تست

- قبل از هر push: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`.
- منطق دامنه در core تست واحد دارد؛ موتور رزرو تست یکپارچه با Postgres واقعی (تست همزمانی دوبل‌بوک الزامی است).
- تست‌های یکپارچه اگر `DATABASE_URL` نبود خودشان skip می‌شوند.

## طراحی و انیمیشن

- هر کار UI در `apps/web` از اسکیل‌های امیل کوالسکی (`.claude/skills/`) استفاده می‌کند: پایه `emil-design-eng`، موبایل `mobile-native`، ساخت حرکت `animate`، بازبینی `/review-animations`. تصمیم مالک؛ جزئیات و جدول تعارض‌ها در `docs/DESIGN-SKILLS.md`.
- قواعد فارسی/RTL (`barbershop-design`) بر اسکیل‌های امیل مقدم‌اند: `letter-spacing` صفر، `line-height` تیتر ≥ ۱.۴ و متن ≥ ۱.۸، حرکت افقی در RTL آینه.
- بازبینیِ UI با جدول `| قبل | بعد | چرا |`.

## Git

- Conventional Commits: `feat(core): ...`, `fix(bots): ...`, `docs: ...`, `chore: ...`.
- برنچ کار: `claude/barber-booking-system-41gx4l`. هیچ push به برنچ دیگر بدون اجازه.
- بعد از هر فاز: `docs/STATE.md` به‌روز شود.

## بله در برابر تلگرام

- یک کد grammY؛ فقط `apiRoot` فرق می‌کند (`TELEGRAM_API_ROOT` / `BALE_API_ROOT`).
- قابلیت‌های نامطمئن بله (answerCallbackQuery در کلاینت قدیمی، inline mode) پشت «نقشه قابلیت» در `apps/bots/src/platform/capabilities.ts`؛ قبل از اتکا، `pnpm bale:probe` اجرا و نتیجه در RESEARCH.md ثبت شود.
