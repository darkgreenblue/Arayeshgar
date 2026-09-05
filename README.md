# آرایشگر — پلتفرم رزرو وقت برای آرایشگرها

یک سیستم چند‌مستاجری (multi-tenant) که برای هر آرایشگر/آرایشگاه یک پکیج کامل با برند خودش تحویل می‌دهد:
**سایت اختصاصی + ربات تلگرام + ربات بله + پنل ادمین**، همه روی یک منبع داده واحد و سینک لحظه‌ای.

| کجا                    | چه                                                          |
| ---------------------- | ----------------------------------------------------------- |
| `docs/ARCHITECTURE.md` | معماری، مدل داده، ماشین وضعیت رزرو، سه سناریوی آرایشگاه     |
| `docs/STATE.md`        | چک‌پوینت پیشرفت: کدام فاز تمام شده، چه مانده، تصمیم‌های باز |
| `docs/SKILLS.md`       | قواعد پروژه برای هر کسی که روی کد کار می‌کند (انسان یا AI)  |
| `docs/RESEARCH.md`     | یافته‌های تحقیق: بله، هاستینگ، قالب‌ها، AI، اینستاگرام      |
| `docs/ONBOARDING.md`   | چطور یک آرایشگر جدید را در ۵ دقیقه راه بیندازیم             |
| `docs/RUNBOOK.md`      | «چه کنم اگر …» برای بهره‌بردار                              |

## ساختار

```
apps/web        Next.js: سایت هر آرایشگر (از hostname)، فلو رزرو، پنل ادمین، پنل پلتفرم
apps/bots       یک پروسه، N ربات (تلگرام + بله با یک کد)، worker نوتیفیکیشن و انقضا
packages/core   منطق دامنه مشترک: اسلات‌ها، موتور رزرو، پرداخت، نوتیف، فلگ‌ها، مجوزها
packages/db     اسکیمای Drizzle، migration ها، seed
packages/themes سه قالب سایت قابل تعویض
deploy/         docker-compose، Caddyfile، بک‌آپ
scripts/        bale-probe، tenant-create
```

## اجرای محلی (توسعه)

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.dev.yml up -d   # فقط Postgres
pnpm install
pnpm db:migrate && pnpm db:seed                          # tenant دمو: demo.localhost, admin/admin1234
pnpm dev                                                 # web: http://demo.localhost:3000 , bots: :3001
```

## کیفیت

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
```
