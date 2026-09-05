# ARCHITECTURE — معماری پلتفرم «آرایشگر»

> سند مرجع. تصمیم‌های قطعی در `STATE.md`، قواعد کار در `SKILLS.md`، منابع در `RESEARCH.md`.

## هدف در یک پاراگراف

یک پلتفرم چند‌مستاجری که برای هر آرایشگر/آرایشگاه یک پکیج کامل با برند خودش تحویل می‌دهد: **سایت اختصاصی + ربات تلگرام + ربات بله + پنل ادمین**، همه روی یک Postgres واحد ⇒ سینک لحظه‌ای بدون هیچ لایه‌ی همگام‌سازی. راه‌اندازی مشتری جدید = یک فرم/CLI، نه یک دیپلوی. اول دمو روی زیردامنه، بعد از فروش فعال‌سازی (+ دامنه اختصاصی).

## معماری (ساده، یک سرور، یک دیتابیس)

```
 [مشتری]──HTTPS──▶ Caddy (TLS خودکار، *.base-domain + دامنه اختصاصی)
                      │
          ┌───────────┴───────────────┐
          ▼                           ▼
   apps/web (Next.js)          apps/bots (Node + grammY + cron)
   • سایت هر آرایشگر           • یک پروسه، N ربات (هر tenant توکن خودش)
     (tenant از hostname)      • وب‌هوک: /hooks/{telegram|bale}/{tenantId}/{secret}
   • فلو رزرو + آپلود رسید     • فلو رزرو مشتری + پنل ادمین در ربات
   • پنل ادمین آرایشگر         • ارسال نوتیفیکیشن از جدول outbox (با retry)
   • پنل پلتفرم (شما) + ویزارد  • cron: انقضای رزرو پرداخت‌نشده، یادآوری‌ها
          │                           │
          └──────────┬────────────────┘
                     ▼
            packages/core  (منطق دامنه مشترک: رزرو، اسلات، پرداخت، نوتیف، فلگ‌ها)
            packages/db    (اسکیمای Drizzle + migration ها)
                     │
                     ▼
              PostgreSQL 16  (منبع واحد حقیقت — سینک لحظه‌ای = بدون کش)
              volume: uploads/ (رسیدها، عکس‌ها؛ پشت abstraction قابل تعویض با S3)
```

### ساختار مونوریپو (pnpm workspaces + Turborepo)

```
apps/web/            Next.js 15 App Router, RTL, Tailwind, تقویم جلالی
apps/bots/           Hono (HTTP وب‌هوک) + grammY + node-cron + pino
packages/core/       domain: booking engine, availability, payments, notifications, features
packages/db/         Drizzle schema, migrations, seed, tenant-scoped repositories
packages/themes/     ۳ قالب سایت (classic / modern / minimal) با content schema یکسان
packages/config/     tsconfig, eslint, prettier مشترک
deploy/              docker-compose.yml, Caddyfile, backup.sh, deploy.sh
scripts/             tenant-create (CLI), bale-probe, set-webhooks
docs/                ARCHITECTURE.md, STATE.md, SKILLS.md, RESEARCH.md, ONBOARDING.md, RUNBOOK.md
```

### مدل داده (همه جداول `tenant_id` دارند)

- `tenants` — slug (زیردامنه), custom_domain, timezone (پیش‌فرض Asia/Tehran), mode (`solo` | `salon_central` | `salon_independent`), status (`demo` | `active` | `suspended`), branding (JSONB: نام، لوگو، رنگ‌ها، قالب، متن‌ها، شبکه‌های اجتماعی، آدرس، لوکیشن), features (JSONB فلگ‌ها), booking_rules (JSONB: `slot_step_min`=۱۵، `buffer_min`=۰، `min_lead_min`=۶۰، `horizon_days`=۱۴، `payment_deadline_min`=۳۰، `cancel_before_hours`=۴، `auto_confirm_without_deposit`), deposit_settings (JSONB: شماره کارت، نام صاحب کارت، مبلغ ثابت یا درصد، متن سیاست کنسلی), bot_telegram_token, bot_bale_token, webhook_secret
- `users` — لاگین پنل (username + password hash), role: `platform_admin` | `owner` | `manager` | `staff`, staff_id (اختیاری), telegram_chat_id, bale_chat_id (برای نوتیف و پنل ربات)
- `staff` — آرایشگرهای یک tenant (در حالت solo یک رکورد)، نام، عکس، bio، is_active، **deposit_settings اختصاصی (اختیاری؛ برای سالن مستقل هر آرایشگر کارت خودش را دارد؛ fallback به tenant)**
- `services` — نام، مدت (دقیقه)، قیمت، توضیح، ترتیب؛ `staff_services` (کدام آرایشگر کدام خدمت با چه قیمت و **چه مدتی** — override اختیاری)
- `schedules` — ساعت کاری هفتگی هر staff (**روز هفته با شنبه=۰**، بازه‌ها)؛ `schedule_overrides` — تعطیلی/بستن بازه/باز کردن استثنایی (بستن بازه‌ای که رزرو فعال دارد ⇒ هشدار + لیست رزروها، رزروها خودکار کنسل **نمی‌شوند**)؛ `manual_slots` — برای حالت دستی
- `customers` — نام، phone (**نرمال‌شده به `09xxxxxxxxx`، ارقام فارسی/عربی تبدیل می‌شوند**، unique per tenant), یادداشت، `blocked` (برای عدم‌مراجعه مکرر)
- `customer_identities` — (platform, platform_user_id) → customer
- `bookings` — staff_id, customer_id, service_id, start/end (timestamptz), status, code (کد ۶ حرفی یکتا), source (`web` | `telegram` | `bale` | `admin`), price_snapshot, deposit_amount, expires_at, notes, cancelled_by, cancel_reason
  - **قید ضد دوبل‌بوک در دیتابیس:** extension `btree_gist` + `EXCLUDE USING gist (staff_id WITH =, tstzrange(start,end) WITH &&) WHERE status NOT IN ('cancelled','rejected','expired')`
  - **همه تغییر وضعیت‌ها شرطی‌اند** (`UPDATE … WHERE status = 'X'`; صفر ردیف = تعارض، پیام مناسب به کاربر). نمونه: آپلود رسید بعد از انقضا ⇒ «مهلت تمام شد، دوباره رزرو کنید».
  - `expires_at = min(now + payment_deadline, start − min_lead)`؛ رزرو با فاصله کمتر از `min_lead` اصلاً پیشنهاد نمی‌شود.
  - **جابجایی = UPDATE همان ردیف** (start/end و در صورت نیاز staff) داخل تراکنش، ثبت قبلی در `audit_log`؛ پرداخت به همان رزرو متصل می‌ماند.
  - «فرقی نمی‌کند» در سالن: اسلات‌ها اجتماع همه آرایشگرها؛ هنگام ثبت، اولین آرایشگر آزاد انتخاب و در صورت برخورد با قید، نفر بعدی امتحان می‌شود.
  - قوانین ضد سوءاستفاده در وب (بدون OTP): حداکثر یک رزرو پرداخت‌نشده فعال به‌ازای هر شماره، سقف ۳ رزرو در روز به‌ازای هر شماره/IP.
- `payments` — booking_id, amount, status, receipt_image, tracking_no, reviewed_by, reviewed_at, reject_reason
- `notification_outbox` — channel, recipient, payload, attempts, next_try_at, sent_at (تحویل تضمین‌شده با retry؛ worker با `SELECT … FOR UPDATE SKIP LOCKED`)
- `audit_log` — چه کسی چه کرد (کنسل، جابجایی، تأیید رسید)
- `bot_sessions` — کلید `(tenant_id, platform, platform_user_id)`؛ فقط برای دو حالت «منتظر شماره» و «منتظر عکس رسید». **بقیه فلو stateless است:** انتخاب‌ها در `callback_data` دکمه‌ها کد می‌شوند (سازگار با محدودیت‌های بله).

### ماشین وضعیت رزرو

```
(بیعانه فعال)   pending_payment ──رسید ارسال شد──▶ receipt_submitted ──تأیید──▶ confirmed
                     │ مهلت تمام شد (cron)                │ رد ⇒ rejected (اسلات آزاد)
                     ▼
                  expired (اسلات آزاد)
(بیعانه خاموش)  pending_approval ──تأیید ادمین/خودکار──▶ confirmed
confirmed ──▶ completed | cancelled (توسط مشتری تا X ساعت قبل / توسط ادمین) | no_show
جابجایی = تراکنش: ساخت رزرو جدید + کنسل قدیمی با ارجاع rescheduled_from
```

اسلات‌های قابل نمایش = ساعت کاری − override ها − رزروهای فعال (شامل pending). محاسبه در `packages/core/availability.ts`، **بدون کش**؛ همه کانال‌ها همین تابع را می‌خوانند ⇒ سینک لحظه‌ای.

### سه سناریوی آرایشگاه = یک مدل، سه پروفایل مجوز

|                                                                                       | solo  | salon_central                | salon_independent                      |
| ------------------------------------------------------------------------------------- | ----- | ---------------------------- | -------------------------------------- |
| تعداد staff                                                                           | ۱     | N                            | N                                      |
| انتخاب آرایشگر توسط مشتری                                                             | مخفی  | بله (+ گزینه «فرقی نمی‌کند») | بله                                    |
| چه کسی وقت‌ها را مدیریت می‌کند                                                        | owner | manager برای همه             | هر staff فقط مال خودش (لاگین جدا)      |
| چه کسی رسید تأیید می‌کند                                                              | owner | manager                      | staff مربوطه                           |
| نوتیفیکیشن به                                                                         | owner | manager                      | staff مربوطه (+ manager اگر تعریف شده) |
| هیچ شاخه‌ی کدی جدا نیست؛ فقط `permissions(user, tenant)` در `packages/core/authz.ts`. |

### ماژولاریتی (فلگ‌های هر tenant)

`features` JSONB با registry مرکزی در `packages/core/features.ts`:
`deposit, telegram_bot, bale_bot, gallery, reviews, faq, map, manual_slots, customer_cancel, reminders, ai_copy, sms_otp(آینده), photo_upload(آینده), waitlist(آینده)`.
هر ماژول یک پوشه با `isEnabled()` گارد در UI، API و ربات. پنل پلتفرم برای هر مشتری تیک می‌زند.

### فلو رزرو (۴ قدم، یکسان در سایت و ربات)

1. خدمت (و در حالت سالن: آرایشگر) → 2. روز (تقویم جلالی، ۱۴ روز آینده) → 3. ساعت → 4. نام + موبایل → تأیید  
   اگر بیعانه فعال: صفحه‌ی «شماره کارت + مبلغ + کد رزرو» + مهلت شمارنده + دکمه «رسید را فرستادم» (آپلود عکس در سایت / ارسال عکس در ربات). مشتری با لینک `/b/{code}` یا دستور `/my` وضعیت را می‌بیند. در ربات، موبایل با دکمه «ارسال شماره» (contact share) یک‌بار گرفته می‌شود و بعد به‌خاطر سپرده می‌شود.

### نوتیفیکیشن (رویدادمحور، outbox)

رویدادها: `booking_created, receipt_submitted, booking_confirmed, booking_rejected, booking_cancelled, booking_rescheduled, reminder_24h, reminder_2h, payment_expiring`.  
هر رویداد ⇒ ردیف‌های outbox برای گیرندگان (ادمین در تلگرام/بله؛ مشتری در همان کانالی که رزرو کرده). worker با retry نمایی ارسال می‌کند. پیام ادمین دکمه‌های «تأیید / رد» دارد و عکس رسید را ضمیمه می‌کند. آداپتر کانال‌ها در `packages/core/notifications/channels/` (تلگرام، بله؛ SMS بعداً بدون تغییر core).

### پنل ادمین آرایشگر (`/admin` روی دامنه خودش)

داشبورد امروز/هفته (تقویم لیستی موبایل‌فرست)، صف رسیدها (تأیید/رد با یک لمس)، جزئیات رزرو (تأیید نهایی، کنسل، جابجایی با انتخاب اسلات جدید)، خدمات و قیمت‌ها، مبلغ بیعانه و شماره کارت، ساعت کاری هفتگی + بستن بازه/روز، (سالن) مدیریت آرایشگرها، مشتری‌ها (تاریخچه)، اتصال ربات (کد یک‌بارمصرف برای لینک شدن چت ادمین). لاگین: username + password + کوکی سشن؛ محدودیت نرخ تلاش.

### پنل ادمین در ربات

`/admin` (فقط چت‌های لینک‌شده): وقت‌های امروز/فردا، رسیدهای در انتظار (با دکمه تأیید/رد)، بستن یک بازه/روز سریع، کنسل یک رزرو. کارهای پیچیده (قیمت‌ها، قالب) فقط در پنل وب.

### پنل پلتفرم (`platform.base-domain`، فقط شما)

لیست مشتری‌ها + وضعیت (demo/active)، ویزارد «مشتری جدید»، تغییر فلگ‌ها، قالب و رنگ، تنظیم دامنه اختصاصی، مشاهده لاگ نوتیف‌ها و خطاها.

**ویزارد آنبوردینگ (نیمه‌اتوماتیک، ۵ دقیقه):** ۱) برند: نام، slug، حالت (solo/سالن)، هندل اینستاگرام، تلفن، آدرس، لینک نقشه، لوگو، ۳ تا ۶ عکس ← ۲) خدمات و قیمت‌ها و مدت (چند پیش‌فرض آماده) ← ۳) ساعت کاری ← ۴) بیعانه: شماره کارت، مبلغ، مهلت ← ۵) توکن ربات تلگرام و بله (راهنمای BotFather/بله داخل صفحه) ← ۶) قالب و رنگ + پیش‌نمایش زنده ← ۷) (ماژول AI) تولید بیو/توضیح خدمات/متای SEO با خروجی JSON سخت‌گیرانه، قابل ویرایش ← «ایجاد» ⇒ tenant ساخته می‌شود، وب‌هوک‌ها ست می‌شوند، سایت روی `slug.base-domain` بالاست. همین کار با `pnpm tenant:create --file tenant.json` هم ممکن است.  
تبدیل دمو به نهایی = تغییر status + (اختیاری) وارد کردن دامنه اختصاصی (Caddy on-demand TLS).

### سایت (کارت ویزیت + CTA رزرو)

سکشن‌ها (هر کدام با فلگ): hero (عکس، نام، تگ‌لاین، دکمه رزرو ثابت پایین صفحه در موبایل)، درباره، خدمات و قیمت، گالری، نظرات (ماژول)، ساعت کاری، آدرس + لینک نشان/بلد/گوگل‌مپ، لینک اینستاگرام/تلگرام/بله، FAQ، رزرو. **یک content schema، سه قالب قابل تعویض از پنل آرایشگر**؛ رنگ و فونت هر tenant. SEO فارسی (title/description/OG) و PWA-ready. **بدون embed اینستاگرام** (از ایران باز نمی‌شود؛ لینک بیرونی).

**نتیجه تحقیق قالب‌های اوپن‌سورس (جزئیات و لینک‌ها در `docs/RESEARCH.md`):** قالب فارسی اوپن‌سورس با کیفیت وجود ندارد (همه پروژه‌های دانشجویی بدون لایسنس). پس: **چیدمان** از قالب‌های خارجی موفق، **زیرساخت RTL و تایپوگرافی** از ابزار فارسی/عربی. پایه هر سه قالب: `shadcn-ui/next-template-rtl` (استارتر رسمی RTL با logical utilities تیل‌ویند، بدون پلاگین). فقط از مخازن با لایسنس آزاد (MIT/CC0/OFL) کد گرفته می‌شود؛ مخازن بدون لایسنس فقط الهام بصری.

| قالب                   | حال‌وهوا                      | الهام (لایسنس)                                                                                                                    | ویژگی چیدمان                                                                                                           |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A «شب و طلا»**       | تیره‌ی لوکس، طلایی            | `fullstackweek-barber-v2` (بدون لایسنس ⇒ فقط الهام)، `codewithsadee/barber` (الهام)، تم luxury `BarbersBuddies` (MIT)             | hero تمام‌عرض عکس + دکمه طلایی، لیست قیمت دو ستونه با نقطه‌چین، گالری masonry با lightbox، نوار رزرو ثابت پایین موبایل |
| **B «روشن و مینیمال»** | روشن، ادیتوریال، یک رنگ اکسنت | `MartinXCVI/beauty-salon` (MIT)، `leoMirandaa/shadcn-landing-page` (MIT)، فاصله‌گذاری `noor-ui` (MIT)                             | hero متن‌محور با تیتر بزرگ فارسی، کارت‌های خدمت با مدت و قیمت، گالری متناوب عریض/بلند، نظرات به‌صورت نقل‌قول           |
| **C «مدرن و پررنگ»**   | رنگی، انیمیشن، bento          | `Northstrix/clandestine-beauty-salon` (MIT؛ بهترین پشتیبانی RTL، مودال رزرو با تقویم)، فلو خدمت→آرایشگر→اسلات از `BarbersBuddies` | hero دوتکه با تیتر متحرک، کارت‌های خدمت اسکرول افقی، گالری bento، کارت‌های تیم (برای سالن)، مودال رزرو                 |

فونت‌ها (همه OFL): **Vazirmatn** برای متن، **Estedad** برای تیترها (A و C)، **Sahel** جایگزین نرم‌تر برای B. قواعد فارسی: بدون letter-spacing، line-height ≥ ۱.۸، `text-align: start`، ارقام فارسی با `Intl`/`persian-tools` (MIT)، تیتر موبایل ≤ ۴۴px.  
تقویم جلالی: `react-day-picker` نسخه persian (MIT، فعال) + کامپوننت `shadcn-persian-calendar` (MIT)؛ گزینه دوم `avan-persian-date-picker` (MIT، تعطیلات ایران). تبدیل تاریخ: `jalaali-js` / `date-fns-jalali`.

### جزئیات فنی که بازبینی مشخص کرد

- **تشخیص tenant از hostname** در یک تابع `resolveTenant(host)` با تقدم صریح: `platform.<base>` ⇒ پنل پلتفرم؛ `<slug>.<base>` یا `<slug>.localhost` ⇒ tenant؛ در غیر این صورت جستجو در `custom_domain`.
- **Caddy:** wildcard برای `*.<base>`؛ برای دامنه اختصاصی on-demand TLS با endpoint `ask` (`/api/caddy/ask?domain=`) که فقط دامنه‌های ثبت‌شده در `tenants.custom_domain` را تأیید می‌کند؛ در توسعه `tls internal`.
- **ربات‌های چند‌مستاجری:** نمونه grammY هر tenant به‌صورت lazy ساخته و کش می‌شود (`bot.init()`)؛ بررسی secret از URL (هدر secret مخصوص تلگرام است). یک «نقشه قابلیت» برای بله (مثلاً `supportsAnswerCallbackQuery`) که با اسکریپت `bale-probe` پر می‌شود.
- **تحویل عکس رسید به ادمین:** فایل با stream از storage خوانده و به‌صورت multipart با `sendPhoto` ارسال می‌شود (بدون نیاز به URL عمومی). storage: `uploads/{tenantId}/{yyyy}/{mm}/{uuid}.jpg` پشت `packages/core/storage` (آداپتر disk؛ S3 بعداً).
- **worker:** به‌جای cron، یک حلقه `setInterval` هر ۳۰ ثانیه: `expireBookings()`, `drainOutbox()`, `enqueueReminders()`؛ ایدمپوتنت و قابل اجرا در چند نمونه.
- **ادمین auth:** کوکی امضاشده (iron-session)؛ بدون NextAuth. بیعانه خاموش ⇒ پیش‌فرض تأیید خودکار (قابل تغییر در booking_rules).
- **ربات‌ها مستقیماً `packages/core` و DB را صدا می‌زنند** (بدون HTTP بین سرویس‌ها).
- تقویم: ذخیره `timestamptz`، محاسبات در `Asia/Tehran` (DST ندارد)، تبدیل جلالی با `jalaali-js`، نمایش با `Intl` و ارقام فارسی.

### لاگ، خطا، پایداری (پیش‌فرض، نه اختیاری)

- pino JSON در همه سرویس‌ها با `tenant_id, request_id, booking_id, platform`؛ سطح خطا با stack.
- هر فراخوانی خارجی (تلگرام/بله/AI) پشت `withRetry()` + timeout؛ grammY با پلاگین auto-retry.
- نوتیف‌ها هیچ‌وقت درجا ارسال نمی‌شوند؛ همیشه از outbox (اگر تلگرام قطع باشد، بعداً می‌رسد).
- state ربات در DB (نه حافظه).
- health endpoint ها؛ بک‌آپ شبانه `pg_dump` با نگهداری ۱۴ روز؛ `docs/RUNBOOK.md` برای «چه کنم اگر …».
- امنیت: secret وب‌هوک هر tenant، اعتبارسنجی آپلود (فقط تصویر، حداکثر ۵MB، rename)، جداسازی tenant در لایه repository (هر کوئری از `forTenant(id)` می‌گذرد)، rate limit روی رزرو/لاگین، CSRF روی پنل.

---

## نقشه‌ی کد به مفاهیم بالا

| مفهوم                        | کد                                                                      |
| ---------------------------- | ----------------------------------------------------------------------- |
| اسکیمای داده و قیدها         | `packages/db/src/schema.ts`, `packages/db/drizzle/0001_constraints.sql` |
| پیش‌فرض‌های tenant جدید      | `packages/db/src/defaults.ts`                                           |
| فلگ‌ها                       | `packages/core/src/features/registry.ts`                                |
| تاریخ جلالی / تهران          | `packages/core/src/utils/jalali.ts`                                     |
| نرمال‌سازی موبایل، فرمت پول  | `packages/core/src/utils/phone.ts`                                      |
| retry فراخوانی خارجی         | `packages/core/src/utils/retry.ts`                                      |
| لاگ ساختاری                  | `packages/core/src/logger.ts`                                           |
| تشخیص tenant از hostname     | `apps/web/src/lib/tenant.ts`                                            |
| سرور وب‌هوک ربات‌ها + worker | `apps/bots/src/index.ts`, `apps/bots/src/router.ts`                     |
| یک کد برای تلگرام و بله      | `apps/bots/src/platform/bot.ts` (apiRoot), `platform/capabilities.ts`   |
| فلو رزرو stateless در ربات   | `apps/bots/src/platform/callback.ts`, `apps/bots/src/flows/booking.ts`  |
| پنل ادمین در ربات            | `apps/bots/src/admin/panel.ts`                                          |
| ارسال نوتیفیکیشن از outbox   | `apps/bots/src/senders.ts`                                              |
| قالب‌ها                      | `packages/themes/src/index.ts`                                          |
| استقرار                      | `deploy/docker-compose.yml`, `deploy/Caddyfile`                         |
