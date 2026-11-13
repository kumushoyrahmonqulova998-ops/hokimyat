import type Database from 'better-sqlite3';
import { getPeriodBounds, toTashkentParts, type PeriodType } from '../config.ts';
import {
  assertUserCanAccessDirection,
  assertUserCanAccessMahalla,
  createNotification,
  sanitizeText,
  writeAuditLog,
  type AuthUserContext,
} from '../security.ts';

export interface KpiCardData {
  key: string;
  title: string;
  unit: string;
  currentValue: number;
  pendingDelta: number;
  previousValue: number;
  changePercent: number;
  lastUpdatedAt: string | null;
  sparkline: Array<{ label: string; value: number }>;
}

export function safePercent(numerator: number, denominator: number, cap100 = false): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const raw = (numerator / denominator) * 100;
  const clamped = cap100 ? Math.min(100, Math.max(0, raw)) : raw;
  return Number(clamped.toFixed(1));
}

export function calcChangePercent(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous <= 0) {
    return 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function recordIndicatorUpdate(
  db: Database.Database,
  params: {
    indicatorId: number;
    mahallaId: number;
    newValue: number;
    user: AuthUserContext;
    source: 'manual' | 'excel' | 'csv' | 'json' | 'correction';
    comment: string;
    importId?: number | null;
    autoApprove?: boolean;
    ipAddress?: string;
  }
): {
  historyId: number;
  oldValue: number;
  newValue: number;
  difference: number;
  approvalStatus: 'approved' | 'submitted';
} {
  if (!Number.isFinite(params.newValue) || params.newValue < 0) {
    throw new Error("Salbiy yoki noto'g'ri qiymat kiritish mumkin emas.");
  }

  const indicator = db
    .prepare(`SELECT id, code, name, direction_id, value_type FROM indicators WHERE id = ?`)
    .get(params.indicatorId) as
    | { id: number; code: string; name: string; direction_id: number; value_type: string }
    | undefined;
  if (!indicator) {
    throw new Error("Ko'rsatkich topilmadi.");
  }

  const mahalla = db
    .prepare(`SELECT id, name, is_active FROM mahallas WHERE id = ?`)
    .get(params.mahallaId) as { id: number; name: string; is_active: number } | undefined;
  if (!mahalla || !mahalla.is_active) {
    throw new Error('Faol mahalla topilmadi.');
  }

  if (!assertUserCanAccessMahalla(params.user, params.mahallaId)) {
    throw new Error("Siz faqat o'z mahallangiz ma'lumotlarini yangilashingiz mumkin.");
  }
  if (!assertUserCanAccessDirection(params.user, indicator.direction_id)) {
    throw new Error("Sizga ushbu yo'nalish bo'yicha ruxsat berilmagan.");
  }

  const normalizedValue =
    indicator.value_type === 'integer'
      ? Math.round(params.newValue)
      : Number(params.newValue.toFixed(2));

  const nowIso = toTashkentParts().iso;
  const cleanComment = sanitizeText(params.comment, 400) || "Qiymat yangilandi";

  // Determine whether submission goes straight to approved or awaits review
  const shouldAutoApprove =
    params.autoApprove !== undefined
      ? params.autoApprove
      : params.user.roleSlug === 'super_admin' || params.user.roleSlug === 'admin_one';

  const status: 'approved' | 'submitted' = shouldAutoApprove ? 'approved' : 'submitted';

  const tx = db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT id, current_value, previous_value, approved_value, pending_value, approval_status
         FROM indicator_values WHERE indicator_id = ? AND mahalla_id = ?`
      )
      .get(params.indicatorId, params.mahallaId) as
      | {
          id: number;
          current_value: number;
          previous_value: number;
          approved_value: number;
          pending_value: number | null;
          approval_status: string;
        }
      | undefined;

    const oldValue = existing ? existing.approved_value : 0;
    const difference = Number((normalizedValue - oldValue).toFixed(2));
    const percentChange = oldValue > 0 ? Number(((difference / oldValue) * 100).toFixed(2)) : 0;

    // 1. Always append immutable history record
    const histRes = db
      .prepare(
        `INSERT INTO indicator_histories
         (indicator_id, mahalla_id, old_value, new_value, difference, percent_change, changed_by, changed_at, source, import_id, approval_status, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.indicatorId,
        params.mahallaId,
        oldValue,
        normalizedValue,
        difference,
        percentChange,
        params.user.id,
        nowIso,
        params.source,
        params.importId ?? null,
        status,
        cleanComment
      );

    const historyId = Number(histRes.lastInsertRowid);

    // 2. Update current snapshot table without ever erasing official approved_value when pending
    if (!existing) {
      if (status === 'approved') {
        db.prepare(
          `INSERT INTO indicator_values
           (indicator_id, mahalla_id, current_value, previous_value, approved_value, pending_value, approval_status, last_updated_by, last_updated_at, last_approved_by, last_approved_at)
           VALUES (?, ?, ?, 0, ?, NULL, 'approved', ?, ?, ?, ?)`
        ).run(
          params.indicatorId,
          params.mahallaId,
          normalizedValue,
          normalizedValue,
          params.user.id,
          nowIso,
          params.user.id,
          nowIso
        );
      } else {
        db.prepare(
          `INSERT INTO indicator_values
           (indicator_id, mahalla_id, current_value, previous_value, approved_value, pending_value, approval_status, last_updated_by, last_updated_at)
           VALUES (?, ?, 0, 0, 0, ?, 'submitted', ?, ?)`
        ).run(params.indicatorId, params.mahallaId, normalizedValue, params.user.id, nowIso);
      }
    } else if (status === 'approved') {
      db.prepare(
        `UPDATE indicator_values
         SET previous_value = approved_value,
             current_value = ?,
             approved_value = ?,
             pending_value = NULL,
             approval_status = 'approved',
             last_updated_by = ?,
             last_updated_at = ?,
             last_approved_by = ?,
             last_approved_at = ?
         WHERE id = ?`
      ).run(
        normalizedValue,
        normalizedValue,
        params.user.id,
        nowIso,
        params.user.id,
        nowIso,
        existing.id
      );
    } else {
      db.prepare(
        `UPDATE indicator_values
         SET pending_value = ?,
             approval_status = 'submitted',
             last_updated_by = ?,
             last_updated_at = ?
         WHERE id = ?`
      ).run(normalizedValue, params.user.id, nowIso, existing.id);
    }

    // 3. Create approval queue item when submitted by Mahalla or awaiting verification
    if (status === 'submitted') {
      db.prepare(
        `INSERT INTO approvals
         (history_id, indicator_id, mahalla_id, submitted_by, status, decision_comment, created_at)
         VALUES (?, ?, ?, ?, 'submitted', ?, ?)`
      ).run(historyId, params.indicatorId, params.mahallaId, params.user.id, cleanComment, nowIso);

      createNotification(db, {
        roleSlug: 'admin_two',
        title: "Yangi ma'lumot tekshirishga yuborildi",
        message: `${mahalla.name}: "${indicator.name}" (${oldValue} → ${normalizedValue})`,
        type: 'info',
        link: '/approvals',
      });
    }

    writeAuditLog(db, {
      userId: params.user.id,
      username: params.user.username,
      roleSlug: params.user.roleSlug,
      action: `indicator_${params.source}_update`,
      entityType: 'indicator_value',
      entityId: `${params.indicatorId}:${params.mahallaId}`,
      ipAddress: params.ipAddress,
      severity: 'info',
      details: {
        indicatorCode: indicator.code,
        mahallaId: params.mahallaId,
        oldValue,
        newValue: normalizedValue,
        status,
        historyId,
      },
    });

    return {
      historyId,
      oldValue,
      newValue: normalizedValue,
      difference,
      approvalStatus: status,
    };
  });

  return tx();
}

export function reviewApprovalSubmission(
  db: Database.Database,
  params: {
    approvalId: number;
    decision: 'approved' | 'returned' | 'reviewing';
    comment: string;
    reviewer: AuthUserContext;
    ipAddress?: string;
  }
): { approvalId: number; status: string } {
  const approval = db
    .prepare(
      `SELECT a.*, h.new_value, h.old_value, i.direction_id, i.name as indicator_name, m.name as mahalla_name
       FROM approvals a
       JOIN indicator_histories h ON h.id = a.history_id
       JOIN indicators i ON i.id = a.indicator_id
       JOIN mahallas m ON m.id = a.mahalla_id
       WHERE a.id = ?`
    )
    .get(params.approvalId) as
    | {
        id: number;
        history_id: number;
        indicator_id: number;
        mahalla_id: number;
        submitted_by: number | null;
        status: string;
        new_value: number;
        old_value: number;
        direction_id: number;
        indicator_name: string;
        mahalla_name: string;
      }
    | undefined;

  if (!approval) {
    throw new Error('Tasdiqlash arizasi topilmadi.');
  }

  if (approval.status === 'approved' || approval.status === 'returned') {
    throw new Error("Ushbu ariza bo'yicha yakuniy qaror allaqachon qabul qilingan.");
  }

  if (!assertUserCanAccessDirection(params.reviewer, approval.direction_id)) {
    throw new Error("Ushbu yo'nalish ma'lumotlarini tasdiqlash huquqingiz yo'q.");
  }

  const cleanComment = sanitizeText(params.comment, 400);
  if (params.decision === 'returned' && cleanComment.length < 3) {
    throw new Error('Qaytarish sababini izoh maydonida kiriting.');
  }

  const nowIso = toTashkentParts().iso;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE approvals
       SET status = ?, reviewed_by = ?, reviewed_at = ?, decision_comment = ?
       WHERE id = ?`
    ).run(params.decision, params.reviewer.id, nowIso, cleanComment, approval.id);

    if (params.decision === 'approved') {
      db.prepare(
        `UPDATE indicator_values
         SET previous_value = approved_value,
             current_value = ?,
             approved_value = ?,
             pending_value = NULL,
             approval_status = 'approved',
             last_approved_by = ?,
             last_approved_at = ?
         WHERE indicator_id = ? AND mahalla_id = ?`
      ).run(
        approval.new_value,
        approval.new_value,
        params.reviewer.id,
        nowIso,
        approval.indicator_id,
        approval.mahalla_id
      );

      db.prepare(`UPDATE indicator_histories SET approval_status = 'approved' WHERE id = ?`).run(
        approval.history_id
      );

      if (approval.submitted_by) {
        createNotification(db, {
          userId: approval.submitted_by,
          title: "Ma'lumot tasdiqlandi",
          message: `${approval.mahalla_name} — ${approval.indicator_name}: ${approval.new_value} rasmiy statistikaga kiritildi.`,
          type: 'success',
          link: '/approvals',
        });
      }
    } else if (params.decision === 'returned') {
      db.prepare(
        `UPDATE indicator_values
         SET pending_value = NULL,
             approval_status = 'returned'
         WHERE indicator_id = ? AND mahalla_id = ?`
      ).run(approval.indicator_id, approval.mahalla_id);

      db.prepare(`UPDATE indicator_histories SET approval_status = 'returned' WHERE id = ?`).run(
        approval.history_id
      );

      if (approval.submitted_by) {
        createNotification(db, {
          userId: approval.submitted_by,
          title: "Ma'lumot qaytarildi",
          message: `${approval.mahalla_name} — ${approval.indicator_name} qaytarildi. Sabab: ${cleanComment}`,
          type: 'warning',
          link: '/approvals',
        });
      }
    } else {
      db.prepare(
        `UPDATE indicator_values SET approval_status = 'reviewing' WHERE indicator_id = ? AND mahalla_id = ?`
      ).run(approval.indicator_id, approval.mahalla_id);
      db.prepare(`UPDATE indicator_histories SET approval_status = 'reviewing' WHERE id = ?`).run(
        approval.history_id
      );
    }

    writeAuditLog(db, {
      userId: params.reviewer.id,
      username: params.reviewer.username,
      roleSlug: params.reviewer.roleSlug,
      action: `approval_${params.decision}`,
      entityType: 'approval',
      entityId: approval.id,
      ipAddress: params.ipAddress,
      severity: 'info',
      details: {
        indicatorId: approval.indicator_id,
        mahallaId: approval.mahalla_id,
        comment: cleanComment,
      },
    });
  });

  tx();
  return { approvalId: approval.id, status: params.decision };
}

export function getDashboardSummary(
  db: Database.Database,
  user: AuthUserContext,
  periodType: PeriodType = 'monthly',
  mahallaFilterId?: number | null
) {
  const effectiveMahallaId =
    user.roleSlug === 'mahalla' ? user.mahallaId : mahallaFilterId ?? null;

  const bounds = getPeriodBounds(periodType);

  const sumApprovedByCodes = (codes: string[]): { current: number; previous: number; pendingDelta: number; lastUpdatedAt: string | null } => {
    const placeholders = codes.map(() => '?').join(',');
    const params: unknown[] = [...codes];
    let mahallaClause = '';
    if (effectiveMahallaId) {
      mahallaClause = ' AND iv.mahalla_id = ?';
      params.push(effectiveMahallaId);
    }

    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(iv.approved_value), 0) as current_total,
           COALESCE(SUM(iv.previous_value), 0) as prev_total,
           COALESCE(SUM(CASE WHEN iv.pending_value IS NOT NULL THEN (iv.pending_value - iv.approved_value) ELSE 0 END), 0) as pending_delta,
           MAX(iv.last_updated_at) as last_updated_at
         FROM indicator_values iv
         JOIN indicators i ON i.id = iv.indicator_id
         WHERE i.code IN (${placeholders})${mahallaClause}`
      )
      .get(...params) as {
      current_total: number;
      prev_total: number;
      pending_delta: number;
      last_updated_at: string | null;
    };

    // Also inspect period-specific previous baseline from history if available
    const prevParams: unknown[] = [...codes, bounds.previousEnd];
    let prevMahallaClause = '';
    if (effectiveMahallaId) {
      prevMahallaClause = ' AND h.mahalla_id = ?';
      prevParams.push(effectiveMahallaId);
    }

    const histPrev = db
      .prepare(
        `SELECT COALESCE(SUM(latest.new_value), 0) as total
         FROM (
           SELECT h.indicator_id, h.mahalla_id, h.new_value,
                  ROW_NUMBER() OVER (PARTITION BY h.indicator_id, h.mahalla_id ORDER BY h.changed_at DESC, h.id DESC) as rn
           FROM indicator_histories h
           JOIN indicators i ON i.id = h.indicator_id
           WHERE i.code IN (${placeholders})
             AND h.approval_status = 'approved'
             AND h.changed_at <= ?${prevMahallaClause}
         ) latest
         WHERE latest.rn = 1`
      )
      .get(...prevParams) as { total: number } | undefined;

    const prevValue = histPrev && histPrev.total > 0 ? histPrev.total : row.prev_total;

    return {
      current: Number(row.current_total.toFixed(2)),
      previous: Number(prevValue.toFixed(2)),
      pendingDelta: Number(row.pending_delta.toFixed(2)),
      lastUpdatedAt: row.last_updated_at,
    };
  };

  const buildSparkline = (codes: string[]) => {
    const placeholders = codes.map(() => '?').join(',');
    const params: unknown[] = [...codes];
    let mahallaClause = '';
    if (effectiveMahallaId) {
      mahallaClause = ' AND h.mahalla_id = ?';
      params.push(effectiveMahallaId);
    }

    const rows = db
      .prepare(
        `SELECT substr(h.changed_at, 1, 10) as day_key,
                SUM(h.new_value) as total_val
         FROM (
           SELECT h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10) as d, MAX(h.id) as max_id
           FROM indicator_histories h
           JOIN indicators i ON i.id = h.indicator_id
           WHERE i.code IN (${placeholders}) AND h.approval_status = 'approved'${mahallaClause}
           GROUP BY h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10)
         ) pick
         JOIN indicator_histories h ON h.id = pick.max_id
         GROUP BY day_key
         ORDER BY day_key ASC
         LIMIT 12`
      )
      .all(...params) as Array<{ day_key: string; total_val: number }>;

    return rows.map((r) => ({
      label: r.day_key.split('-').reverse().slice(0, 2).join('.'),
      value: Number(r.total_val.toFixed(1)),
    }));
  };

  const aholi = sumApprovedByCodes(['demo_aholi']);
  const oilalar = sumApprovedByCodes(['demo_oilalar']);
  const reyestr = sumApprovedByCodes(['reyestr_oilalar']);
  const bandlar = sumApprovedByCodes(['bandlik_ishga_joy', 'bandlik_ozini_band']);
  const ishsizlar = sumApprovedByCodes(['bandlik_ishsizlar']);
  const ehtiyojlar = sumApprovedByCodes([
    'bandlik_ishsizlar',
    'tadbirkor_ehtiyoj',
    'subs_ehtiyoj',
    'mtt_ehtiyoj',
    'tib_bemorlar',
    'uy_ehtiyoj',
    'moddiy_muhtoj',
    'kom_muhtoj',
  ]);
  const yordam = sumApprovedByCodes([
    'subs_yordam_olgan',
    'tib_davolangan',
    'moddiy_olgan',
    'kom_yordam',
    'bandlik_ishga_joy',
  ]);
  const mablag = sumApprovedByCodes(['mab_ajratilgan']);

  const bandlikPctCurrent = safePercent(bandlar.current, ishsizlar.current, true);
  const bandlikPctPrev = safePercent(bandlar.previous, ishsizlar.previous, true);

  const kpis: KpiCardData[] = [
    {
      key: 'aholi',
      title: 'Doimiy aholi soni',
      unit: 'nafar',
      currentValue: aholi.current,
      pendingDelta: aholi.pendingDelta,
      previousValue: aholi.previous,
      changePercent: calcChangePercent(aholi.current, aholi.previous),
      lastUpdatedAt: aholi.lastUpdatedAt,
      sparkline: buildSparkline(['demo_aholi']),
    },
    {
      key: 'oilalar',
      title: 'Oilalar soni',
      unit: 'ta',
      currentValue: oilalar.current,
      pendingDelta: oilalar.pendingDelta,
      previousValue: oilalar.previous,
      changePercent: calcChangePercent(oilalar.current, oilalar.previous),
      lastUpdatedAt: oilalar.lastUpdatedAt,
      sparkline: buildSparkline(['demo_oilalar']),
    },
    {
      key: 'reyestr',
      title: 'Ijtimoiy reyestrdagi oilalar',
      unit: 'ta',
      currentValue: reyestr.current,
      pendingDelta: reyestr.pendingDelta,
      previousValue: reyestr.previous,
      changePercent: calcChangePercent(reyestr.current, reyestr.previous),
      lastUpdatedAt: reyestr.lastUpdatedAt,
      sparkline: buildSparkline(['reyestr_oilalar']),
    },
    {
      key: 'bandlar',
      title: "Bandligi ta'minlangan fuqarolar",
      unit: 'nafar',
      currentValue: bandlar.current,
      pendingDelta: bandlar.pendingDelta,
      previousValue: bandlar.previous,
      changePercent: calcChangePercent(bandlar.current, bandlar.previous),
      lastUpdatedAt: bandlar.lastUpdatedAt,
      sparkline: buildSparkline(['bandlik_ishga_joy', 'bandlik_ozini_band']),
    },
    {
      key: 'bandlik_ijro',
      title: 'Bandlik ijrosi foizi',
      unit: '%',
      currentValue: bandlikPctCurrent,
      pendingDelta: 0,
      previousValue: bandlikPctPrev,
      changePercent: Number((bandlikPctCurrent - bandlikPctPrev).toFixed(1)),
      lastUpdatedAt: bandlar.lastUpdatedAt,
      sparkline: buildSparkline(['bandlik_ishga_joy']),
    },
    {
      key: 'ehtiyojlar',
      title: 'Umumiy aniqlangan ehtiyojlar',
      unit: 'ta',
      currentValue: ehtiyojlar.current,
      pendingDelta: ehtiyojlar.pendingDelta,
      previousValue: ehtiyojlar.previous,
      changePercent: calcChangePercent(ehtiyojlar.current, ehtiyojlar.previous),
      lastUpdatedAt: ehtiyojlar.lastUpdatedAt,
      sparkline: buildSparkline(['bandlik_ishsizlar', 'subs_ehtiyoj', 'tib_bemorlar']),
    },
    {
      key: 'yordam',
      title: 'Yordam olganlar',
      unit: 'nafar',
      currentValue: yordam.current,
      pendingDelta: yordam.pendingDelta,
      previousValue: yordam.previous,
      changePercent: calcChangePercent(yordam.current, yordam.previous),
      lastUpdatedAt: yordam.lastUpdatedAt,
      sparkline: buildSparkline(['subs_yordam_olgan', 'tib_davolangan', 'moddiy_olgan']),
    },
    {
      key: 'mablag',
      title: "Ajratilgan mablag'lar",
      unit: "mln so'm",
      currentValue: mablag.current,
      pendingDelta: mablag.pendingDelta,
      previousValue: mablag.previous,
      changePercent: calcChangePercent(mablag.current, mablag.previous),
      lastUpdatedAt: mablag.lastUpdatedAt,
      sparkline: buildSparkline(['mab_ajratilgan']),
    },
  ];

  // Daily live updates panel
  const todayParts = toTashkentParts();
  const todayDatePrefix = todayParts.dateStr;

  const mahallaFilterSql = effectiveMahallaId ? ' AND h.mahalla_id = ?' : '';
  const mahallaFilterParams = effectiveMahallaId ? [effectiveMahallaId] : [];

  const latestRow = db
    .prepare(
      `SELECT MAX(h.changed_at) as last_ts FROM indicator_histories h WHERE 1=1${mahallaFilterSql}`
    )
    .get(...mahallaFilterParams) as { last_ts: string | null };

  const effectiveDay =
    latestRow.last_ts && latestRow.last_ts.startsWith(todayDatePrefix)
      ? todayDatePrefix
      : latestRow.last_ts
        ? latestRow.last_ts.slice(0, 10)
        : todayDatePrefix;

  const dailyStats = db
    .prepare(
      `SELECT
         COUNT(DISTINCT i.direction_id) as directions_updated,
         COUNT(DISTINCT h.mahalla_id) as mahallas_updated,
         COALESCE(SUM(h.difference), 0) as total_delta
       FROM indicator_histories h
       JOIN indicators i ON i.id = h.indicator_id
       WHERE substr(h.changed_at, 1, 10) = ?${mahallaFilterSql}`
    )
    .get(effectiveDay, ...mahallaFilterParams) as {
    directions_updated: number;
    mahallas_updated: number;
    total_delta: number;
  };

  const pendingApprovalsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM approvals a WHERE a.status IN ('submitted', 'reviewing')${
          effectiveMahallaId ? ' AND a.mahalla_id = ?' : ''
        }`
      )
      .get(...mahallaFilterParams) as { cnt: number }
  ).cnt;

  const dailyActivity = db
    .prepare(
      `SELECT h.id, h.old_value, h.new_value, h.difference, h.changed_at, h.source, h.approval_status, h.comment,
              i.name as indicator_name, i.unit,
              d.name as direction_name, d.slug as direction_slug,
              m.name as mahalla_name,
              COALESCE(u.full_name, 'Tizim') as changed_by_name
       FROM indicator_histories h
       JOIN indicators i ON i.id = h.indicator_id
       JOIN directions d ON d.id = i.direction_id
       JOIN mahallas m ON m.id = h.mahalla_id
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE 1=1${mahallaFilterSql}
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT 15`
    )
    .all(...mahallaFilterParams);

  // Charts data across all requested dimensions (Section 17)
  const charts = buildDashboardCharts(db, effectiveMahallaId);

  // Directions summary
  const directionsSummary = db
    .prepare(
      `SELECT d.id, d.sort_order, d.slug, d.name, d.short_name, d.description, d.icon,
              COUNT(DISTINCT i.id) as indicator_count,
              COALESCE(SUM(iv.approved_value), 0) as approved_sum,
              SUM(CASE WHEN iv.approval_status IN ('submitted','reviewing') THEN 1 ELSE 0 END) as pending_count,
              MAX(iv.last_updated_at) as last_updated_at
       FROM directions d
       LEFT JOIN indicators i ON i.direction_id = d.id
       LEFT JOIN indicator_values iv ON iv.indicator_id = i.id ${
         effectiveMahallaId ? 'AND iv.mahalla_id = ?' : ''
       }
       GROUP BY d.id
       ORDER BY d.sort_order ASC`
    )
    .all(...(effectiveMahallaId ? [effectiveMahallaId] : [])) as Array<{
    id: number;
    sort_order: number;
    slug: string;
    name: string;
    short_name: string;
    description: string;
    icon: string;
    indicator_count: number;
    approved_sum: number;
    pending_count: number;
    last_updated_at: string | null;
  }>;

  const filteredDirections =
    user.roleSlug === 'admin_one'
      ? directionsSummary.filter((d) => user.assignedDirectionIds.includes(d.id))
      : directionsSummary;

  const lastFormatted = latestRow.last_ts
    ? (() => {
        const p = toTashkentParts(latestRow.last_ts);
        return `${p.displayDate} — ${p.displayTime}`;
      })()
    : `${todayParts.displayDate} — ${todayParts.displayTime}`;

  return {
    periodType,
    periodLabel: bounds.label,
    kpis,
    liveUpdates: {
      lastUpdatedDisplay: lastFormatted,
      activeDate: effectiveDay,
      directionsUpdated: dailyStats.directions_updated,
      mahallasUpdated: dailyStats.mahallas_updated,
      pendingApprovals: pendingApprovalsCount,
      totalDelta: Number(dailyStats.total_delta.toFixed(1)),
    },
    dailyActivity,
    charts,
    directions: filteredDirections,
  };
}

function buildDashboardCharts(db: Database.Database, mahallaId: number | null) {
  const mahallaClause = mahallaId ? ' AND h.mahalla_id = ?' : '';
  const mParams = mahallaId ? [mahallaId] : [];

  const getSeriesForCodes = (codes: string[]) => {
    const placeholders = codes.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT substr(h.changed_at, 1, 10) as day_key, i.code, SUM(h.new_value) as total
         FROM (
           SELECT h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10) as d, MAX(h.id) as max_id
           FROM indicator_histories h
           JOIN indicators i ON i.id = h.indicator_id
           WHERE i.code IN (${placeholders}) AND h.approval_status = 'approved'${mahallaClause}
           GROUP BY h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10)
         ) pick
         JOIN indicator_histories h ON h.id = pick.max_id
         JOIN indicators i ON i.id = h.indicator_id
         GROUP BY day_key, i.code
         ORDER BY day_key ASC`
      )
      .all(...codes, ...mParams) as Array<{ day_key: string; code: string; total: number }>;

    const dates = Array.from(new Set(rows.map((r) => r.day_key))).sort();
    const byCode: Record<string, number[]> = {};
    for (const c of codes) {
      byCode[c] = dates.map((d) => {
        const hit = rows.find((r) => r.day_key === d && r.code === c);
        return hit ? Number(hit.total.toFixed(1)) : 0;
      });
    }
    return {
      labels: dates.map((d) => d.split('-').reverse().join('.')),
      series: byCode,
    };
  };

  // Mahalla comparison (Bandlik + Subsidiya + Reyestr)
  const mahallaComp = db
    .prepare(
      `SELECT m.id, m.name, m.sector,
              COALESCE(SUM(CASE WHEN i.code = 'demo_aholi' THEN iv.approved_value END), 0) as aholi,
              COALESCE(SUM(CASE WHEN i.code IN ('bandlik_ishga_joy','bandlik_ozini_band') THEN iv.approved_value END), 0) as bandlar,
              COALESCE(SUM(CASE WHEN i.code = 'bandlik_ishsizlar' THEN iv.approved_value END), 0) as ishsizlar,
              COALESCE(SUM(CASE WHEN i.code = 'reyestr_oilalar' THEN iv.approved_value END), 0) as reyestr,
              COALESCE(SUM(CASE WHEN i.code = 'mab_ajratilgan' THEN iv.approved_value END), 0) as mab_ajratilgan,
              COALESCE(SUM(CASE WHEN i.code = 'mab_sarflangan' THEN iv.approved_value END), 0) as mab_sarflangan
       FROM mahallas m
       LEFT JOIN indicator_values iv ON iv.mahalla_id = m.id
       LEFT JOIN indicators i ON i.id = iv.indicator_id
       WHERE m.is_active = 1 ${mahallaId ? 'AND m.id = ?' : ''}
       GROUP BY m.id
       ORDER BY m.id ASC`
    )
    .all(...mParams) as Array<{
    id: number;
    name: string;
    sector: string;
    aholi: number;
    bandlar: number;
    ishsizlar: number;
    reyestr: number;
    mab_ajratilgan: number;
    mab_sarflangan: number;
  }>;

  return {
    populationFamilies: getSeriesForCodes(['demo_aholi', 'demo_oilalar']),
    socialRegistry: getSeriesForCodes(['reyestr_oilalar', 'reyestr_kambagal', 'reyestr_davlat_taminot']),
    employment: getSeriesForCodes(['bandlik_ishsizlar', 'bandlik_ishga_joy', 'bandlik_ozini_band']),
    subsidiesMedicalEducation: getSeriesForCodes(['subs_ajratilgan', 'mtt_qamralgan', 'tib_davolangan']),
    funds: getSeriesForCodes(['mab_ajratilgan', 'mab_sarflangan', 'mab_qolgan']),
    mahallaComparison: mahallaComp.map((m) => ({
      ...m,
      employmentPercent: safePercent(m.bandlar, m.ishsizlar, true),
      fundPercent: safePercent(m.mab_sarflangan, m.mab_ajratilgan, true),
    })),
  };
}

export function getDirectionDetail(
  db: Database.Database,
  user: AuthUserContext,
  slug: string,
  search = '',
  sector = ''
) {
  const direction = db
    .prepare(`SELECT * FROM directions WHERE slug = ?`)
    .get(slug) as
    | { id: number; sort_order: number; slug: string; name: string; short_name: string; description: string; icon: string }
    | undefined;
  if (!direction) {
    throw new Error("Yo'nalish topilmadi.");
  }
  if (!assertUserCanAccessDirection(user, direction.id)) {
    throw new Error("Sizga ushbu yo'nalishni ko'rishga ruxsat berilmagan.");
  }

  const indicators = db
    .prepare(`SELECT * FROM indicators WHERE direction_id = ? ORDER BY sort_order ASC`)
    .all(direction.id) as Array<{
    id: number;
    direction_id: number;
    code: string;
    name: string;
    unit: string;
    value_type: string;
    is_target_metric: number;
    is_negative_good: number;
    sort_order: number;
  }>;

  const isMahallaUser = user.roleSlug === 'mahalla';
  const filterParams: unknown[] = [direction.id];
  let mahallaWhere = '';
  if (isMahallaUser && user.mahallaId) {
    mahallaWhere += ' AND m.id = ?';
    filterParams.push(user.mahallaId);
  }
  if (sector) {
    mahallaWhere += ' AND m.sector = ?';
    filterParams.push(sector);
  }
  if (search) {
    mahallaWhere += ' AND (m.name LIKE ? OR i.name LIKE ?)';
    filterParams.push(`%${search}%`, `%${search}%`);
  }

  const rows = db
    .prepare(
      `SELECT iv.id, iv.indicator_id, iv.mahalla_id, iv.current_value, iv.previous_value, iv.approved_value,
              iv.pending_value, iv.approval_status, iv.last_updated_at,
              i.code as indicator_code, i.name as indicator_name, i.unit, i.value_type,
              m.code as mahalla_code, m.name as mahalla_name, m.sector
       FROM indicator_values iv
       JOIN indicators i ON i.id = iv.indicator_id
       JOIN mahallas m ON m.id = iv.mahalla_id
       WHERE i.direction_id = ?${mahallaWhere}
       ORDER BY m.id ASC, i.sort_order ASC`
    )
    .all(...filterParams) as Array<{
    id: number;
    indicator_id: number;
    mahalla_id: number;
    current_value: number;
    previous_value: number;
    approved_value: number;
    pending_value: number | null;
    approval_status: string;
    last_updated_at: string;
    indicator_code: string;
    indicator_name: string;
    unit: string;
    value_type: string;
    mahalla_code: string;
    mahalla_name: string;
    sector: string;
  }>;

  const indicatorTotals = indicators.map((ind) => {
    const indRows = rows.filter((r) => r.indicator_id === ind.id);
    const totalApproved = indRows.reduce((s, r) => s + r.approved_value, 0);
    const totalPrev = indRows.reduce((s, r) => s + r.previous_value, 0);
    const pendingCount = indRows.filter((r) => r.pending_value !== null).length;
    return {
      ...ind,
      totalApproved: Number(totalApproved.toFixed(2)),
      totalPrevious: Number(totalPrev.toFixed(2)),
      changePercent: calcChangePercent(totalApproved, totalPrev),
      pendingCount,
    };
  });

  // Historical chart for top 3 indicators in this direction
  const topCodes = indicators.slice(0, 3).map((i) => i.code);
  const placeholders = topCodes.map(() => '?').join(',');
  const chartParams: unknown[] = [...topCodes];
  let chartMahallaClause = '';
  if (isMahallaUser && user.mahallaId) {
    chartMahallaClause = ' AND h.mahalla_id = ?';
    chartParams.push(user.mahallaId);
  }

  const histRows =
    topCodes.length > 0
      ? (db
          .prepare(
            `SELECT substr(h.changed_at, 1, 10) as day_key, i.name as indicator_name, i.code, SUM(h.new_value) as total
             FROM (
               SELECT h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10) as d, MAX(h.id) as max_id
               FROM indicator_histories h
               JOIN indicators i ON i.id = h.indicator_id
               WHERE i.code IN (${placeholders}) AND h.approval_status = 'approved'${chartMahallaClause}
               GROUP BY h.indicator_id, h.mahalla_id, substr(h.changed_at, 1, 10)
             ) pick
             JOIN indicator_histories h ON h.id = pick.max_id
             JOIN indicators i ON i.id = h.indicator_id
             GROUP BY day_key, i.code
             ORDER BY day_key ASC`
          )
          .all(...chartParams) as Array<{ day_key: string; indicator_name: string; code: string; total: number }>)
      : [];

  const dates = Array.from(new Set(histRows.map((r) => r.day_key))).sort();
  const datasets = topCodes.map((code) => {
    const ind = indicators.find((i) => i.code === code)!;
    return {
      code,
      label: ind.name,
      data: dates.map((d) => {
        const hit = histRows.find((r) => r.day_key === d && r.code === code);
        return hit ? Number(hit.total.toFixed(1)) : 0;
      }),
    };
  });

  return {
    direction,
    indicators: indicatorTotals,
    rows,
    chart: {
      labels: dates.map((d) => d.split('-').reverse().join('.')),
      datasets,
    },
  };
}

export function getMahallaRatings(db: Database.Database) {
  // Fair rating strictly over identical approved indicators across all active mahallas
  const rows = db
    .prepare(
      `SELECT m.id, m.code, m.name, m.sector, m.population_base, m.is_active,
              COALESCE(SUM(CASE WHEN i.code = 'bandlik_ishsizlar' THEN iv.approved_value END), 0) as ishsizlar,
              COALESCE(SUM(CASE WHEN i.code IN ('bandlik_ishga_joy','bandlik_ozini_band') THEN iv.approved_value END), 0) as bandlar,
              COALESCE(SUM(CASE WHEN i.code = 'norasmiy_aniqlangan' THEN iv.approved_value END), 0) as norasmiy_jam,
              COALESCE(SUM(CASE WHEN i.code = 'norasmiy_rasmiy' THEN iv.approved_value END), 0) as norasmiy_rasmiy,
              COALESCE(SUM(CASE WHEN i.code = 'subs_murojaat' THEN iv.approved_value END), 0) as subs_murojaat,
              COALESCE(SUM(CASE WHEN i.code = 'subs_ajratilgan' THEN iv.approved_value END), 0) as subs_ajratilgan,
              COALESCE(SUM(CASE WHEN i.code = 'mab_ajratilgan' THEN iv.approved_value END), 0) as mab_ajratilgan,
              COALESCE(SUM(CASE WHEN i.code = 'mab_sarflangan' THEN iv.approved_value END), 0) as mab_sarflangan,
              COUNT(DISTINCT iv.id) as tracked_indicators,
              MAX(iv.last_updated_at) as last_updated_at
       FROM mahallas m
       LEFT JOIN indicator_values iv ON iv.mahalla_id = m.id
       LEFT JOIN indicators i ON i.id = iv.indicator_id
       GROUP BY m.id
       ORDER BY m.id ASC`
    )
    .all() as Array<{
    id: number;
    code: string;
    name: string;
    sector: string;
    population_base: number;
    is_active: number;
    ishsizlar: number;
    bandlar: number;
    norasmiy_jam: number;
    norasmiy_rasmiy: number;
    subs_murojaat: number;
    subs_ajratilgan: number;
    mab_ajratilgan: number;
    mab_sarflangan: number;
    tracked_indicators: number;
    last_updated_at: string | null;
  }>;

  return rows
    .map((r) => {
      const bandlikPct = safePercent(r.bandlar, r.ishsizlar, true);
      const norasmiyPct = safePercent(r.norasmiy_rasmiy, r.norasmiy_jam, true);
      const subsPct = safePercent(r.subs_ajratilgan, r.subs_murojaat, true);
      const mabPct = safePercent(r.mab_sarflangan, r.mab_ajratilgan, true);
      const compositeIndex = Number(
        ((bandlikPct + norasmiyPct + subsPct + mabPct) / 4).toFixed(1)
      );
      return {
        ...r,
        bandlikPct,
        norasmiyPct,
        subsPct,
        mabPct,
        compositeIndex,
      };
    })
    .sort((a, b) => b.compositeIndex - a.compositeIndex);
}
