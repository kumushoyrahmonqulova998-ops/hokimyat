# MIRZAOBOD PF-193 — AXBOROT-TAHLIL VA MONITORING PLATFORMASI

Mirzaobod tumani hokimligi uchun O'zbekiston Respublikasi Prezidentining PF-193 farmoni ijrosini nazorat qilish, ma'lumotlarni yig'ish, tarixiy versiyalash, tahlil qilish va avtomatik hisobot shakllantirish platformasi.

React + Express ilovasi loyiha ildizida asosiy ilova sifatida ishlaydi. Avvalgi
Laravel fayllari `laravel-archive/` ichida saqlangan; ularni bu Node ilovaga
avtomatik birlashtirmadik. Laravel uchun lokal `.env` fayli arxivda saqlandi;
Node ilovasi uchun yangi `.env` nusxasi yaratilmagan.

---

## 1. Loyiha haqida va arxitektura izohi

Ushbu tizim AI Studio runtime muhitiga mos ravishda **Node.js 22 + Express + TypeScript + SQLite (ACID, Foreign Keys, WAL) + React 19 + Chart.js + Tailwind CSS v4** stekida to'liq ishlaydigan full-stack platforma sifatida qurilgan *(muhitda PHP/Laravel runtime mavjud bo'lmaganligi sababli barcha relatsion jadvallar, RBAC, sessiyali autentifikatsiya, tarixiy versiyalash va import/eksport jarayonlari Express + SQLite backendida amalga oshirildi)*.

### Asosiy imkoniyatlar:
- **4 ta alohida kirish portali**: Super Admin, Admin-1 (Yo'nalishlar), Admin-2 (Hududiy tahlil va tasdiqlash), Mahalla operatori.
- **14 ta PF-193 yo'nalishi** va ularning barcha ko'rsatkichlari markazlashgan konfiguratsiyada (`server/config.ts`).
- **O'chirilmaydigan tarixiy versiyalash (`indicator_histories`)**: har bir o'zgarish eski qiymat, yangi qiymat, farq, foiz, manba, foydalanuvchi, izoh va `Asia/Tashkent` vaqti bilan saqlanadi.
- **Tasdiqlash zanjiri (`approvals`)**: mahallalar yuborgan ma'lumotlar tasdiqlanmaguncha umumiy rasmiy statistikaga qo'shilmaydi.
- **3 xil ma'lumot yuklash usuli**: Excel (`.xlsx` / `.csv`), JSON va Yozma kiritish — oldindan ko'rish, xato kataklarni ajratish, atomik tranzaksiya (xato bo'lsa qisman saqlanmaydi).
- **Avtomatik hisobotlar**: Haftalik, Oylik va Yillik hisobotlar faqat haqiqiy tarixiy yozuvlardan hisoblanadi; PDF, Excel (`.xlsx`), CSV (UTF-8 BOM) va JSON formatlarida eksport qilinadi.

---

## 2. Talab qilinadigan muhit va paketlar

- **Node.js**: `22.x` (`v22.23.2`)
- **Ma'lumotlar bazasi**: SQLite (`better-sqlite3`, `PRAGMA foreign_keys = ON`, `WAL`)
- **Asosiy paketlar**: `express`, `bcryptjs`, `helmet`, `express-rate-limit`, `cookie-parser`, `multer`, `xlsx`, `jspdf`, `jspdf-autotable`, `chart.js`, `react`, `tailwindcss`

---

## 3. O'rnatish, migratsiya va ishga tushirish

1. **Bog'liqliklarni o'rnatish**:
   ```bash
   npm install
   ```

2. **Muhit o'zgaruvchilari** (`.env.example` asosida `.env` yaratish mumkin):
   - `DB_PATH="data/mirzaobod_pf193.db"`
   - `PORT=3000`

3. **Birinchi Super Admin yaratish (ochiq kodda parolsiz)**:
   - **Usul A (CLI orqali)**:
     ```bash
     npx tsx server/cli.ts create-superadmin
     npx tsx server/cli.ts seed-history
     ```
   - **Usul B (Brauzer orqali birlamchi sozlash)**:
     Ilova birinchi marta ishga tushganda avtomatik ravishda **Birlamchi tizimni ishga tushirish** oynasi ochiladi. Unda Super Admin login/paroli kiritiladi va xohishga ko'ra ko'p haftalik tarixiy baza hamda Admin-1/Admin-2/Mahalla uchun bir martalik tasodifiy parolli hisoblar yaratiladi.

4. **Serverni ishga tushirish**:
   ```bash
   npm run dev        # Ishlab chiqish rejimi (port 3000)
   npm run build      # Frontend build
   npm start          # Ishlab chiqarish serveri
   ```

---

## 4. Ma'lumotlar bazasi arxitekturasi

`server/db.ts` avtomatik ravishda quyidagi jadvallarni Foreign Key va indekslar bilan yaratadi:
- `roles`, `permissions`, `role_permissions`, `user_permissions`
- `users`, `user_directions`, `sessions`
- `mahallas`, `directions`, `indicators`
- `indicator_values`, `indicator_histories`
- `data_imports`, `data_import_rows`
- `approvals`, `report_snapshots`
- `audit_logs`, `system_settings`, `notifications`

Barcha sanalar va davr chegaralari `Asia/Tashkent` (`UTC+5`) vaqt mintaqasida yuritiladi.

---

## 5. Rollar va ruxsatlar (RBAC / PBAC)

1. **Super Admin** (`/login/super-admin`): barcha dashboardlar, foydalanuvchilarni yaratish/bloklash/parol tiklash (qayta autentifikatsiya bilan), Admin-1 yo'nalishlarini biriktirish, mahallalar boshqaruvi, xavfsizlik/audit jurnali, sozlamalar va JSON zaxira nusxa.
2. **Admin-1** (`/login/admin-1`): faqat biriktirilgan yo'nalishlar bo'yicha ko'rsatkichlarni ko'rish, tahrirlash, Excel/JSON/qo'lda yuklash va tasdiqlash.
3. **Admin-2** (`/login/admin-2`): mahallalar kesimida taqqoslash, tasdiqlash/qaytarish, oylik/yillik hisobotlar va mahallalar reytingi.
4. **Mahalla** (`/login/mahalla`): faqat o'z mahallasining ko'rsatkichlarini ko'rish, kiritish va tasdiqlashga yuborish (boshqa mahallalarga kirish API darajasida bloklangan).

---

## 6. Xavfsizlik choralari

- `bcryptjs` parol xeshlash va admin yaratgan vaqtinchalik parolni birinchi kirishda majburiy almashtirish.
- Sessiya fiksatsiyasi himoyasi (har kirishda eski sessiya o'chiriladi, yangi SHA-256 token yaratiladi), `HttpOnly`, `SameSite=Lax` cookie.
- Barcha `POST/PUT/PATCH/DELETE` so'rovlarda `X-CSRF-Token` tekshiruvi.
- Brute-force himoyasi (`express-rate-limit` + ma'lumotlar bazasida login urinishlarini sanash va vaqtincha bloklash).
- Parametrlashtirilgan SQL so'rovlar (SQL Injection himoyasi) va HTML teglarini tozalash (XSS himoyasi).
- Fayl yuklashda qat'iy kengaytma/hajm tekshiruvi (`.xlsx`, `.csv`, `.json`), zararli fayllarni rad etish.
- Muhim amallarda (bloklash, parol tiklash, sozlamalar, zaxira nusxa) qayta autentifikatsiya.

---

## 7. Avtomatlashtirilgan testlar

```bash
npm test
npm run lint
npm run build
```
`tests/platform.test.ts` fayli 4 ta portal autentifikatsiyasi, RBAC/mahalla izolyatsiyasi, CSRF, manfiy qiymat rad etilishi, Excel/JSON atomik importi, tarixiy hisobotlar, 4 xil eksport va XSS/SQLi himoyasini tekshiradi.

---

## 8. Netlify va production hosting

`netlify.toml` frontend uchun `npm run build` va `dist` publish katalogini
sozlaydi, SPA sahifalariga fallback beradi. Bu sozlama faqat frontendni build
qiladi; **ilovani to'liq production'da ishlatish uchun yetarli emas**.

Ilovaning autentifikatsiyasi va barcha `/api/*` endpointlari Express serverida,
ma'lumotlar esa `better-sqlite3` orqali lokal SQLite faylida saqlanadi. Netlify
statik deployi Express serverini ishga tushirmaydi va doimiy SQLite saqlashni
kafolatlamaydi. Shuning uchun bu deploy bilan login, API va ma'lumotlar bazasi
ishlamaydi; haqiqiy foydalanuvchilar yoki ma'lumotlar bilan production sifatida
ishlatmang.

To'liq deploydan oldin backendni doimiy disk/ma'lumotlar bazasini qo'llaydigan
Node.js hostingiga joylashtirish, `DB_PATH` va kuchli `SESSION_SECRET` ni
hostingning maxfiy environment sozlamalarida belgilash, so'ng frontend va
backendni xavfsiz ulash kerak. Hozirgi frontend API so'rovlarini nisbiy
`/api/*` yo'llariga yuboradi; backend manzili berilmagani uchun API URL
to'qib kiritilmadi. Haqiqiy backend manzili va autentifikatsiya/CORS/cookie
sozlamalari aniqlanmaguncha Netlify production deploy bajarilmaydi.

Muhit o'zgaruvchilari: `DB_PATH` va `SESSION_SECRET` backend uchun; `APP_URL`
va `GEMINI_API_KEY` `.env.example` da ko'rsatilgan ixtiyoriy sozlamalardir.
Haqiqiy secretlarni GitHub'ga qo'ymang.
