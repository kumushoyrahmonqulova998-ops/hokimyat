import type Database from 'better-sqlite3';
import { getPeriodBounds, toTashkentParts, type PeriodType } from '../config.ts';
import type { AuthUserContext } from '../security.ts';
import { calcChangePercent, safePercent } from './metricsService.ts';

export interface ReportDirectionRow {
  directionId: number;
  directionName: string;
  directionSlug: string;
  startValue: number;
  endValue: number;
  delta: number;
  growthPercent: number;
  decreaseAmount: number;
  updatesCount: number;
}

export interface ReportMahallaRow {
  mahallaId: number;
  mahallaCode: string;
  mahallaName: string;
  sector: string;
  startValue: number;
  endValue: number;
  delta: number;
  growthPercent: number;
  updatesCount: number;
}

export function generatePeriodReport(
  db: Database.Database,
  user: AuthUserContext,
  options: {
    periodType: PeriodType;
    referenceDate?: string;
    directionId?: number | null;
    mahallaId?: number | null;
    saveSnapshot?: boolean;
  }
) {
  const effectiveMahallaId =
    user.roleSlug === 'mahalla' ? user.mahallaId : options.mahallaId ?? null;
  const effectiveDirectionId = options.directionId ?? null;

  const bounds = getPeriodBounds(options.periodType, options.referenceDate);

  const filterClauses: string[] = ["h.approval_status = 'approved'"];
  const filterParams: unknown[] = [];

  if (effectiveMahallaId) {
    filterClauses.push('h.mahalla_id = ?');
    filterParams.push(effectiveMahallaId);
  }
  if (effectiveDirectionId) {
    filterClauses.push('i.direction_id = ?');
    filterParams.push(effectiveDirectionId);
  } else if (user.roleSlug === 'admin_one' && user.assignedDirectionIds.length > 0) {
    const ph = user.assignedDirectionIds.map(() => '?').join(',');
    filterClauses.push(`i.direction_id IN (${ph})`);
    filterParams.push(...user.assignedDirectionIds);
  }

  const baseWhere = filterClauses.join(' AND ');

  // Records created INSIDE the period window
  const periodRows = db
    .prepare(
      `SELECT h.id, h.indicator_id, h.mahalla_id, h.old_value, h.new_value, h.difference, h.changed_at,
              i.code as indicator_code, i.name as indicator_name, i.unit, i.direction_id, i.is_negative_good,
              d.name as direction_name, d.slug as direction_slug, d.sort_order,
              m.code as mahalla_code, m.name as mahalla_name, m.sector
       FROM indicator_histories h
       JOIN indicators i ON i.id = h.indicator_id
       JOIN directions d ON d.id = i.direction_id
       JOIN mahallas m ON m.id = h.mahalla_id
       WHERE ${baseWhere}
         AND h.changed_at >= ? AND h.changed_at <= ?
       ORDER BY h.changed_at ASC, h.id ASC`
    )
    .all(...filterParams, bounds.currentStart, bounds.currentEnd) as Array<{
    id: number;
    indicator_id: number;
    mahalla_id: number;
    old_value: number;
    new_value: number;
    difference: number;
    changed_at: string;
    indicator_code: string;
    indicator_name: string;
    unit: string;
    direction_id: number;
    is_negative_good: number;
    direction_name: string;
    direction_slug: string;
    sort_order: number;
    mahalla_code: string;
    mahalla_name: string;
    sector: string;
  }>;

  // Previous period values for comparison
  const prevRows = db
    .prepare(
      `SELECT h.indicator_id, h.mahalla_id, h.new_value, i.direction_id, d.name as direction_name
       FROM (
         SELECT h.indicator_id, h.mahalla_id, MAX(h.id) as max_id
         FROM indicator_histories h
         JOIN indicators i ON i.id = h.indicator_id
         WHERE ${baseWhere}
           AND h.changed_at >= ? AND h.changed_at <= ?
         GROUP BY h.indicator_id, h.mahalla_id
       ) pick
       JOIN indicator_histories h ON h.id = pick.max_id
       JOIN indicators i ON i.id = h.indicator_id
       JOIN directions d ON d.id = i.direction_id`
    )
    .all(...filterParams, bounds.previousStart, bounds.previousEnd) as Array<{
    indicator_id: number;
    mahalla_id: number;
    new_value: number;
    direction_id: number;
    direction_name: string;
  }>;

  const hasData = periodRows.length > 0;

  if (!hasData) {
    return {
      hasData: false,
      periodType: options.periodType,
      periodLabel: bounds.label,
      previousLabel: bounds.previousLabel,
      periodStart: bounds.currentStart,
      periodEnd: bounds.currentEnd,
      generatedAt: toTashkentParts().iso,
      overview: {
        startValue: 0,
        endValue: 0,
        delta: 0,
        growthPercent: 0,
        decreaseAmount: 0,
        previousPeriodTotal: 0,
        executionPercent: 0,
        updatesCount: 0,
      },
      financial: {
        allocated: 0,
        spent: 0,
        remaining: 0,
        executionPercent: 0,
      },
      byDirection: [] as ReportDirectionRow[],
      byMahalla: [] as ReportMahallaRow[],
      topPerformers: [] as ReportMahallaRow[],
      laggingDirections: [] as ReportDirectionRow[],
      analyticalSummary:
        "Tanlangan hisobot davri bo'yicha tasdiqlangan tarixiy yozuvlar topilmadi. Ma'lumot mavjud bo'lmagan davr uchun qiymatlar 0 sifatida ko'rsatiladi.",
      recommendations: [
        "Tanlangan davr oralig'ida mahallalar kesimida ma'lumotlarni kiritish va tasdiqlashni yakunlang.",
      ],
    };
  }

  // Group per (indicator_id, mahalla_id) to get true start (first old_value or first new_value) and end (latest new_value)
  type PairEntry = {
    indicatorId: number;
    mahallaId: number;
    directionId: number;
    directionName: string;
    directionSlug: string;
    sortOrder: number;
    mahallaCode: string;
    mahallaName: string;
    sector: string;
    indicatorCode: string;
    startValue: number;
    endValue: number;
    updates: number;
  };

  const pairMap = new Map<string, PairEntry>();

  for (const r of periodRows) {
    const key = `${r.indicator_id}:${r.mahalla_id}`;
    const existing = pairMap.get(key);
    if (!existing) {
      // Look up baseline just before currentStart if old_value was recorded
      const startVal = r.old_value > 0 ? r.old_value : r.new_value;
      pairMap.set(key, {
        indicatorId: r.indicator_id,
        mahallaId: r.mahalla_id,
        directionId: r.direction_id,
        directionName: r.direction_name,
        directionSlug: r.direction_slug,
        sortOrder: r.sort_order,
        mahallaCode: r.mahalla_code,
        mahallaName: r.mahalla_name,
        sector: r.sector,
        indicatorCode: r.indicator_code,
        startValue: startVal,
        endValue: r.new_value,
        updates: 1,
      });
    } else {
      existing.endValue = r.new_value;
      existing.updates += 1;
    }
  }

  const pairs = Array.from(pairMap.values());
  const startTotal = pairs.reduce((s, p) => s + p.startValue, 0);
  const endTotal = pairs.reduce((s, p) => s + p.endValue, 0);
  const delta = Number((endTotal - startTotal).toFixed(2));
  const growthPercent = calcChangePercent(endTotal, startTotal);
  const decreaseAmount = delta < 0 ? Math.abs(delta) : 0;
  const prevPeriodTotal = prevRows.reduce((s, r) => s + r.new_value, 0);

  // Direction breakdown
  const dirMap = new Map<number, ReportDirectionRow & { sortOrder: number }>();
  for (const p of pairs) {
    const cur = dirMap.get(p.directionId) ?? {
      directionId: p.directionId,
      directionName: p.directionName,
      directionSlug: p.directionSlug,
      sortOrder: p.sortOrder,
      startValue: 0,
      endValue: 0,
      delta: 0,
      growthPercent: 0,
      decreaseAmount: 0,
      updatesCount: 0,
    };
    cur.startValue += p.startValue;
    cur.endValue += p.endValue;
    cur.updatesCount += p.updates;
    dirMap.set(p.directionId, cur);
  }

  const byDirection: ReportDirectionRow[] = Array.from(dirMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => {
      const dDelta = Number((d.endValue - d.startValue).toFixed(2));
      return {
        directionId: d.directionId,
        directionName: d.directionName,
        directionSlug: d.directionSlug,
        startValue: Number(d.startValue.toFixed(2)),
        endValue: Number(d.endValue.toFixed(2)),
        delta: dDelta,
        growthPercent: calcChangePercent(d.endValue, d.startValue),
        decreaseAmount: dDelta < 0 ? Math.abs(dDelta) : 0,
        updatesCount: d.updatesCount,
      };
    });

  // Mahalla breakdown
  const mahMap = new Map<number, ReportMahallaRow>();
  for (const p of pairs) {
    const cur = mahMap.get(p.mahallaId) ?? {
      mahallaId: p.mahallaId,
      mahallaCode: p.mahallaCode,
      mahallaName: p.mahallaName,
      sector: p.sector,
      startValue: 0,
      endValue: 0,
      delta: 0,
      growthPercent: 0,
      updatesCount: 0,
    };
    cur.startValue += p.startValue;
    cur.endValue += p.endValue;
    cur.updatesCount += p.updates;
    mahMap.set(p.mahallaId, cur);
  }

  const byMahalla: ReportMahallaRow[] = Array.from(mahMap.values())
    .map((m) => {
      const mDelta = Number((m.endValue - m.startValue).toFixed(2));
      return {
        ...m,
        startValue: Number(m.startValue.toFixed(2)),
        endValue: Number(m.endValue.toFixed(2)),
        delta: mDelta,
        growthPercent: calcChangePercent(m.endValue, m.startValue),
      };
    })
    .sort((a, b) => b.growthPercent - a.growthPercent);

  const topPerformers = byMahalla.slice(0, 5);
  const laggingDirections = [...byDirection]
    .sort((a, b) => a.growthPercent - b.growthPercent)
    .slice(0, 4);

  // Financial figures inside period
  const sumCodeEnd = (code: string) =>
    pairs.filter((p) => p.indicatorCode === code).reduce((s, p) => s + p.endValue, 0);

  const allocated = Number(sumCodeEnd('mab_ajratilgan').toFixed(2));
  const spent = Number(sumCodeEnd('mab_sarflangan').toFixed(2));
  const remaining = Number(Math.max(0, allocated - spent).toFixed(2));
  const finPct = safePercent(spent, allocated, true);

  // Employment execution inside period
  const ishsiz = sumCodeEnd('bandlik_ishsizlar');
  const band = sumCodeEnd('bandlik_ishga_joy') + sumCodeEnd('bandlik_ozini_band');
  const execPct = safePercent(band, ishsiz, true);

  const topDir = [...byDirection].sort((a, b) => b.growthPercent - a.growthPercent)[0];
  const lowDir = laggingDirections[0];

  const analyticalSummary =
    `${bounds.label} davrida jami ${periodRows.length} ta tasdiqlangan tarixiy yozuv asosida hisobot shakllantirildi. ` +
    `Ko'rsatkichlar yig'indisi ${startTotal.toLocaleString('uz-UZ')} dan ${endTotal.toLocaleString('uz-UZ')} ga (${delta >= 0 ? '+' : ''}${growthPercent}%) o'zgardi. ` +
    (topDir
      ? `Eng yuqori o'sish "${topDir.directionName}" yo'nalishida (${topDir.growthPercent >= 0 ? '+' : ''}${topDir.growthPercent}%) qayd etildi. `
      : '') +
    (allocated > 0
      ? `Moliyaviy mablag'lar o'zlashtirilishi ${finPct}% (${spent.toLocaleString('uz-UZ')} / ${allocated.toLocaleString('uz-UZ')} mln so'm) ni tashkil etdi.`
      : '');

  const recommendations: string[] = [];
  if (lowDir && lowDir.growthPercent < 3) {
    recommendations.push(
      `"${lowDir.directionName}" yo'nalishida ijro sur'atini oshirish va mahallalar bo'yicha manzilli nazoratni kuchaytirish.`
    );
  }
  if (execPct > 0 && execPct < 85) {
    recommendations.push(
      `Bandlik ijrosi ${execPct}% ni tashkil etmoqda — ishsiz fuqarolarni kasb-hunarga o'qitish va o'zini o'zi band qilish dasturlarini kengaytirish.`
    );
  }
  if (allocated > 0 && finPct < 80) {
    recommendations.push(
      `Ajratilgan mablag'larning ${remaining.toLocaleString('uz-UZ')} mln so'm qismi o'zlashtirilishi bo'yicha moliyaviy jadvalni tezlashtirish.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Barcha asosiy yo'nalishlarda o'sish sur'ati barqaror; tasdiqlash intizomini va haftalik monitoringni davom ettirish."
    );
  }

  const reportPayload = {
    hasData: true,
    periodType: options.periodType,
    periodLabel: bounds.label,
    previousLabel: bounds.previousLabel,
    periodStart: bounds.currentStart,
    periodEnd: bounds.currentEnd,
    generatedAt: toTashkentParts().iso,
    overview: {
      startValue: Number(startTotal.toFixed(2)),
      endValue: Number(endTotal.toFixed(2)),
      delta,
      growthPercent,
      decreaseAmount: Number(decreaseAmount.toFixed(2)),
      previousPeriodTotal: Number(prevPeriodTotal.toFixed(2)),
      executionPercent: execPct,
      updatesCount: periodRows.length,
    },
    financial: {
      allocated,
      spent,
      remaining,
      executionPercent: finPct,
    },
    byDirection,
    byMahalla,
    topPerformers,
    laggingDirections,
    analyticalSummary,
    recommendations,
  };

  if (options.saveSnapshot) {
    db.prepare(
      `INSERT INTO report_snapshots
       (period_type, period_key, period_start, period_end, direction_id, mahalla_id, summary_json, generated_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      options.periodType,
      bounds.label,
      bounds.currentStart,
      bounds.currentEnd,
      effectiveDirectionId,
      effectiveMahallaId,
      JSON.stringify(reportPayload),
      user.id,
      toTashkentParts().iso
    );
  }

  return reportPayload;
}
