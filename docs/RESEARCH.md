# RESEARCH — یافته‌های تحقیق (۲۰۲۶/۰۹/۰۵)

> منبع تصمیم‌های فنی. هر ادعا با منبع؛ موارد تأییدنشده صریحاً علامت خورده‌اند. نتیجه‌ی `pnpm bale:probe` بعد از دریافت توکن همین‌جا اضافه می‌شود.

## ۱. API ربات بله

- **آدرس پایه:** `https://tapi.bale.ai/bot<TOKEN>/<METHOD>`؛ دانلود فایل: `https://tapi.bale.ai/file/bot<TOKEN>/<file_path>`. مستندات رسمی: [docs.bale.ai](https://docs.bale.ai/) و dev.bale.ai؛ سازمان رسمی گیت‌هاب: [balemessenger](https://github.com/balemessenger).
- **سازگاری با تلگرام:** نمونه رسمی بله همان python-telegram-bot است فقط با `base_url="https://tapi.bale.ai/"` ([echobot.py](https://github.com/balemessenger/bale-bot-samples/blob/master/new_api_example/echobot.py)). متدهای تأییدشده در SDKهای جامعه: sendMessage, sendPhoto, editMessageText, getFile, setWebhook/getWebhookInfo, getUpdates, answerCallbackQuery ([GhiaC/bale-bot-api](https://github.com/GhiaC/bale-bot-api/blob/master/bot.go)).
- **دکمه شیشه‌ای و callback_query:** پشتیبانی می‌شود؛ `answerCallbackQuery` از خرداد ۱۴۰۴ به کلاینت‌های بله اضافه شده و کلاینت‌های قدیمی ندارند ⇒ طراحی ما به آن وابسته نیست (stateless با callback_data، پاسخ با editMessageText).
- **وب‌هوک:** پشتیبانی می‌شود؛ گواهی self-signed رد می‌شود ⇒ Caddy با گواهی معتبر. فایل تا ۲۰MB.
- **grammY:** `new Bot(token, { client: { apiRoot } })` ([grammY docs](https://grammy.dev/ref/core/apiclientoptions)). ⇒ یک کد برای دو پلتفرم.
- **تأییدنشده / ریسک:** inline mode احتمالاً ندارد (فرض: ندارد)؛ برابری فیلدهای Update تست نشده؛ rate limit روی POST سنگین گزارش شده. **اقدام:** اجرای `scripts/bale-probe.ts` در ابتدای فاز ۴.

## ۲. هاستینگ و دسترسی

- `api.telegram.org` از ایران فیلتر است؛ راه‌حل: سرور خارجی یا رله (Cloudflare Worker). تصمیم: **VPS خارجی ابر آروان** ⇒ دسترسی مستقیم؛ متغیر `TELEGRAM_API_ROOT` برای رله در آینده.
- دسترسی به بله از خارج: منبع قطعی پیدا نشد؛ **باید با curl از همان VPS تست شود** (در bale-probe).
- **ریسک قطعی سراسری اینترنت ایران** (خرداد ۱۴۰۴، دی تا خرداد ۱۴۰۵): در این دوره‌ها فقط هاست داخلی از ایران قابل دسترس بود و رنج‌های Hetzner/Cloudflare هم بلاک شدند. پیشنهاد آینده: نسخه‌ی «داخل ایران» با سایت + بله روی هاست داخلی و فقط ورکر تلگرام خارج. معماری فعلی (یک compose، `TELEGRAM_API_ROOT` قابل تنظیم) این را ممکن می‌کند.
- Vercel برای بازدیدکننده ایرانی قابل اتکا نیست (تحریم)؛ Cloudflare در بحران‌ها بلاک می‌شود؛ Liara/Hamravesh PaaS داکری داخلی دارند (بدون تأیید پروکسی تلگرام).

## ۳. کارت‌به‌کارت و پیامک

- الگوی رایج: نمایش شماره کارت + نام + مبلغ دقیق ⇒ مشتری عکس رسید (+ شماره پیگیری اختیاری) ⇒ وضعیت «در انتظار تأیید» ⇒ ادمین در ربات با دکمه تأیید/رد ⇒ اطلاع به مشتری. **پیشنهاد (تأییدنشده):** پسوند مبلغ یکتا برای تطبیق ساده‌تر. انقضای خودکار رزرو پرداخت‌نشده الزامی است.
- پیامک OTP: کاوه‌نگار، SMS.ir، قاصدک؛ حدود ۲۰۰ تا ۶۰۰ ریال به‌ازای هر پیامک (تعرفه دقیق کاوه‌نگار تأییدنشده). برای آینده به‌عنوان فلگ `sms_otp`.

## ۴. فیچرهای محصولات رزرو (Booksy, Fresha, Squire, Vagaro, Schedulicity + ایرانی‌ها)

- **هسته (نگه‌داشتیم):** فلو ۳ تا ۴ قدمی، یادآوری خودکار (کاهش ۲۹ تا ۵۰٪ عدم‌مراجعه)، بیعانه (کاهش ۲۹ تا ۷۰٪)، یادداشت و تاریخچه مشتری، متن سیاست کنسلی، نظرات.
- **خوب برای بعد:** لیست انتظار با اطلاع خودکار، رزرو تکراری، عکس روی پروفایل مشتری.
- **بلوت برای آرایشگر مستقل:** POS/انبار/حقوق، کارت هدیه، کمپین ایمیلی، اپ نیتیو، چت داخلی (پیام‌رسان همین حالا هست)، باشگاه پیچیده.
- ایرانی‌ها (رزرور، RezerveTime، بارو رو) همه مارکت‌پلیس‌اند؛ **ربات و سایت با برند خود آرایشگر تمایز ماست.**

## ۵. AI تست مدل مو

- Perfect Corp YouCam API (۱۱ API مو/ریش)، fal.ai (`hair-fast-gan`, `image-editing/hair-change`، حدود ۰.۰۲ تا ۰.۰۹ دلار/تصویر تأییدنشده)، متن‌باز HairFastGAN (NeurIPS 2024، <۱ ثانیه روی V100؛ لایسنس قبل از استفاده تجاری بررسی شود).
- مانع اصلی: پرداخت ارزی و کیفیت روی موی کوتاه مردانه/ریش. **پیشنهاد:** فاز بعد از سودآوری، self-host با گالری مرجع و سقف مصرف؛ در معماری فقط یک ماژول با آداپتر.

## ۶. سایت پرسونال برند آرایشگر

چک‌لیست: hero با نام/عکس + CTA «رزرو» ثابت؛ بیو کوتاه؛ گالری قبل/بعد؛ خدمات + قیمت؛ نظرات؛ ساعت کاری؛ لوکیشن/نقشه؛ لینک اینستاگرام (نه embed؛ از ایران باز نمی‌شود)؛ FAQ (تماس‌ها را کم می‌کند). منابع: GlossGenius, Common Ninja, Colorlib.

## ۷. استخراج خودکار اینستاگرام

- Graph API فقط برای اکانت Professional + لاگین فیسبوک + App Review متا. Instaloader در production مدام 401 می‌گیرد. اسکرپرهای پولی (Apify ~۱.۵ دلار/۱۰۰۰ پست) نیاز به کارت ارزی؛ اینستاگرام از ایران فیلتر است.
- **نتیجه:** آنبوردینگ نیمه‌اتوماتیک (هندل + ۳ تا ۶ عکس + چند فیلد). فچ خودکار پشت فلگ خاموش برای آینده.

## ۸. قالب‌های اوپن‌سورس برای الهام (گیت‌هاب)

قالب فارسی اوپن‌سورس با کیفیت وجود ندارد؛ چیدمان از خارجی‌ها، زیرساخت RTL از ابزار فارسی/عربی. فقط از مخازن با لایسنس آزاد کد گرفته می‌شود.

| مخزن                                                                                                                                      | ★             | لایسنس                           | برای چه                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------- | ------------------------------------------------------ |
| [shadcn-ui/next-template-rtl](https://github.com/shadcn-ui/next-template-rtl)                                                             | ۱۲ (۱۸۵ fork) | نامشخص — قبل از کپی کد بررسی شود | پایه RTL همه قالب‌ها (`dir="rtl"` + logical utilities) |
| [Northstrix/clandestine-beauty-salon-landing-page-template](https://github.com/Northstrix/clandestine-beauty-salon-landing-page-template) | ۲             | MIT                              | بهترین RTL؛ مودال رزرو با تقویم؛ FAQ؛ تیم ⇒ قالب C     |
| [OthmanAdi/BarbersBuddies_Onlineshop_maker](https://github.com/OthmanAdi/BarbersBuddies_Onlineshop_maker)                                 | ۲۰            | MIT                              | فلو خدمت→آرایشگر→اسلات؛ تم luxury ⇒ قالب A/C           |
| [MartinXCVI/beauty-salon](https://github.com/MartinXCVI/beauty-salon)                                                                     | ۰             | MIT                              | روشن/ادیتوریال، گالری lightbox ⇒ قالب B                |
| [leoMirandaa/shadcn-landing-page](https://github.com/leoMirandaa/shadcn-landing-page)                                                     | ۱٬۹۸۱         | MIT                              | اسکلت سکشن‌ها و توکن‌های dark/light ⇒ قالب B           |
| [ositaka/noor-ui](https://github.com/ositaka/noor-ui)                                                                                     | ۶             | MIT                              | الگوهای logical-property                               |
| [felipemotarocha/fullstackweek-barber-v2](https://github.com/felipemotarocha/fullstackweek-barber-v2)                                     | ۱۶۳           | **بدون لایسنس — فقط الهام**      | چیدمان اپ‌گونه موبایل، شیت رزرو ⇒ قالب A               |
| [codewithsadee/barber](https://github.com/codewithsadee/barber)                                                                           | ۱۱۸           | **بدون لایسنس — فقط الهام**      | hero کلاسیک، لیست قیمت ⇒ قالب A                        |

**فونت‌ها (OFL):** [Vazirmatn](https://github.com/rastikerdar/vazirmatn) متن، [Estedad](https://github.com/aminabedi68/Estedad) تیتر، [Sahel](https://github.com/rastikerdar/sahel-font) جایگزین نرم. Shabnam آرشیو شده؛ IRANSans/Yekan تجاری ⇒ استفاده نمی‌شود.  
**قواعد تایپوگرافی فارسی:** بدون letter-spacing؛ line-height ≥ ۱.۸؛ `text-align: start`؛ ارقام فارسی؛ تیتر موبایل ≤ ۴۴px ([W3C alreq](https://www.w3.org/TR/alreq/)).  
**تقویم جلالی:** [react-day-picker](https://github.com/gpbl/react-day-picker) نسخه persian (MIT، فعال) + [shadcn-persian-calendar](https://github.com/MehhdiMarzban/shadcn-persian-calendar) (MIT)؛ گزینه دوم [avan-persian-date-picker](https://github.com/danial-riazati/avan-persian-date-picker) (MIT). تبدیل: [jalaali-js](https://github.com/jalaali/jalaali-js) (MIT).  
**RTL در Tailwind:** بدون پلاگین؛ `rtl:`/`ltr:` و `ms-/me-/ps-/pe-/text-start` (Tailwind ≥ 3.3 / v4).

### سه جهت قالب

- **A «شب و طلا»:** hero تمام‌عرض عکس + دکمه طلایی؛ لیست قیمت دو ستونه با نقطه‌چین؛ گالری masonry + lightbox؛ نظرات carousel؛ نوار رزرو ثابت پایین موبایل. Estedad 700/800 تیتر ۲۸ تا ۴۰px، Vazirmatn متن ۱۶ تا ۱۷px، طلایی #C9A227 روی #0E0E10.
- **B «روشن و مینیمال»:** hero متن‌محور؛ کارت‌های خدمت با مدت و قیمت؛ گالری متناوب عریض/بلند؛ نظرات نقل‌قولی؛ نوار CTA بالا که در موبایل پایین می‌آید. Sahel/Vazirmatn 600، پس‌زمینه #FAF7F2، یک اکسنت (سبز تیره یا آجری).
- **C «مدرن و پررنگ»:** hero دوتکه با تیتر متحرک؛ کارت‌های خدمت اسکرول افقی؛ گالری bento؛ کارت‌های تیم؛ مودال رزرو با تقویم جلالی. Estedad 900 نمایشی ۳۲ تا ۴۴px.
