# DEPLOY — راه‌اندازی روی سرور (قدم‌به‌قدم، بدون دانش فنی)

> این راهنما فرض می‌کند یک VPS لینوکسی (اوبونتو ۲۲ یا ۲۴) و یک دامنه دارید. همه دستورها را دقیقاً کپی و در ترمینال سرور اجرا کنید. هرجا `example.ir` دیدید، دامنه خودتان را بگذارید.
> **نکته مهم:** اگر سرور داخل ایران است، API تلگرام در دسترس نیست. یا سرور خارجی بگیرید، یا مقدار `TELEGRAM_API_ROOT` را به یک رله تنظیم کنید (بخش «تلگرام از ایران»).

## ۰. چه چیزهایی لازم دارید

| مورد         | توضیح                                                            |
| ------------ | ---------------------------------------------------------------- |
| سرور         | ۲ هسته، ۲ گیگ رم، ۲۰ گیگ دیسک کافی است                           |
| دامنه        | مثلاً `example.ir`                                               |
| دو رکورد DNS | `A` برای `example.ir` و `A` برای `*.example.ir` هر دو به IP سرور |
| توکن ربات    | از BotFather در تلگرام و بله (اختیاری، بعداً هم می‌شود)          |

## ۱. اتصال به سرور

```bash
ssh root@SERVER_IP
```

## ۲. نصب داکر (یک‌بار برای همیشه)

```bash
curl -fsSL https://get.docker.com | sh
docker --version
```

## ۳. گرفتن کد

```bash
git clone https://github.com/darkgreenblue/Arayeshgar.git /opt/arayeshgar
cd /opt/arayeshgar
```

## ۴. ساخت فایل تنظیمات

```bash
cp .env.example .env
nano .env
```

این چند مقدار را حتماً عوض کنید (بقیه را دست نزنید):

| کلید                                                  | مقدار                                                 |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `BASE_DOMAIN`                                         | `example.ir`                                          |
| `PUBLIC_URL_SCHEME`                                   | `https`                                               |
| `SESSION_SECRET`                                      | یک رشته تصادفی بلند؛ با `openssl rand -hex 32` بسازید |
| `POSTGRES_PASSWORD`                                   | یک رمز قوی                                            |
| `ACME_EMAIL`                                          | ایمیل شما (برای گواهی SSL)                            |
| `BOTS_PUBLIC_URL`                                     | `https://bots.example.ir`                             |
| `PLATFORM_ADMIN_USERNAME` / `PLATFORM_ADMIN_PASSWORD` | حساب ورود شما به پنل پلتفرم                           |

ذخیره در nano: `Ctrl+O` سپس `Enter`، خروج: `Ctrl+X`.

## ۵. بالا آوردن سیستم

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

اولین بار چند دقیقه طول می‌کشد. بعد از تمام شدن:

```bash
docker compose -f deploy/docker-compose.yml ps
```

همه سرویس‌ها باید `running` باشند.

## ۶. بررسی سلامت

```bash
curl https://platform.example.ir/api/health
curl https://bots.example.ir/health
```

هر دو باید `{"ok":true,...}` بدهند. گواهی SSL خودکار گرفته می‌شود؛ اگر خطای گواهی دیدید یکی دو دقیقه صبر کنید و دوباره بزنید.

## ۷. ورود به پنل پلتفرم

`https://platform.example.ir` را باز کنید و با همان نام کاربری و رمزی که در `.env` گذاشتید وارد شوید. حالا با دکمه «مشتری جدید» اولین آرایشگر را بسازید (راهنما: `docs/ONBOARDING.md`).

## ۸. بک‌آپ شبانه (توصیه اکید)

```bash
crontab -e
```

این خط را آخر فایل اضافه کنید:

```
0 3 * * * cd /opt/arayeshgar && BACKUP_DIR=/opt/arayeshgar-backups deploy/backup.sh >> /var/log/arayeshgar-backup.log 2>&1
```

## ۹. به‌روزرسانی نسخه

```bash
cd /opt/arayeshgar
git pull
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

مهاجرت دیتابیس خودکار اجرا می‌شود.

---

## تلگرام از ایران

اگر سرور ایرانی است، `api.telegram.org` باز نمی‌شود. دو راه:

1. **سرور خارجی** (ساده‌ترین و پیشنهادی).
2. **رله:** یک Cloudflare Worker بسازید که درخواست‌ها را به تلگرام پاس بدهد، سپس در `.env`:
   `TELEGRAM_API_ROOT=https://<worker-name>.workers.dev`
   ربات بله همیشه مستقیم کار می‌کند و نیازی به رله ندارد.

## دامنه اختصاصی برای یک مشتری

۱. مشتری در پنل دامنه‌اش یک رکورد `CNAME` از `www` یا `@` به `example.ir` بزند.
۲. شما در پنل پلتفرم ← صفحه آن مشتری ← «دامنه اختصاصی» دامنه را وارد کنید.
گواهی SSL خودکار و فقط برای دامنه‌های ثبت‌شده صادر می‌شود.

## اگر چیزی خراب شد

`docs/RUNBOOK.md` را ببینید؛ فهرست «چه کنم اگر …» با راه‌حل هر خطای رایج آنجاست. برای دیدن لاگ‌ها:

```bash
docker compose -f deploy/docker-compose.yml logs -f web bots
```
