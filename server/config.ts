export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface DirectionDef {
  sortOrder: number;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
}

export interface IndicatorDef {
  directionSlug: string;
  code: string;
  name: string;
  unit: string;
  valueType: 'integer' | 'decimal' | 'currency' | 'percent';
  isTargetMetric?: boolean;
  isNegativeGood?: boolean;
  sortOrder: number;
}

export const TASHKENT_TZ = 'Asia/Tashkent';

export function nowTashkentDate(): Date {
  return new Date();
}

export function toTashkentParts(date: Date | string = new Date()): {
  iso: string;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm:ss
  displayDate: string; // DD.MM.YYYY
  displayTime: string; // HH:mm
  year: number;
  month: number;
  day: number;
} {
  const d = typeof date === 'string' ? new Date(date) : date;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const timeStr = `${hour}:${parts.minute}:${parts.second}`;
  return {
    iso: `${dateStr}T${timeStr}+05:00`,
    dateStr,
    timeStr,
    displayDate: `${parts.day}.${parts.month}.${parts.year}`,
    displayTime: `${hour}:${parts.minute}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function getPeriodBounds(
  periodType: PeriodType,
  referenceDateStr?: string
): {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  label: string;
  previousLabel: string;
} {
  const refParts = referenceDateStr
    ? toTashkentParts(`${referenceDateStr}T12:00:00+05:00`)
    : toTashkentParts();

  const refDate = new Date(`${refParts.dateStr}T12:00:00+05:00`);

  const addDays = (base: Date, days: number): string => {
    const copy = new Date(base.getTime() + days * 86400000);
    return toTashkentParts(copy).dateStr;
  };

  if (periodType === 'weekly') {
    const dayOfWeek = (refDate.getUTCDay() + 6) % 7; // 0 = Monday .. 6 = Sunday
    const currentStart = addDays(refDate, -dayOfWeek);
    const currentEnd = addDays(new Date(`${currentStart}T12:00:00+05:00`), 6);
    const previousStart = addDays(new Date(`${currentStart}T12:00:00+05:00`), -7);
    const previousEnd = addDays(new Date(`${currentStart}T12:00:00+05:00`), -1);
    return {
      currentStart: `${currentStart}T00:00:00+05:00`,
      currentEnd: `${currentEnd}T23:59:59+05:00`,
      previousStart: `${previousStart}T00:00:00+05:00`,
      previousEnd: `${previousEnd}T23:59:59+05:00`,
      label: `Haftalik (${currentStart} — ${currentEnd})`,
      previousLabel: `${previousStart} — ${previousEnd}`,
    };
  }

  if (periodType === 'monthly') {
    const y = refParts.year;
    const m = refParts.month;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    const currentStart = `${y}-${mm}-01`;
    const currentEnd = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const prevLastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const pmm = String(prevMonth).padStart(2, '0');
    const previousStart = `${prevYear}-${pmm}-01`;
    const previousEnd = `${prevYear}-${pmm}-${String(prevLastDay).padStart(2, '0')}`;

    return {
      currentStart: `${currentStart}T00:00:00+05:00`,
      currentEnd: `${currentEnd}T23:59:59+05:00`,
      previousStart: `${previousStart}T00:00:00+05:00`,
      previousEnd: `${previousEnd}T23:59:59+05:00`,
      label: `Oylik (${mm}.${y})`,
      previousLabel: `${pmm}.${prevYear}`,
    };
  }

  // yearly
  const y = refParts.year;
  return {
    currentStart: `${y}-01-01T00:00:00+05:00`,
    currentEnd: `${y}-12-31T23:59:59+05:00`,
    previousStart: `${y - 1}-01-01T00:00:00+05:00`,
    previousEnd: `${y - 1}-12-31T23:59:59+05:00`,
    label: `Yillik (${y}-yil)`,
    previousLabel: `${y - 1}-yil`,
  };
}

export const DIRECTIONS: DirectionDef[] = [
  {
    sortOrder: 1,
    slug: 'demografiya',
    name: 'Aholi demografiyasi',
    shortName: 'Demografiya',
    description: 'Doimiy aholi, oilalar, ayollar, erkaklar, voyaga yetmaganlar va yoshlar tarkibi.',
    icon: 'Users',
  },
  {
    sortOrder: 2,
    slug: 'ijtimoiy-reyestr',
    name: 'Ijtimoiy reyestr',
    shortName: 'Ijtimoiy reyestr',
    description: "Ijtimoiy himoya yagona reyestridagi oilalar, fuqarolar va kambag'allik toifalari.",
    icon: 'ClipboardList',
  },
  {
    sortOrder: 3,
    slug: 'bandlik',
    name: 'Ishsizlik va bandlik',
    shortName: 'Bandlik',
    description: "Aniqlangan ishsizlar, ishga joylashtirilganlar, o'zini o'zi band qilganlar va ijro.",
    icon: 'Briefcase',
  },
  {
    sortOrder: 4,
    slug: 'tadbirkorlik',
    name: 'Tadbirkorlik va kreditlar',
    shortName: 'Tadbirkorlik',
    description: "Tadbirkorlik ehtiyoji, kreditlar, yangi loyihalar va yaratilgan ish o'rinlari.",
    icon: 'Building2',
  },
  {
    sortOrder: 5,
    slug: 'norasmiy-bandlik',
    name: 'Norasmiy bandlik',
    shortName: 'Norasmiy bandlik',
    description: 'Norasmiy sektorda aniqlangan va rasmiylashtirilgan fuqarolar hisobi.',
    icon: 'FileCheck2',
  },
  {
    sortOrder: 6,
    slug: 'subsidiyalar',
    name: "Subsidiyalar va ko'mak",
    shortName: 'Subsidiyalar',
    description: "Subsidiyaga murojaatlar, ajratilgan subsidiyalar, yordam olganlar va mablag'lar.",
    icon: 'HandCoins',
  },
  {
    sortOrder: 7,
    slug: 'kasb-hunar',
    name: "Kasb-hunarga o'qitish",
    shortName: "Kasb-hunar o'qitish",
    description: "O'qishga yuborilganlar, bitiruvchilar, sertifikat olganlar va bandlik.",
    icon: 'GraduationCap',
  },
  {
    sortOrder: 8,
    slug: 'maktabgacha-talim',
    name: "Maktabgacha ta'lim",
    shortName: "Maktabgacha ta'lim",
    description: "Bog'chaga ehtiyoj, qamrab olingan bolalar, navbat va xizmat ko'rsatish.",
    icon: 'Baby',
  },
  {
    sortOrder: 9,
    slug: 'tibbiy-yordam',
    name: 'Tibbiy yordam',
    shortName: 'Tibbiy yordam',
    description: "Aniqlangan bemorlar, tibbiy ko'rik, davolanish va dori-darmon ko'magi.",
    icon: 'HeartPulse',
  },
  {
    sortOrder: 10,
    slug: 'uy-joy-kadastr',
    name: 'Uy-joy va kadastr',
    shortName: 'Uy-joy va kadastr',
    description: "Uy-joyga ehtiyoj, ta'mirlash, kadastr hujjatlarini rasmiylashtirish.",
    icon: 'Home',
  },
  {
    sortOrder: 11,
    slug: 'moddiy-yordam',
    name: 'Moddiy yordam',
    shortName: 'Moddiy yordam',
    description: "Moddiy yordamga muhtoj oilalar, yordam olganlar va ajratilgan mablag'lar.",
    icon: 'Wallet',
  },
  {
    sortOrder: 12,
    slug: 'kommunal-tolovlar',
    name: "Kommunal to'lovlar",
    shortName: "Kommunal to'lovlar",
    description: "Qarzdor oilalar, ko'makka muhtojlar va kommunal to'lovlar bo'yicha yordam.",
    icon: 'Zap',
  },
  {
    sortOrder: 13,
    slug: 'korxona-soglomlashtirish',
    name: "Korxonani sog'lomlashtirish",
    shortName: "Korxonalar",
    description: "Sog'lomlashtirilayotgan korxonalar, qayta tuzilgan kreditlar va ish o'rinlari.",
    icon: 'Factory',
  },
  {
    sortOrder: 14,
    slug: 'ajratilgan-mablaglar',
    name: "Ajratilgan mablag'lar",
    shortName: "Mablag'lar",
    description: "PF-193 doirasida ajratilgan, sarflangan va qolgan moliyaviy mablag'lar.",
    icon: 'Landmark',
  },
];

export const INDICATORS: IndicatorDef[] = [
  // 1. Demografiya
  { directionSlug: 'demografiya', code: 'demo_aholi', name: 'Doimiy aholi soni', unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'demografiya', code: 'demo_oilalar', name: 'Oilalar soni', unit: 'ta', valueType: 'integer', sortOrder: 2 },
  { directionSlug: 'demografiya', code: 'demo_ayollar', name: 'Ayollar soni', unit: 'nafar', valueType: 'integer', sortOrder: 3 },
  { directionSlug: 'demografiya', code: 'demo_erkaklar', name: 'Erkaklar soni', unit: 'nafar', valueType: 'integer', sortOrder: 4 },
  { directionSlug: 'demografiya', code: 'demo_voyaga_yetmagan', name: 'Voyaga yetmaganlar', unit: 'nafar', valueType: 'integer', sortOrder: 5 },
  { directionSlug: 'demografiya', code: 'demo_yoshlar', name: 'Yoshlar (14-30 yosh)', unit: 'nafar', valueType: 'integer', sortOrder: 6 },

  // 2. Ijtimoiy reyestr
  { directionSlug: 'ijtimoiy-reyestr', code: 'reyestr_oilalar', name: 'Ijtimoiy reyestrdagi oilalar', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'ijtimoiy-reyestr', code: 'reyestr_fuqarolar', name: 'Ijtimoiy reyestrdagi fuqarolar', unit: 'nafar', valueType: 'integer', sortOrder: 2 },
  { directionSlug: 'ijtimoiy-reyestr', code: 'reyestr_davlat_taminot', name: "Davlat ta'minotidagi oilalar", unit: 'ta', valueType: 'integer', sortOrder: 3 },
  { directionSlug: 'ijtimoiy-reyestr', code: 'reyestr_kambagal', name: "Kambag'al oilalar", unit: 'ta', valueType: 'integer', isNegativeGood: true, sortOrder: 4 },
  { directionSlug: 'ijtimoiy-reyestr', code: 'reyestr_chegaradagi', name: "Kambag'allik chegarasidagi oilalar", unit: 'ta', valueType: 'integer', isNegativeGood: true, sortOrder: 5 },

  // 3. Ishsizlik va bandlik
  { directionSlug: 'bandlik', code: 'bandlik_ishsizlar', name: 'Aniqlangan ishsizlar', unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'bandlik', code: 'bandlik_ishga_joy', name: 'Ishga joylashtirilganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'bandlik', code: 'bandlik_ozini_band', name: "O'zini o'zi band qilganlar", unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'bandlik', code: 'bandlik_qolgan', name: 'Qolgan ishsizlar', unit: 'nafar', valueType: 'integer', isNegativeGood: true, sortOrder: 4 },

  // 4. Tadbirkorlik va kreditlar
  { directionSlug: 'tadbirkorlik', code: 'tadbirkor_ehtiyoj', name: 'Aniqlangan tadbirkorlik ehtiyoji', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'tadbirkorlik', code: 'tadbirkor_kredit_olgan', name: 'Kredit olganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'tadbirkorlik', code: 'tadbirkor_loyihalar', name: 'Yangi loyihalar soni', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'tadbirkorlik', code: 'tadbirkor_kredit_summa', name: 'Ajratilgan kreditlar summasi', unit: "mln so'm", valueType: 'currency', isTargetMetric: true, sortOrder: 4 },
  { directionSlug: 'tadbirkorlik', code: 'tadbirkor_ish_orin', name: "Yaratilgan ish o'rinlari", unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 5 },

  // 5. Norasmiy bandlik
  { directionSlug: 'norasmiy-bandlik', code: 'norasmiy_aniqlangan', name: 'Aniqlangan norasmiy bandlar', unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'norasmiy-bandlik', code: 'norasmiy_rasmiy', name: 'Rasmiylashtirilganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'norasmiy-bandlik', code: 'norasmiy_qolgan', name: 'Qolgan fuqarolar', unit: 'nafar', valueType: 'integer', isNegativeGood: true, sortOrder: 3 },

  // 6. Subsidiyalar va ko'mak
  { directionSlug: 'subsidiyalar', code: 'subs_ehtiyoj', name: 'Subsidiyaga ehtiyoj', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'subsidiyalar', code: 'subs_murojaat', name: 'Subsidiyaga murojaatlar', unit: 'ta', valueType: 'integer', sortOrder: 2 },
  { directionSlug: 'subsidiyalar', code: 'subs_ajratilgan', name: 'Ajratilgan subsidiyalar soni', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'subsidiyalar', code: 'subs_yordam_olgan', name: 'Yordam olganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 4 },
  { directionSlug: 'subsidiyalar', code: 'subs_mablag', name: "Ajratilgan subsidiya mablag'i", unit: "mln so'm", valueType: 'currency', isTargetMetric: true, sortOrder: 5 },

  // 7. Kasb-hunarga o'qitish
  { directionSlug: 'kasb-hunar', code: 'kasb_yuborilgan', name: "O'qishga yuborilganlar", unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'kasb-hunar', code: 'kasb_tugatgan', name: "O'qishni tugatganlar", unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'kasb-hunar', code: 'kasb_sertifikat', name: 'Sertifikat olganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'kasb-hunar', code: 'kasb_ishga_joy', name: 'Ishga joylashgan bitiruvchilar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 4 },

  // 8. Maktabgacha ta'lim
  { directionSlug: 'maktabgacha-talim', code: 'mtt_ehtiyoj', name: "Bog'chaga ehtiyoj", unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'maktabgacha-talim', code: 'mtt_qamralgan', name: 'Qamrab olingan bolalar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'maktabgacha-talim', code: 'mtt_navbat', name: 'Navbatdagi bolalar', unit: 'nafar', valueType: 'integer', isNegativeGood: true, sortOrder: 3 },
  { directionSlug: 'maktabgacha-talim', code: 'mtt_xizmat', name: 'Xizmat olganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 4 },

  // 9. Tibbiy yordam
  { directionSlug: 'tibbiy-yordam', code: 'tib_bemorlar', name: 'Aniqlangan bemorlar', unit: 'nafar', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'tibbiy-yordam', code: 'tib_korik', name: "Tibbiy ko'rikdan o'tganlar", unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'tibbiy-yordam', code: 'tib_davolangan', name: 'Davolanganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'tibbiy-yordam', code: 'tib_doridarmon', name: 'Dori-darmon yordami olganlar', unit: 'nafar', valueType: 'integer', isTargetMetric: true, sortOrder: 4 },
  { directionSlug: 'tibbiy-yordam', code: 'tib_qolgan', name: 'Qolgan tibbiy ehtiyoj', unit: 'nafar', valueType: 'integer', isNegativeGood: true, sortOrder: 5 },

  // 10. Uy-joy va kadastr
  { directionSlug: 'uy-joy-kadastr', code: 'uy_ehtiyoj', name: 'Uy-joyga ehtiyoj', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'uy-joy-kadastr', code: 'uy_tamirlash', name: "Ta'mirlash ehtiyoji", unit: 'ta', valueType: 'integer', sortOrder: 2 },
  { directionSlug: 'uy-joy-kadastr', code: 'uy_kadastr', name: 'Rasmiylashtirilgan kadastr hujjatlari', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'uy-joy-kadastr', code: 'uy_bajarilgan', name: 'Bajarilgan uy-joy ishlari', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 4 },

  // 11. Moddiy yordam
  { directionSlug: 'moddiy-yordam', code: 'moddiy_muhtoj', name: 'Yordamga muhtoj oilalar', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'moddiy-yordam', code: 'moddiy_olgan', name: 'Moddiy yordam olgan oilalar', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'moddiy-yordam', code: 'moddiy_mablag', name: "Ajratilgan moddiy yordam mablag'i", unit: "mln so'm", valueType: 'currency', isTargetMetric: true, sortOrder: 3 },

  // 12. Kommunal to'lovlar
  { directionSlug: 'kommunal-tolovlar', code: 'kom_qarzdor', name: 'Qarzdor oilalar', unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'kommunal-tolovlar', code: 'kom_muhtoj', name: 'Yordamga muhtoj oilalar', unit: 'ta', valueType: 'integer', sortOrder: 2 },
  { directionSlug: 'kommunal-tolovlar', code: 'kom_yordam', name: "To'lov bo'yicha yordam olganlar", unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'kommunal-tolovlar', code: 'kom_mablag', name: "Ajratilgan kommunal ko'mak mablag'i", unit: "mln so'm", valueType: 'currency', isTargetMetric: true, sortOrder: 4 },

  // 13. Korxonani sog'lomlashtirish
  { directionSlug: 'korxona-soglomlashtirish', code: 'korx_soni', name: "Sog'lomlashtirilayotgan korxonalar", unit: 'ta', valueType: 'integer', sortOrder: 1 },
  { directionSlug: 'korxona-soglomlashtirish', code: 'korx_kredit', name: 'Qayta tuzilgan kreditlar', unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'korxona-soglomlashtirish', code: 'korx_saqlangan_ish', name: "Saqlab qolingan ish o'rinlari", unit: 'ta', valueType: 'integer', isTargetMetric: true, sortOrder: 3 },
  { directionSlug: 'korxona-soglomlashtirish', code: 'korx_reja_ish', name: "Rejalashtirilgan ish o'rinlari", unit: 'ta', valueType: 'integer', sortOrder: 4 },

  // 14. Ajratilgan mablag'lar
  { directionSlug: 'ajratilgan-mablaglar', code: 'mab_ajratilgan', name: 'Ajratilgan umumiy summa', unit: "mln so'm", valueType: 'currency', sortOrder: 1 },
  { directionSlug: 'ajratilgan-mablaglar', code: 'mab_sarflangan', name: 'Sarflangan summa', unit: "mln so'm", valueType: 'currency', isTargetMetric: true, sortOrder: 2 },
  { directionSlug: 'ajratilgan-mablaglar', code: 'mab_qolgan', name: 'Qolgan summa', unit: "mln so'm", valueType: 'currency', sortOrder: 3 },
];

export const MAHALLA_CATALOG = [
  { code: 'M01', name: "Navro'z MFY", sector: '1-sektor', populationBase: 4820 },
  { code: 'M02', name: 'Mustaqillik MFY', sector: '1-sektor', populationBase: 5140 },
  { code: 'M03', name: 'Toshkent MFY', sector: '1-sektor', populationBase: 4390 },
  { code: 'M04', name: 'Yangiobod MFY', sector: '2-sektor', populationBase: 3960 },
  { code: 'M05', name: "Mirzo Ulug'bek MFY", sector: '2-sektor', populationBase: 4650 },
  { code: 'M06', name: "Bog'iston MFY", sector: '2-sektor', populationBase: 3780 },
  { code: 'M07', name: 'Oqoltin MFY', sector: '3-sektor', populationBase: 4210 },
  { code: 'M08', name: 'Dehqonobod MFY', sector: '3-sektor', populationBase: 3640 },
  { code: 'M09', name: 'Guliston MFY', sector: '3-sektor', populationBase: 4090 },
  { code: 'M10', name: 'Mehnatobod MFY', sector: '4-sektor', populationBase: 3520 },
  { code: 'M11', name: 'Paxtaobod MFY', sector: '4-sektor', populationBase: 4480 },
  { code: 'M12', name: "Do'stlik MFY", sector: '4-sektor', populationBase: 4930 },
];

export const PERMISSIONS_CATALOG = [
  { slug: 'dashboard.view_all', name: "Barcha dashboardlarni ko'rish", groupName: 'Dashboard' },
  { slug: 'dashboard.view_assigned', name: "Biriktirilgan yo'nalishlarni ko'rish", groupName: 'Dashboard' },
  { slug: 'dashboard.view_territorial', name: "Hududiy tahlillarni ko'rish", groupName: 'Dashboard' },
  { slug: 'dashboard.view_own_mahalla', name: "O'z mahallasi dashboardini ko'rish", groupName: 'Dashboard' },
  { slug: 'data.enter_manual', name: "Qo'lda ma'lumot kiritish", groupName: "Ma'lumotlar" },
  { slug: 'data.import_excel', name: "Excel/CSV orqali yuklash", groupName: "Ma'lumotlar" },
  { slug: 'data.import_json', name: 'JSON orqali yuklash', groupName: "Ma'lumotlar" },
  { slug: 'data.edit_assigned', name: "Biriktirilgan ko'rsatkichlarni tahrirlash", groupName: "Ma'lumotlar" },
  { slug: 'data.approve', name: "Ma'lumotlarni tasdiqlash va qaytarish", groupName: 'Tasdiqlash' },
  { slug: 'data.view_history', name: "Ma'lumotlar tarixini ko'rish", groupName: 'Tarix' },
  { slug: 'reports.view', name: "Hisobotlarni ko'rish", groupName: 'Hisobotlar' },
  { slug: 'reports.export', name: 'PDF/Excel/CSV/JSON eksport qilish', groupName: 'Hisobotlar' },
  { slug: 'mahalla.manage', name: 'Mahallalarni boshqarish', groupName: 'Hududlar' },
  { slug: 'users.manage', name: 'Foydalanuvchilar va rollarni boshqarish', groupName: 'Foydalanuvchilar' },
  { slug: 'security.view', name: 'Audit log va xavfsizlikni kuzatish', groupName: 'Xavfsizlik' },
  { slug: 'settings.manage', name: 'Tizim sozlamalarini boshqarish', groupName: 'Sozlamalar' },
];

export const ROLE_DEFINITIONS = [
  {
    slug: 'super_admin',
    name: 'Super Admin',
    description: "Platformaning barcha yo'nalishlari, foydalanuvchilari, xavfsizligi va hisobotlarini to'liq boshqaruvchi.",
    permissions: PERMISSIONS_CATALOG.map((p) => p.slug),
  },
  {
    slug: 'admin_one',
    name: 'Admin-1 (Yo\'nalishlar)',
    description: "Biriktirilgan PF-193 yo'nalishlari bo'yicha ma'lumotlarni yuritish, yuklash va tekshirish.",
    permissions: [
      'dashboard.view_assigned',
      'data.enter_manual',
      'data.import_excel',
      'data.import_json',
      'data.edit_assigned',
      'data.approve',
      'data.view_history',
      'reports.view',
      'reports.export',
    ],
  },
  {
    slug: 'admin_two',
    name: 'Admin-2 (Hududiy tahlil)',
    description: "Mahallalar kesimida tahlil, taqqoslash, tasdiqlash/qaytarish va reyting boshqaruvi.",
    permissions: [
      'dashboard.view_territorial',
      'data.approve',
      'data.view_history',
      'reports.view',
      'reports.export',
    ],
  },
  {
    slug: 'mahalla',
    name: 'Mahalla operatori',
    description: "Faqat o'z mahallasining ko'rsatkichlarini kiritish, yuklash va tasdiqlashga yuborish.",
    permissions: [
      'dashboard.view_own_mahalla',
      'data.enter_manual',
      'data.import_excel',
      'data.import_json',
      'data.view_history',
      'reports.view',
      'reports.export',
    ],
  },
];
