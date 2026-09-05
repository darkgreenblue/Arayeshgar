# RUNBOOK — بهره‌برداری و «چه کنم اگر …»

## استقرار روی VPS (خلاصه؛ نسخه قدم‌به‌قدم بعد از دریافت مستندات آروان در فاز ۶)

```bash
git clone <repo> /opt/arayeshgar && cd /opt/arayeshgar
cp .env.example .env      # BASE_DOMAIN, SESSION_SECRET, POSTGRES_PASSWORD, ACME_EMAIL را پر کنید
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
docker compose -f deploy/docker-compose.yml logs -f web bots
```

DNS: رکورد `A` برای `<BASE_DOMAIN>` و `*.<BASE_DOMAIN>` به IP سرور.

## سلامت

- `https://platform.<BASE_DOMAIN>/api/health` و `https://bots.<BASE_DOMAIN>/health` باید `{"ok":true}` بدهند.
- لاگ‌ها JSON هستند؛ برای یک رزرو: `docker compose logs bots | grep <booking_id>`.

## بک‌آپ

`deploy/backup.sh` را در cron شبانه بگذارید (۱۴ روز نگهداری). بازگردانی:

```bash
gunzip -c db-YYYYMMDD.sql.gz | docker compose -f deploy/docker-compose.yml exec -T db psql -U arayeshgar arayeshgar
```

## چه کنم اگر …

- **نوتیف به آرایشگر نمی‌رسد:** جدول `notification_outbox` را ببینید (`sent_at IS NULL`, `last_error`). worker هر ۳۰ ثانیه دوباره تلاش می‌کند. اگر `last_error` = 403/blocked ⇒ آرایشگر ربات را بلاک کرده یا chat لینک نشده (پنل → اتصال ربات).
- **ربات جواب نمی‌دهد:** `getWebhookInfo` را با توکن صدا بزنید؛ اگر URL اشتباه است از پنل پلتفرم «ست مجدد وب‌هوک». مطمئن شوید `bots.<BASE_DOMAIN>` گواهی معتبر دارد (بله گواهی self-signed را رد می‌کند).
- **تلگرام از سرور در دسترس نیست:** سرور باید خارج از ایران باشد یا `TELEGRAM_API_ROOT` به یک رله اشاره کند.
- **اسلات پر نشان می‌دهد ولی رزروی نیست:** رزرو `pending_payment` منقضی‌نشده است؛ بعد از `expires_at` worker آزادش می‌کند.
- **دو مشتری یک وقت گرفتند:** غیرممکن است اگر migration قید EXCLUDE اعمال شده باشد؛ بررسی: `\d bookings` باید `bookings_no_overlap` را نشان دهد.
- **مشتری می‌گوید رسید فرستاده ولی نمی‌بینم:** پنل → رسیدها → فیلتر «در انتظار»؛ فایل در `uploads/<tenantId>/...`.
- **دامنه اختصاصی گواهی نمی‌گیرد:** CNAME درست است؟ دامنه در پنل پلتفرم ثبت شده؟ `/api/caddy/ask?domain=...` باید 200 بدهد.
