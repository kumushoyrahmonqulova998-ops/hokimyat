import type Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toTashkentParts } from '../config.ts';
import {
  assertUserCanAccessDirection,
  assertUserCanAccessMahalla,
  sanitizeText,
  writeAuditLog,
  type AuthUserContext,
} from '../security.ts';
import { recordIndicatorUpdate } from './metricsService.ts';

export interface ParsedPreviewRow {
  rowNumber: number;
  mahallaCode: string;
  mahallaName: string;
  mahallaId: number | null;
  indicatorCode: string;
  indicatorName: string;
  indicatorId: number | null;
  unit: string;
  oldValue: number;
  newValue: number | null;
  delta: number | null;
  comment: string;
  status: 'valid' | 'error';
  errorMessage: string | null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/['"`’ʻ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickField(obj: Record<string, unknown>, candidates: string[]): unknown {
  const entries = Object.entries(obj);
  for (const cand of candidates) {
    for (const [k, v] of entries) {
      if (normalizeHeader(k) === cand) return v;
    }
  }
  for (const cand of candidates) {
    for (const [k, v] of entries) {
      if (normalizeHeader(k).includes(cand)) return v;
    }
  }
  return undefined;
}

export function previewSpreadsheetImport(
  db: Database.Database,
  user: AuthUserContext,
  params: {
    buffer: Buffer;
    fileName: string;
    fileType: 'excel' | 'csv';
    directionId?: number | null;
  }
) {
  const workbook = XLSX.read(params.buffer, { type: 'buffer', codepage: 65001 });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Fayl bo'sh yoki varaq topilmadi.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Jadvalda hech qanday ma'lumot qatori topilmadi.");
  }
  if (rawRows.length > 5000) {
    throw new Error("Bitta import faylida maksimal 5000 qator bo'lishi mumkin.");
  }

  return buildImportPreview(db, user, {
    rawRows,
    fileName: params.fileName,
    fileType: params.fileType,
    fileSize: params.buffer.length,
    directionId: params.directionId ?? null,
  });
}

export function previewJsonImport(
  db: Database.Database,
  user: AuthUserContext,
  params: {
    jsonText: string;
    fileName: string;
    directionId?: number | null;
  }
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.jsonText);
  } catch {
    throw new Error("Yaroqsiz JSON formati. Iltimos, sintaksisni tekshiring.");
  }

  const rowsArray = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { rows?: unknown[] }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { data?: unknown[] }).data)
        ? (parsed as { data: unknown[] }).data
        : null;

  if (!rowsArray || rowsArray.length === 0) {
    throw new Error("JSON ichida ma'lumotlar massivi (array yoki { rows: [...] }) topilmadi.");
  }

  const normalizedRows = rowsArray.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { invalid: true } as Record<string, unknown>;
    }
    return item as Record<string, unknown>;
  });

  return buildImportPreview(db, user, {
    rawRows: normalizedRows,
    fileName: params.fileName,
    fileType: 'json',
    fileSize: Buffer.byteLength(params.jsonText, 'utf8'),
    directionId: params.directionId ?? null,
  });
}

function buildImportPreview(
  db: Database.Database,
  user: AuthUserContext,
  params: {
    rawRows: Array<Record<string, unknown>>;
    fileName: string;
    fileType: 'excel' | 'csv' | 'json';
    fileSize: number;
    directionId: number | null;
  }
) {
  const mahallas = db
    .prepare(`SELECT id, code, name FROM mahallas WHERE is_active = 1`)
    .all() as Array<{ id: number; code: string; name: string }>;

  const indicators = db
    .prepare(`SELECT id, code, name, unit, direction_id FROM indicators`)
    .all() as Array<{ id: number; code: string; name: string; unit: string; direction_id: number }>;

  const previewRows: ParsedPreviewRow[] = [];

  params.rawRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rawMahalla = String(
      pickField(row, ['mahalla_code', 'mahalla_kodi', 'mahalla', 'hudud', 'mfy']) ?? ''
    ).trim();
    const rawIndicator = String(
      pickField(row, ['indicator_code', 'korsatkich_kodi', 'korsatkich', 'indicator', 'code']) ?? ''
    ).trim();
    const rawValue = pickField(row, ['new_value', 'yangi_qiymat', 'qiymat', 'value', 'soni', 'summa']);
    const rawComment = String(
      pickField(row, ['comment', 'izoh', 'sabab', 'note']) ?? `${params.fileType.toUpperCase()} import`
    ).trim();

    let errorMessage: string | null = null;

    // Resolve Mahalla (or default to user's mahalla for mahalla operator if omitted)
    let mahalla = mahallas.find(
      (m) =>
        m.code.toLowerCase() === rawMahalla.toLowerCase() ||
        m.name.toLowerCase() === rawMahalla.toLowerCase()
    );
    if (!mahalla && user.roleSlug === 'mahalla' && user.mahallaId && !rawMahalla) {
      mahalla = mahallas.find((m) => m.id === user.mahallaId);
    }
    if (!mahalla) {
      errorMessage = `Mahalla topilmadi ("${rawMahalla || "bo'sh"}").`;
    } else if (!assertUserCanAccessMahalla(user, mahalla.id)) {
      errorMessage = `Ruxsat yo'q: faqat o'z mahallangiz (${user.mahallaName}) uchun yuklash mumkin.`;
    }

    // Resolve Indicator
    const indicator = indicators.find(
      (i) =>
        i.code.toLowerCase() === rawIndicator.toLowerCase() ||
        i.name.toLowerCase() === rawIndicator.toLowerCase()
    );
    if (!indicator) {
      errorMessage = errorMessage
        ? `${errorMessage} Ko'rsatkich topilmadi.`
        : `Ko'rsatkich topilmadi ("${rawIndicator || "bo'sh"}").`;
    } else {
      if (params.directionId && indicator.direction_id !== params.directionId) {
        errorMessage = errorMessage ?? `Tanlangan yo'nalishga mos emas (${indicator.name}).`;
      }
      if (!assertUserCanAccessDirection(user, indicator.direction_id)) {
        errorMessage = errorMessage ?? `Ushbu yo'nalish bo'yicha ruxsatingiz yo'q.`;
      }
    }

    // Validate Value
    const parsedNum =
      typeof rawValue === 'number'
        ? rawValue
        : Number(String(rawValue ?? '').replace(/\s+/g, '').replace(',', '.'));

    let validNumber: number | null = null;
    if (rawValue === '' || rawValue === undefined || rawValue === null || !Number.isFinite(parsedNum)) {
      errorMessage = errorMessage ?? "Qiymat son bo'lishi shart.";
    } else if (parsedNum < 0) {
      errorMessage = errorMessage ?? 'Salbiy qiymat qabul qilinmaydi.';
    } else {
      validNumber = Number(parsedNum.toFixed(2));
    }

    let oldValue = 0;
    if (mahalla && indicator) {
      const existingVal = db
        .prepare(
          `SELECT approved_value FROM indicator_values WHERE indicator_id = ? AND mahalla_id = ?`
        )
        .get(indicator.id, mahalla.id) as { approved_value: number } | undefined;
      oldValue = existingVal ? existingVal.approved_value : 0;
    }

    const delta = validNumber !== null ? Number((validNumber - oldValue).toFixed(2)) : null;

    previewRows.push({
      rowNumber,
      mahallaCode: mahalla?.code ?? rawMahalla,
      mahallaName: mahalla?.name ?? (rawMahalla || 'Noma\'lum'),
      mahallaId: mahalla?.id ?? null,
      indicatorCode: indicator?.code ?? rawIndicator,
      indicatorName: indicator?.name ?? (rawIndicator || 'Noma\'lum'),
      indicatorId: indicator?.id ?? null,
      unit: indicator?.unit ?? '',
      oldValue,
      newValue: validNumber,
      delta,
      comment: sanitizeText(rawComment, 300),
      status: errorMessage ? 'error' : 'valid',
      errorMessage,
    });
  });

  const validCount = previewRows.filter((r) => r.status === 'valid').length;
  const errorCount = previewRows.length - validCount;
  const nowIso = toTashkentParts().iso;

  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO data_imports
         (file_name, file_type, file_size, direction_id, mahalla_id, uploaded_by, total_rows, success_rows, error_rows, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'preview', ?)`
      )
      .run(
        sanitizeText(params.fileName, 200),
        params.fileType,
        params.fileSize,
        params.directionId,
        user.mahallaId,
        user.id,
        previewRows.length,
        validCount,
        errorCount,
        nowIso
      );

    const importId = Number(res.lastInsertRowid);
    const insRow = db.prepare(
      `INSERT INTO data_import_rows
       (import_id, row_number, mahalla_code, indicator_code, old_value, new_value, status, error_message, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const r of previewRows) {
      insRow.run(
        importId,
        r.rowNumber,
        r.mahallaCode,
        r.indicatorCode,
        r.oldValue,
        r.newValue,
        r.status,
        r.errorMessage,
        JSON.stringify(r)
      );
    }

    return importId;
  });

  const importId = tx();

  return {
    importId,
    fileName: params.fileName,
    fileType: params.fileType,
    totalRows: previewRows.length,
    validCount,
    errorCount,
    canCommit: errorCount === 0 && validCount > 0,
    rows: previewRows,
  };
}

export function commitImportTransaction(
  db: Database.Database,
  user: AuthUserContext,
  importId: number,
  ipAddress?: string
) {
  const imp = db
    .prepare(`SELECT * FROM data_imports WHERE id = ?`)
    .get(importId) as
    | {
        id: number;
        file_name: string;
        file_type: 'excel' | 'csv' | 'json';
        uploaded_by: number;
        status: string;
        error_rows: number;
        total_rows: number;
      }
    | undefined;

  if (!imp) {
    throw new Error('Import sessiyasi topilmadi.');
  }
  if (imp.uploaded_by !== user.id && user.roleSlug !== 'super_admin') {
    throw new Error("Faqat o'zingiz yuklagan importni tasdiqlashingiz mumkin.");
  }
  if (imp.status !== 'preview') {
    throw new Error(`Ushbu import allaqachon yakunlangan (holat: ${imp.status}).`);
  }
  if (imp.error_rows > 0) {
    throw new Error(
      "Xato qatorlar mavjudligi sababli ma'lumotlar saqlanmadi (hech qanday qisman yozuv amalga oshirilmadi)."
    );
  }

  const rows = db
    .prepare(`SELECT * FROM data_import_rows WHERE import_id = ? ORDER BY row_number ASC`)
    .all(importId) as Array<{
    id: number;
    row_number: number;
    raw_json: string;
  }>;

  const nowIso = toTashkentParts().iso;

  const tx = db.transaction(() => {
    let committedCount = 0;
    for (const row of rows) {
      const parsed = JSON.parse(row.raw_json) as ParsedPreviewRow;
      if (!parsed.indicatorId || !parsed.mahallaId || parsed.newValue === null) {
        throw new Error(`${row.row_number}-qatorda yaroqsiz ma'lumot aniqlandi.`);
      }
      recordIndicatorUpdate(db, {
        indicatorId: parsed.indicatorId,
        mahallaId: parsed.mahallaId,
        newValue: parsed.newValue,
        user,
        source: imp.file_type,
        comment: parsed.comment || `${imp.file_name} importi`,
        importId,
        ipAddress,
      });
      db.prepare(`UPDATE data_import_rows SET status = 'committed' WHERE id = ?`).run(row.id);
      committedCount++;
    }

    db.prepare(
      `UPDATE data_imports SET status = 'completed', success_rows = ?, committed_at = ? WHERE id = ?`
    ).run(committedCount, nowIso, importId);

    writeAuditLog(db, {
      userId: user.id,
      username: user.username,
      roleSlug: user.roleSlug,
      action: 'import_committed',
      entityType: 'data_import',
      entityId: importId,
      ipAddress,
      severity: 'info',
      details: { fileName: imp.file_name, fileType: imp.file_type, committedCount },
    });

    return { importId, committedCount, committedAt: nowIso };
  });

  try {
    return tx();
  } catch (err) {
    db.prepare(`UPDATE data_imports SET status = 'failed' WHERE id = ?`).run(importId);
    throw err;
  }
}

export interface ExportRow {
  directionName: string;
  mahallaName: string;
  mahallaCode: string;
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  previousValue: number;
  approvedValue: number;
  pendingValue: number | null;
  difference: number;
  approvalStatus: string;
  lastUpdatedAt: string;
}

export function fetchAuthorizedExportRows(
  db: Database.Database,
  user: AuthUserContext,
  filters: { directionId?: number | null; mahallaId?: number | null }
): ExportRow[] {
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];

  const effectiveMahallaId =
    user.roleSlug === 'mahalla' ? user.mahallaId : filters.mahallaId ?? null;
  if (effectiveMahallaId) {
    clauses.push('iv.mahalla_id = ?');
    params.push(effectiveMahallaId);
  }
  if (filters.directionId) {
    clauses.push('d.id = ?');
    params.push(filters.directionId);
  } else if (user.roleSlug === 'admin_one' && user.assignedDirectionIds.length > 0) {
    const ph = user.assignedDirectionIds.map(() => '?').join(',');
    clauses.push(`d.id IN (${ph})`);
    params.push(...user.assignedDirectionIds);
  } else if (user.roleSlug === 'admin_one' && user.assignedDirectionIds.length === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT d.name as directionName,
              m.name as mahallaName,
              m.code as mahallaCode,
              i.code as indicatorCode,
              i.name as indicatorName,
              i.unit as unit,
              iv.previous_value as previousValue,
              iv.approved_value as approvedValue,
              iv.pending_value as pendingValue,
              ROUND(iv.approved_value - iv.previous_value, 2) as difference,
              iv.approval_status as approvalStatus,
              iv.last_updated_at as lastUpdatedAt
       FROM indicator_values iv
       JOIN indicators i ON i.id = iv.indicator_id
       JOIN directions d ON d.id = i.direction_id
       JOIN mahallas m ON m.id = iv.mahalla_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY d.sort_order ASC, m.id ASC, i.sort_order ASC`
    )
    .all(...params) as ExportRow[];

  return rows;
}

export function buildCsvBuffer(title: string, rows: ExportRow[]): Buffer {
  const now = toTashkentParts();
  const headerLines = [
    `"Hisobot nomi","${title.replace(/"/g, '""')}"`,
    `"Sana (Asia/Tashkent)","${now.displayDate} ${now.displayTime}"`,
    '',
    '"Yo\'nalish","Mahalla","Mahalla kodi","Ko\'rsatkich kodi","Ko\'rsatkich","O\'lchov birligi","Oldingi qiymat","Tasdiqlangan qiymat","Tekshiruvdagi qiymat","O\'zgarish","Tasdiqlash holati","Oxirgi yangilanish"',
  ];

  const dataLines = rows.map((r) =>
    [
      r.directionName,
      r.mahallaName,
      r.mahallaCode,
      r.indicatorCode,
      r.indicatorName,
      r.unit,
      r.previousValue,
      r.approvedValue,
      r.pendingValue ?? '',
      r.difference,
      r.approvalStatus,
      r.lastUpdatedAt,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );

  // UTF-8 BOM for proper Cyrillic/Latin Uzbek rendering in Microsoft Excel
  return Buffer.from('\uFEFF' + [...headerLines, ...dataLines].join('\r\n'), 'utf8');
}

export function buildXlsxBuffer(title: string, rows: ExportRow[]): Buffer {
  const now = toTashkentParts();
  const wb = XLSX.utils.book_new();
  const sheetData = rows.map((r) => ({
    "Yo'nalish": r.directionName,
    Mahalla: r.mahallaName,
    'Mahalla kodi': r.mahallaCode,
    "Ko'rsatkich kodi": r.indicatorCode,
    "Ko'rsatkich": r.indicatorName,
    "O'lchov birligi": r.unit,
    'Oldingi qiymat': r.previousValue,
    'Tasdiqlangan qiymat': r.approvedValue,
    'Tekshiruvdagi qiymat': r.pendingValue ?? '',
    "O'zgarish": r.difference,
    'Tasdiqlash holati': r.approvalStatus,
    'Oxirgi yangilanish': r.lastUpdatedAt,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'PF-193 Hisobot');

  const metaSheet = XLSX.utils.json_to_sheet([
    { Maydon: 'Hisobot nomi', Qiymat: title },
    { Maydon: 'Tashkilot', Qiymat: 'Mirzaobod tumani hokimligi' },
    { Maydon: 'Sana', Qiymat: `${now.displayDate} ${now.displayTime} (Asia/Tashkent)` },
    { Maydon: 'Jami yozuvlar', Qiymat: rows.length },
  ]);
  XLSX.utils.book_append_sheet(wb, metaSheet, 'Maʼlumot');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildPdfBuffer(title: string, rows: ExportRow[]): Buffer {
  const now = toTashkentParts();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFillColor(11, 30, 59);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('MIRZAOBOD TUMANI HOKIMLIGI — PF-193 MONITORING HISOBOTI', 36, 28);
  doc.setFontSize(10);
  doc.setTextColor(220, 200, 140);
  doc.text(`${title}  |  Sana: ${now.displayDate} ${now.displayTime} (Asia/Tashkent)`, 36, 48);

  const limitedRows = rows.slice(0, 450);

  autoTable(doc, {
    startY: 78,
    head: [
      [
        "Yo'nalish",
        'Mahalla',
        "Ko'rsatkich",
        'Birlik',
        'Oldingi',
        'Tasdiqlangan',
        "O'zgarish",
        'Holat',
      ],
    ],
    body: limitedRows.map((r) => [
      r.directionName,
      r.mahallaName,
      r.indicatorName,
      r.unit,
      String(r.previousValue),
      String(r.approvedValue),
      `${r.difference >= 0 ? '+' : ''}${r.difference}`,
      r.approvalStatus,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 39, 75], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
  });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
