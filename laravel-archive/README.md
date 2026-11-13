# Mirzaobod PF-193 monitoring platformasi

Laravel 12 va Blade asosidagi PF-193 monitoring platformasi. Vaqt zonasi
`Asia/Tashkent`; ma’lumotlar bazasi uchun SQLite, MySQL va PostgreSQL
konfiguratsiyalari mavjud.

## Talablar

- PHP 8.2 yoki undan yuqori
- Composer
- SQLite uchun `pdo_sqlite`, MySQL uchun `pdo_mysql` yoki PostgreSQL uchun `pdo_pgsql`

## O‘rnatish

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

Ilova `http://127.0.0.1:8000` manzilida ochiladi. Ishlab chiqarish muhiti
uchun `.env` ichida `APP_DEBUG=false`, HTTPS va mos ma’lumotlar bazasi
hisob ma’lumotlarini sozlang. Maxfiy qiymatlarni repozitoriyga kiritmang.

## Super Admin yaratish

Seeder faqat rollar, ruxsatlar, yo‘nalishlar va ko‘rsatkichlar katalogini
yaratadi; boshlang‘ich foydalanuvchi yoki parol yaratmaydi. Migratsiya va
seedingdan keyin Super Adminni interaktiv terminalda yarating:

```powershell
php artisan app:create-super-admin
```

Komanda parolni terminalda ko‘rsatmaydi; kamida 12 belgi, katta-kichik harf
va raqam talab qilinadi. Parolni command argumenti orqali uzatmang.

## Joriy qilingan ma’lumotlar qatlami

- RBAC rollari va ruxsatlar jadvallari, foydalanuvchi–mahalla bog‘lanishi
- Markazlashgan yo‘nalish va ko‘rsatkichlar katalogi
- Mahalla va tuman kesimidagi joriy qiymatlar
- O‘zgarmas o‘zgarishlar tarixi, tasdiqlash, audit va import jadvallari
- Ko‘rsatkich yozuvi va tasdiqlashni tranzaksiyada bajaruvchi Action sinflari
- Mahalla foydalanuvchisini o‘z hududi ma’lumotlari bilan cheklovchi tekshiruv

Katalog nomlari va o‘lchov birliklari `config/monitoring.php` faylida.
Rollar va katalogni takroran xavfsiz yaratish uchun `php artisan db:seed`
buyrug‘idan foydalaning.

## Joriy holat va cheklovlar

Mavjud Blade dashboard hanuz sessionga asoslangan prototip; u yangi ma’lumotlar
qatlami, autentifikatsiya, import, eksport yoki hisobotlarga ulanmagan. To‘rtta
login interfeysi, barcha route’larni middleware/policy bilan himoyalash,
mahalla va yo‘nalish darajasidagi vakolatlar, bazadan hisoblanadigan hisobotlar,
xavfsiz fayl import/eksporti, UI integratsiyasi va avtomatlashtirilgan testlar
keyingi bosqichlarda bajarilishi kerak. Ishlab chiqarish muhitiga chiqarishdan
oldin bu ishlar tugallanishi va tekshirilishi shart.

Bu muhitda PHP va Composer mavjud bo‘lmagani sababli dependency o‘rnatish,
migratsiya, Artisan buyruqlari va PHP testlarini ishga tushirish imkoni yo‘q.
