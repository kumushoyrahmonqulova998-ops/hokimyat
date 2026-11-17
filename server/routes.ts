import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { type PeriodType, toTashkentParts } from './config.ts';
import { seedHistoricalPf193Data } from './db.ts';
import {
  assertUserCanAccessDirection,
  assertUserCanAccessMahalla,
  clearSessionCookie,
  createNotification,
  createSession,
  getClientIp,
  hashPassword,
  requireAuth,
  requirePermission,
  requireRole,
  sanitizeText,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  verifyPassword,
  writeAuditLog,
  hashSessionToken,
} from './security.ts';
import {
  getDashboardSummary,
  getDirectionDetail,
  getMahallaRatings,
  recordIndicatorUpdate,
  reviewApprovalSubmission,
} from './services/metricsService.ts';
import {
  buildCsvBuffer,
  buildPdfBuffer,
  buildXlsxBuffer,
  commitImportTransaction,
  fetchAuthorizedExportRows,
  previewJsonImport,
  previewSpreadsheetImport,
} from './services/importExportService.ts';
import { generatePeriodReport } from './services/reportsService.ts';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Juda ko'p kirish urinishi. 15 daqiqadan so'ng qayta urinib ko'ring." },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleErr(res: Response, err: unknown, fallbackStatus = 400) {
  const msg = err instanceof Error ? err.message : 'Kutilmagan server xatoligi.';
  res.status(fallbackStatus).json({ error: msg });
}

function getSettingNumber(db: Database.Database, key: string, fallback: number): number {
  const row = db.prepare(`SELECT value FROM system_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function registerApiRoutes(app: Express, db: Database.Database): void {
  // ---------------------------------------------------------------------------
  // 1. Setup & System Status
  // ---------------------------------------------------------------------------
  app.get('/api/setup/status', (_req: Request, res: Response) => {
    const superAdminCount = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE r.slug = 'super_admin'`
        )
        .get() as { cnt: number }
    ).cnt;

    const settingsRows = db.prepare(`SELECT key, value FROM system_settings`).all() as Array<{
      key: string;
      value: string;
    }>;
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    const mahallas = db
      .prepare(`SELECT id, code, name, sector FROM mahallas WHERE is_active = 1 ORDER BY id ASC`)
      .all();

    res.json({
      needsInitialSetup: superAdminCount === 0,
      serverTime: toTashkentParts(),
      settings,
      mahallas,
    });
  });

  app.post('/api/setup/initialize', (req: Request, res: Response) => {
    try {
      const existingAdmins = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE r.slug = 'super_admin'`
          )
          .get() as { cnt: number }
      ).cnt;

      if (existingAdmins > 0) {
        res.status(403).json({ error: 'Tizim allaqachon ishga tushirilgan.' });
        return;
      }

      const username = sanitizeText(req.body?.username, 60).toLowerCase();
      const fullName = sanitizeText(req.body?.fullName, 120) || 'Tuman Super Administratori';
      const password = String(req.body?.password || '');
      const seedDemoData = Boolean(req.body?.seedDemoData ?? true);
      const createDemoAccounts = Boolean(req.body?.createDemoAccounts ?? true);

      if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
        res.status(400).json({
          error: "Login 4–32 ta kichik lotin harfi, raqam yoki (._-) belgilaridan iborat bo'lishi kerak.",
        });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: "Parol kamida 8 ta belgidan iborat bo'lishi kerak." });
        return;
      }

      const nowIso = toTashkentParts().iso;
      const getRole = (slug: string) =>
        db.prepare(`SELECT id FROM roles WHERE slug = ?`).get(slug) as { id: number };

      const generatedOneTimeAccounts: Array<{
        role: string;
        username: string;
        temporaryPassword: string;
        note: string;
      }> = [];

      const tx = db.transaction(() => {
        const superRole = getRole('super_admin');
        const insertUser = db.prepare(
          `INSERT INTO users
           (username, full_name, phone, email, password_hash, role_id, mahalla_id, is_active, is_blocked, must_change_password, created_at, updated_at)
           VALUES (?, ?, '', '', ?, ?, NULL, 1, 0, 0, ?, ?)`
        );
        const superRes = insertUser.run(
          username,
          fullName,
          hashPassword(password),
          superRole.id,
          nowIso,
          nowIso
        );
        const superUserId = Number(superRes.lastInsertRowid);

        if (createDemoAccounts) {
          const genTempPass = () => `Pf${crypto.randomBytes(4).toString('hex')}!9`;

          const a1Pass = genTempPass();
          const a1Role = getRole('admin_one');
          const a1Res = db
            .prepare(
              `INSERT INTO users
               (username, full_name, password_hash, role_id, mahalla_id, is_active, is_blocked, must_change_password, created_at, updated_at)
               VALUES (?, ?, ?, ?, NULL, 1, 0, 1, ?, ?)`
            )
            .run('admin1_yonalish', "Yo'nalishlar bo'yicha Admin-1", hashPassword(a1Pass), a1Role.id, nowIso, nowIso);
          const a1Id = Number(a1Res.lastInsertRowid);
          // Assign first 7 directions to Admin-1
          const dirs = db.prepare(`SELECT id FROM directions ORDER BY sort_order ASC LIMIT 7`).all() as Array<{ id: number }>;
          for (const d of dirs) {
            db.prepare(`INSERT OR IGNORE INTO user_directions (user_id, direction_id) VALUES (?, ?)`).run(a1Id, d.id);
          }
          generatedOneTimeAccounts.push({
            role: 'Admin-1',
            username: 'admin1_yonalish',
            temporaryPassword: a1Pass,
            note: "1–7 yo'nalishlarga biriktirilgan (birinchi kirishda parol almashtiriladi)",
          });

          const a2Pass = genTempPass();
          const a2Role = getRole('admin_two');
          db.prepare(
            `INSERT INTO users
             (username, full_name, password_hash, role_id, mahalla_id, is_active, is_blocked, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, 1, 0, 1, ?, ?)`
          ).run('admin2_hudud', 'Hududiy tahlil Admin-2', hashPassword(a2Pass), a2Role.id, nowIso, nowIso);
          generatedOneTimeAccounts.push({
            role: 'Admin-2',
            username: 'admin2_hudud',
            temporaryPassword: a2Pass,
            note: 'Mahallalar kesimi va tasdiqlash',
          });

          const mPass = genTempPass();
          const mRole = getRole('mahalla');
          const firstMahalla = db
            .prepare(`SELECT id, name FROM mahallas ORDER BY id ASC LIMIT 1`)
            .get() as { id: number; name: string };
          db.prepare(
            `INSERT INTO users
             (username, full_name, password_hash, role_id, mahalla_id, is_active, is_blocked, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`
          ).run('mahalla_navroz', `${firstMahalla.name} operatori`, hashPassword(mPass), mRole.id, firstMahalla.id, nowIso, nowIso);
          generatedOneTimeAccounts.push({
            role: 'Mahalla',
            username: 'mahalla_navroz',
            temporaryPassword: mPass,
            note: `${firstMahalla.name} izolyatsiya qilingan hisob`,
          });
        }

        if (seedDemoData) {
          seedHistoricalPf193Data(db, superUserId);
        }

        writeAuditLog(db, {
          userId: superUserId,
          username,
          roleSlug: 'super_admin',
          action: 'system_initialized',
          entityType: 'system',
          ipAddress: getClientIp(req),
          severity: 'info',
          details: { seedDemoData, createDemoAccounts },
        });
      });

      tx();

      res.status(201).json({
        message: 'Tizim muvaffaqiyatli sozlandi.',
        generatedAccounts: generatedOneTimeAccounts,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication (4 Portals + Brute Force + Session Fixation + Re-auth)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', loginLimiter, (req: Request, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 60).toLowerCase();
      const password = String(req.body?.password || '');
      const portalRole = sanitizeText(req.body?.portalRole, 30);

      if (!username || !password) {
        res.status(400).json({ error: 'Login va parol kiritilishi shart.' });
        return;
      }

      const user = db
        .prepare(
          `SELECT u.*, r.slug as role_slug, r.name as role_name
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.username = ?`
        )
        .get(username) as
        | {
            id: number;
            username: string;
            full_name: string;
            password_hash: string;
            role_id: number;
            role_slug: string;
            role_name: string;
            mahalla_id: number | null;
            is_active: number;
            is_blocked: number;
            must_change_password: number;
            failed_attempts: number;
            locked_until: string | null;
          }
        | undefined;

      const ip = getClientIp(req);

      if (!user) {
        writeAuditLog(db, {
          username,
          action: 'login_failed_unknown_user',
          entityType: 'auth',
          ipAddress: ip,
          severity: 'warning',
          details: { portalRole },
        });
        res.status(401).json({ error: 'Login yoki parol xato.' });
        return;
      }

      if (!user.is_active || user.is_blocked) {
        res.status(403).json({
          error: 'Hisobingiz vaqtincha bloklangan. Super Adminga murojaat qiling.',
        });
        return;
      }

      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        res.status(429).json({
          error: "Ko'p marta xato parol kiritilgani sababli hisob vaqtincha qulflangan.",
        });
        return;
      }

      // Enforce portal separation: each of the 4 portals only accepts its matching role!
      if (portalRole && user.role_slug !== portalRole) {
        writeAuditLog(db, {
          userId: user.id,
          username: user.username,
          roleSlug: user.role_slug,
          action: 'portal_role_mismatch',
          entityType: 'auth',
          ipAddress: ip,
          severity: 'warning',
          details: { attemptedPortal: portalRole, actualRole: user.role_slug },
        });
        res.status(403).json({
          error: "Bo'lim xato. Tegishli kirish bo'limini tanlang.",
        });
        return;
      }

      if (!verifyPassword(password, user.password_hash)) {
        const maxAttempts = getSettingNumber(db, 'max_login_attempts', 5);
        const lockoutMin = getSettingNumber(db, 'lockout_minutes', 15);
        const attempts = user.failed_attempts + 1;
        const lockUntil =
          attempts >= maxAttempts
            ? toTashkentParts(new Date(Date.now() + lockoutMin * 60000)).iso
            : null;

        db.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`).run(
          attempts,
          lockUntil,
          user.id
        );

        writeAuditLog(db, {
          userId: user.id,
          username: user.username,
          roleSlug: user.role_slug,
          action: 'login_failed_bad_password',
          entityType: 'auth',
          ipAddress: ip,
          severity: lockUntil ? 'critical' : 'warning',
          details: { attempts, locked: Boolean(lockUntil) },
        });

        res.status(401).json({
          error: lockUntil
            ? `Parol ${maxAttempts} marta noto'g'ri kiritildi. Hisob ${lockoutMin} daqiqaga bloklandi.`
            : `Login yoki parol xato. Qolgan urinishlar: ${Math.max(0, maxAttempts - attempts)}`,
        });
        return;
      }

      // Prevent session fixation: remove any old cookie token & create fresh session
      const oldToken = req.cookies?.[SESSION_COOKIE_NAME];
      if (oldToken) {
        db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashSessionToken(oldToken));
      }

      const nowIso = toTashkentParts().iso;
      db.prepare(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`
      ).run(nowIso, user.id);

      const session = createSession(
        db,
        user.id,
        ip,
        String(req.headers['user-agent'] || '')
      );
      setSessionCookie(res, session.rawToken, req);

      writeAuditLog(db, {
        userId: user.id,
        username: user.username,
        roleSlug: user.role_slug,
        action: 'login_success',
        entityType: 'auth',
        ipAddress: ip,
        severity: 'info',
      });

      res.json({
        message: 'Tizimga muvaffaqiyatli kirdingiz.',
        mustChangePassword: user.must_change_password === 1,
        csrfToken: session.csrfToken,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.post('/api/auth/reset-request', loginLimiter, (req: Request, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 60).toLowerCase();
      const note = sanitizeText(req.body?.note, 250);
      if (!username) {
        res.status(400).json({ error: 'Loginni kiriting.' });
        return;
      }
      const user = db
        .prepare(`SELECT id, username, full_name FROM users WHERE username = ?`)
        .get(username) as { id: number; username: string; full_name: string } | undefined;

      if (user) {
        createNotification(db, {
          roleSlug: 'super_admin',
          title: "Parolni tiklash so'rovi",
          message: `${user.full_name} (${user.username}) parolni tiklashni so'radi. ${note ? 'Izoh: ' + note : ''}`,
          type: 'warning',
          link: '/users',
        });
        writeAuditLog(db, {
          userId: user.id,
          username: user.username,
          action: 'password_reset_requested',
          entityType: 'auth',
          ipAddress: getClientIp(req),
          severity: 'warning',
          details: { note },
        });
      }
      // Always return neutral confirmation to prevent username enumeration
      res.json({
        message:
          "So'rovingiz qabul qilindi. Agar login tizimda mavjud bo'lsa, Super Adminga bildirishnoma yuborildi.",
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Autentifikatsiya talab qilinadi.' });
      return;
    }
    res.json({ user: req.authUser });
  });

  app.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
    try {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 8) {
        res.status(400).json({ error: "Yangi parol kamida 8 ta belgidan iborat bo'lishi kerak." });
        return;
      }
      if (currentPassword === newPassword) {
        res.status(400).json({ error: 'Yangi parol eski paroldan farqli bo‘lishi kerak.' });
        return;
      }

      const userRow = db
        .prepare(`SELECT id, password_hash FROM users WHERE id = ?`)
        .get(req.authUser!.id) as { id: number; password_hash: string };
      if (!verifyPassword(currentPassword, userRow.password_hash)) {
        res.status(403).json({ error: "Joriy parol noto'g'ri." });
        return;
      }

      db.prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`
      ).run(hashPassword(newPassword), toTashkentParts().iso, req.authUser!.id);

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: 'password_changed',
        entityType: 'user',
        entityId: req.authUser!.id,
        ipAddress: getClientIp(req),
        severity: 'info',
      });

      res.json({ message: 'Parol muvaffaqiyatli yangilandi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.post('/api/auth/logout', requireAuth, (req: Request, res: Response) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashSessionToken(rawToken));
    }
    clearSessionCookie(res);
    writeAuditLog(db, {
      userId: req.authUser!.id,
      username: req.authUser!.username,
      roleSlug: req.authUser!.roleSlug,
      action: 'logout',
      entityType: 'auth',
      ipAddress: getClientIp(req),
    });
    res.json({ message: 'Tizimdan chiqildi.' });
  });

  // ---------------------------------------------------------------------------
  // 3. Catalog, Dashboard, & Directions
  // ---------------------------------------------------------------------------
  app.get('/api/catalog', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const allDirs = db.prepare(`SELECT * FROM directions ORDER BY sort_order ASC`).all() as Array<{
      id: number;
      sort_order: number;
      slug: string;
      name: string;
      short_name: string;
      description: string;
      icon: string;
    }>;

    const directions =
      user.roleSlug === 'admin_one'
        ? allDirs.filter((d) => user.assignedDirectionIds.includes(d.id))
        : allDirs;

    const indicators = db
      .prepare(`SELECT * FROM indicators ORDER BY direction_id ASC, sort_order ASC`)
      .all() as Array<{
      id: number;
      direction_id: number;
      code: string;
      name: string;
      unit: string;
      value_type: string;
    }>;

    const allowedDirIds = new Set(directions.map((d) => d.id));
    const filteredIndicators = indicators.filter((i) => allowedDirIds.has(i.direction_id));

    const allMahallas = db
      .prepare(`SELECT * FROM mahallas WHERE is_active = 1 ORDER BY id ASC`)
      .all() as Array<{ id: number; code: string; name: string; sector: string }>;

    const mahallas =
      user.roleSlug === 'mahalla' && user.mahallaId
        ? allMahallas.filter((m) => m.id === user.mahallaId)
        : allMahallas;

    const roles = db.prepare(`SELECT id, slug, name, description FROM roles`).all();
    const permissions = db.prepare(`SELECT id, slug, name, group_name FROM permissions`).all();

    res.json({
      directions,
      indicators: filteredIndicators,
      mahallas,
      roles,
      permissions,
    });
  });

  app.get('/api/dashboard', requireAuth, (req: Request, res: Response) => {
    try {
      const periodRaw = String(req.query.period || 'monthly');
      const periodType: PeriodType =
        periodRaw === 'weekly' || periodRaw === 'yearly' ? periodRaw : 'monthly';
      const mahallaId = req.query.mahallaId ? Number(req.query.mahallaId) : null;

      if (mahallaId && !assertUserCanAccessMahalla(req.authUser!, mahallaId)) {
        res.status(403).json({ error: "Boshqa mahalla ma'lumotlariga kirish taqiqlangan." });
        return;
      }

      const data = getDashboardSummary(db, req.authUser!, periodType, mahallaId);
      res.json(data);
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.get('/api/directions/:slug', requireAuth, (req: Request, res: Response) => {
    try {
      const search = sanitizeText(req.query.search, 100);
      const sector = sanitizeText(req.query.sector, 40);
      const data = getDirectionDetail(db, req.authUser!, String(req.params.slug), search, sector);
      res.json(data);
    } catch (err) {
      handleErr(res, err, 403);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Manual Entry, 3-Mode Import, History, Approvals
  // ---------------------------------------------------------------------------
  app.post(
    '/api/data/manual',
    requireAuth,
    requirePermission('data.enter_manual'),
    (req: Request, res: Response) => {
      try {
        const indicatorId = Number(req.body?.indicatorId);
        const mahallaId =
          req.authUser!.roleSlug === 'mahalla'
            ? Number(req.authUser!.mahallaId)
            : Number(req.body?.mahallaId);
        const newValue = Number(req.body?.newValue);
        const comment = sanitizeText(req.body?.comment, 400);

        if (!Number.isInteger(indicatorId) || !Number.isInteger(mahallaId)) {
          res.status(400).json({ error: "Yo'nalish, mahalla va ko'rsatkichni tanlang." });
          return;
        }

        const result = recordIndicatorUpdate(db, {
          indicatorId,
          mahallaId,
          newValue,
          user: req.authUser!,
          source: 'manual',
          comment: comment || "Qo'lda kiritilgan yangilanish",
          ipAddress: getClientIp(req),
        });

        res.status(201).json({
          message:
            result.approvalStatus === 'approved'
              ? "Ma'lumot saqlandi, tarixga yozildi va rasmiy statistikaga qo'shildi."
              : "Ma'lumot saqlandi, tarixga yozildi va tekshirish uchun yuborildi.",
          result,
        });
      } catch (err) {
        handleErr(res, err);
      }
    }
  );

  app.post(
    '/api/imports/excel',
    requireAuth,
    requirePermission('data.import_excel'),
    upload.single('file'),
    (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Excel yoki CSV faylini tanlang.' });
          return;
        }
        const originalName = req.file.originalname.toLowerCase();
        const isCsv = originalName.endsWith('.csv');
        const isXlsx = originalName.endsWith('.xlsx');
        if (!isCsv && !isXlsx) {
          res.status(400).json({
            error: "Faqat .xlsx yoki .csv formatidagi fayllar qabul qilinadi. Zararli yoki noma'lum fayl rad etildi.",
          });
          return;
        }

        const maxMb = getSettingNumber(db, 'max_import_size_mb', 10);
        if (req.file.size > maxMb * 1024 * 1024) {
          res.status(400).json({ error: `Fayl hajmi ${maxMb} MB dan oshmasligi kerak.` });
          return;
        }

        const directionId = req.body?.directionId ? Number(req.body.directionId) : null;
        if (directionId && !assertUserCanAccessDirection(req.authUser!, directionId)) {
          res.status(403).json({ error: "Tanlangan yo'nalishga ruxsatingiz yo'q." });
          return;
        }

        const preview = previewSpreadsheetImport(db, req.authUser!, {
          buffer: req.file.buffer,
          fileName: req.file.originalname,
          fileType: isCsv ? 'csv' : 'excel',
          directionId,
        });
        res.json(preview);
      } catch (err) {
        handleErr(res, err);
      }
    }
  );

  app.post(
    '/api/imports/json',
    requireAuth,
    requirePermission('data.import_json'),
    upload.single('file'),
    (req: Request, res: Response) => {
      try {
        const directionId = req.body?.directionId ? Number(req.body.directionId) : null;
        if (directionId && !assertUserCanAccessDirection(req.authUser!, directionId)) {
          res.status(403).json({ error: "Tanlangan yo'nalishga ruxsatingiz yo'q." });
          return;
        }

        let jsonText = '';
        let fileName = 'json_import.json';

        if (req.file) {
          if (!req.file.originalname.toLowerCase().endsWith('.json')) {
            res.status(400).json({ error: 'Faqat .json fayli qabul qilinadi.' });
            return;
          }
          jsonText = req.file.buffer.toString('utf8');
          fileName = req.file.originalname;
        } else if (typeof req.body?.jsonText === 'string') {
          jsonText = req.body.jsonText;
        } else {
          res.status(400).json({ error: 'JSON fayl yoki matn yuboring.' });
          return;
        }

        const maxMb = getSettingNumber(db, 'max_import_size_mb', 10);
        if (Buffer.byteLength(jsonText, 'utf8') > maxMb * 1024 * 1024) {
          res.status(400).json({ error: `JSON hajmi ${maxMb} MB dan oshmasligi kerak.` });
          return;
        }

        const preview = previewJsonImport(db, req.authUser!, {
          jsonText,
          fileName,
          directionId,
        });
        res.json(preview);
      } catch (err) {
        handleErr(res, err);
      }
    }
  );

  app.post('/api/imports/:id/commit', requireAuth, (req: Request, res: Response) => {
    try {
      const importId = Number(req.params.id);
      const result = commitImportTransaction(db, req.authUser!, importId, getClientIp(req));
      res.json({
        message: `${result.committedCount} ta yozuv muvaffaqiyatli saqlandi va tarixga yozildi.`,
        ...result,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.get('/api/imports/template', requireAuth, (req: Request, res: Response) => {
    try {
      const format = String(req.query.format || 'xlsx');
      const directionId = req.query.directionId ? Number(req.query.directionId) : null;
      const user = req.authUser!;

      const firstMahalla =
        user.roleSlug === 'mahalla' && user.mahallaCode
          ? { code: user.mahallaCode, name: user.mahallaName }
          : (db.prepare(`SELECT code, name FROM mahallas WHERE is_active = 1 ORDER BY id ASC LIMIT 1`).get() as {
              code: string;
              name: string;
            });

      const inds = db
        .prepare(
          `SELECT code, name FROM indicators ${
            directionId ? 'WHERE direction_id = ?' : ''
          } ORDER BY direction_id ASC, sort_order ASC LIMIT 5`
        )
        .all(...(directionId ? [directionId] : [])) as Array<{ code: string; name: string }>;

      const sampleRows = inds.map((i, idx) => ({
        mahalla_code: firstMahalla.code,
        indicator_code: i.code,
        new_value: 100 + idx * 15,
        comment: `${i.name} bo'yicha namuna yuklash`,
      }));

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="pf193_shablon.json"');
        res.send(JSON.stringify(sampleRows, null, 2));
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Shablon');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="pf193_shablon.xlsx"');
      res.send(buf);
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.get('/api/imports/history', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const limit = Math.min(100, Math.max(5, Number(req.query.limit || 25)));
    const whereClause =
      user.roleSlug === 'mahalla'
        ? 'WHERE di.uploaded_by = ? OR di.mahalla_id = ?'
        : '';
    const params =
      user.roleSlug === 'mahalla' ? [user.id, user.mahallaId ?? -1, limit] : [limit];

    const rows = db
      .prepare(
        `SELECT di.*, u.full_name as uploaded_by_name, u.username,
                d.name as direction_name, m.name as mahalla_name
         FROM data_imports di
         JOIN users u ON u.id = di.uploaded_by
         LEFT JOIN directions d ON d.id = di.direction_id
         LEFT JOIN mahallas m ON m.id = di.mahalla_id
         ${whereClause}
         ORDER BY di.created_at DESC, di.id DESC
         LIMIT ?`
      )
      .all(...params);

    res.json({ imports: rows });
  });

  app.get('/api/imports/:id/rows', requireAuth, (req: Request, res: Response) => {
    const importId = Number(req.params.id);
    const imp = db.prepare(`SELECT * FROM data_imports WHERE id = ?`).get(importId) as
      | { id: number; uploaded_by: number; mahalla_id: number | null }
      | undefined;
    if (!imp) {
      res.status(404).json({ error: 'Import topilmadi.' });
      return;
    }
    if (
      req.authUser!.roleSlug === 'mahalla' &&
      imp.uploaded_by !== req.authUser!.id &&
      imp.mahalla_id !== req.authUser!.mahallaId
    ) {
      res.status(403).json({ error: "Ushbu importni ko'rish huquqingiz yo'q." });
      return;
    }
    const rows = db
      .prepare(`SELECT * FROM data_import_rows WHERE import_id = ? ORDER BY row_number ASC`)
      .all(importId);
    res.json({ import: imp, rows });
  });

  // ---------------------------------------------------------------------------
  // 5. Immutable History & Corrections (Append-Only!)
  // ---------------------------------------------------------------------------
  app.get('/api/history', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize || 25)));
    const offset = (page - 1) * pageSize;

    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (user.roleSlug === 'mahalla' && user.mahallaId) {
      clauses.push('h.mahalla_id = ?');
      params.push(user.mahallaId);
    } else if (req.query.mahallaId) {
      clauses.push('h.mahalla_id = ?');
      params.push(Number(req.query.mahallaId));
    }

    if (req.query.directionId) {
      const dId = Number(req.query.directionId);
      if (!assertUserCanAccessDirection(user, dId)) {
        res.status(403).json({ error: "Ushbu yo'nalish tarixiga ruxsatingiz yo'q." });
        return;
      }
      clauses.push('i.direction_id = ?');
      params.push(dId);
    } else if (user.roleSlug === 'admin_one' && user.assignedDirectionIds.length > 0) {
      const ph = user.assignedDirectionIds.map(() => '?').join(',');
      clauses.push(`i.direction_id IN (${ph})`);
      params.push(...user.assignedDirectionIds);
    }

    if (req.query.source) {
      clauses.push('h.source = ?');
      params.push(sanitizeText(req.query.source, 30));
    }
    if (req.query.status) {
      clauses.push('h.approval_status = ?');
      params.push(sanitizeText(req.query.status, 30));
    }
    if (req.query.search) {
      const q = `%${sanitizeText(req.query.search, 80)}%`;
      clauses.push('(i.name LIKE ? OR m.name LIKE ? OR h.comment LIKE ?)');
      params.push(q, q, q);
    }

    const where = clauses.join(' AND ');
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM indicator_histories h
           JOIN indicators i ON i.id = h.indicator_id
           JOIN mahallas m ON m.id = h.mahalla_id
           WHERE ${where}`
        )
        .get(...params) as { cnt: number }
    ).cnt;

    const rows = db
      .prepare(
        `SELECT h.*, i.code as indicator_code, i.name as indicator_name, i.unit,
                d.id as direction_id, d.name as direction_name,
                m.name as mahalla_name, m.code as mahalla_code,
                COALESCE(u.full_name, 'Tizim') as changed_by_name,
                COALESCE(u.username, 'system') as changed_by_username
         FROM indicator_histories h
         JOIN indicators i ON i.id = h.indicator_id
         JOIN directions d ON d.id = i.direction_id
         JOIN mahallas m ON m.id = h.mahalla_id
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE ${where}
         ORDER BY h.changed_at DESC, h.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset);

    res.json({ total, page, pageSize, rows });
  });

  app.post(
    '/api/history/correct',
    requireAuth,
    requireRole('super_admin', 'admin_one'),
    (req: Request, res: Response) => {
      try {
        const indicatorId = Number(req.body?.indicatorId);
        const mahallaId = Number(req.body?.mahallaId);
        const correctedValue = Number(req.body?.correctedValue);
        const comment = sanitizeText(req.body?.comment, 400);

        if (comment.length < 3) {
          res.status(400).json({ error: 'Tuzatish sababi kiritilishi shart.' });
          return;
        }

        const result = recordIndicatorUpdate(db, {
          indicatorId,
          mahallaId,
          newValue: correctedValue,
          user: req.authUser!,
          source: 'correction',
          comment: `[Tuzatish] ${comment}`,
          autoApprove: true,
          ipAddress: getClientIp(req),
        });

        res.status(201).json({
          message: 'Tuzatish yangi tarixiy yozuv sifatida qayd etildi (eski tarix saqlab qolindi).',
          result,
        });
      } catch (err) {
        handleErr(res, err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 6. Approvals Workflow
  // ---------------------------------------------------------------------------
  app.get('/api/approvals', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const statusFilter = sanitizeText(req.query.status, 30);

    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];

    if (user.roleSlug === 'mahalla' && user.mahallaId) {
      clauses.push('a.mahalla_id = ?');
      params.push(user.mahallaId);
    }
    if (user.roleSlug === 'admin_one' && user.assignedDirectionIds.length > 0) {
      const ph = user.assignedDirectionIds.map(() => '?').join(',');
      clauses.push(`i.direction_id IN (${ph})`);
      params.push(...user.assignedDirectionIds);
    }
    if (statusFilter) {
      clauses.push('a.status = ?');
      params.push(statusFilter);
    }

    const rows = db
      .prepare(
        `SELECT a.*, h.old_value, h.new_value, h.difference, h.source, h.comment as submission_comment,
                i.name as indicator_name, i.unit, i.direction_id,
                d.name as direction_name,
                m.name as mahalla_name, m.sector,
                COALESCE(sub.full_name, 'Operator') as submitted_by_name,
                rev.full_name as reviewed_by_name
         FROM approvals a
         JOIN indicator_histories h ON h.id = a.history_id
         JOIN indicators i ON i.id = a.indicator_id
         JOIN directions d ON d.id = i.direction_id
         JOIN mahallas m ON m.id = a.mahalla_id
         LEFT JOIN users sub ON sub.id = a.submitted_by
         LEFT JOIN users rev ON rev.id = a.reviewed_by
         WHERE ${clauses.join(' AND ')}
         ORDER BY CASE WHEN a.status IN ('submitted','reviewing') THEN 0 ELSE 1 END, a.created_at DESC
         LIMIT 100`
      )
      .all(...params);

    res.json({ approvals: rows });
  });

  app.post(
    '/api/approvals/:id/review',
    requireAuth,
    requirePermission('data.approve'),
    (req: Request, res: Response) => {
      try {
        const approvalId = Number(req.params.id);
        const decision = req.body?.decision as 'approved' | 'returned' | 'reviewing';
        if (!['approved', 'returned', 'reviewing'].includes(decision)) {
          res.status(400).json({ error: "Noto'g'ri qaror turi." });
          return;
        }
        const comment = sanitizeText(req.body?.comment, 400);
        const result = reviewApprovalSubmission(db, {
          approvalId,
          decision,
          comment,
          reviewer: req.authUser!,
          ipAddress: getClientIp(req),
        });
        res.json({ message: 'Qaror saqlandi.', result });
      } catch (err) {
        handleErr(res, err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 7. Reports, Mahalla Ratings & Exports (PDF, XLSX, CSV, JSON)
  // ---------------------------------------------------------------------------
  app.get('/api/reports', requireAuth, requirePermission('reports.view'), (req: Request, res: Response) => {
    try {
      const periodRaw = String(req.query.period || 'monthly');
      const periodType: PeriodType =
        periodRaw === 'weekly' || periodRaw === 'yearly' ? periodRaw : 'monthly';
      const referenceDate = sanitizeText(req.query.date, 20) || undefined;
      const directionId = req.query.directionId ? Number(req.query.directionId) : null;
      const mahallaId = req.query.mahallaId ? Number(req.query.mahallaId) : null;
      const saveSnapshot = req.query.saveSnapshot === '1';

      if (mahallaId && !assertUserCanAccessMahalla(req.authUser!, mahallaId)) {
        res.status(403).json({ error: "Boshqa mahalla hisobotini ko'rish mumkin emas." });
        return;
      }
      if (directionId && !assertUserCanAccessDirection(req.authUser!, directionId)) {
        res.status(403).json({ error: "Tanlangan yo'nalish bo'yicha ruxsat yo'q." });
        return;
      }

      const report = generatePeriodReport(db, req.authUser!, {
        periodType,
        referenceDate,
        directionId,
        mahallaId,
        saveSnapshot,
      });

      const snapshots = db
        .prepare(
          `SELECT rs.id, rs.period_type, rs.period_key, rs.created_at, u.full_name as generated_by_name
           FROM report_snapshots rs
           LEFT JOIN users u ON u.id = rs.generated_by
           ORDER BY rs.created_at DESC
           LIMIT 15`
        )
        .all();

      res.json({ report, snapshots });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.get('/api/mahallas/ratings', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const allRatings = getMahallaRatings(db);
    const ratings =
      user.roleSlug === 'mahalla' && user.mahallaId
        ? allRatings.filter((r) => r.id === user.mahallaId)
        : allRatings;
    res.json({ ratings });
  });

  app.get('/api/export', requireAuth, requirePermission('reports.export'), (req: Request, res: Response) => {
    try {
      const format = String(req.query.format || 'csv').toLowerCase();
      const directionId = req.query.directionId ? Number(req.query.directionId) : null;
      const mahallaId = req.query.mahallaId ? Number(req.query.mahallaId) : null;
      const title = sanitizeText(req.query.title, 140) || 'PF-193 Monitoring Hisoboti';

      if (mahallaId && !assertUserCanAccessMahalla(req.authUser!, mahallaId)) {
        res.status(403).json({ error: "Ruxsat etilmagan mahalla ma'lumoti." });
        return;
      }
      if (directionId && !assertUserCanAccessDirection(req.authUser!, directionId)) {
        res.status(403).json({ error: "Ruxsat etilmagan yo'nalish." });
        return;
      }

      const rows = fetchAuthorizedExportRows(db, req.authUser!, { directionId, mahallaId });
      const dateStamp = toTashkentParts().dateStr;

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: `export_${format}`,
        entityType: 'report',
        ipAddress: getClientIp(req),
        details: { format, rowCount: rows.length, directionId, mahallaId },
      });

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="pf193_hisobot_${dateStamp}.json"`
        );
        res.send(
          JSON.stringify(
            {
              title,
              organization: 'Mirzaobod tumani hokimligi',
              exportedAt: toTashkentParts().iso,
              totalRows: rows.length,
              rows,
            },
            null,
            2
          )
        );
        return;
      }

      if (format === 'xlsx' || format === 'excel') {
        const buf = buildXlsxBuffer(title, rows);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="pf193_hisobot_${dateStamp}.xlsx"`
        );
        res.send(buf);
        return;
      }

      if (format === 'pdf') {
        const buf = buildPdfBuffer(title, rows);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="pf193_hisobot_${dateStamp}.pdf"`
        );
        res.send(buf);
        return;
      }

      const csvBuf = buildCsvBuffer(title, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pf193_hisobot_${dateStamp}.csv"`
      );
      res.send(csvBuf);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Super Admin: Users, Mahallas, Permissions, Security, Settings, Backup
  // ---------------------------------------------------------------------------
  app.get('/api/users', requireAuth, requireRole('super_admin'), (_req: Request, res: Response) => {
    const users = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.phone, u.email, u.role_id, u.mahalla_id,
                u.is_active, u.is_blocked, u.must_change_password, u.failed_attempts,
                u.locked_until, u.last_login_at, u.created_at,
                r.slug as role_slug, r.name as role_name, m.name as mahalla_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN mahallas m ON m.id = u.mahalla_id
         ORDER BY u.id ASC`
      )
      .all() as Array<{ id: number }>;

    const dirStmt = db.prepare(`SELECT direction_id FROM user_directions WHERE user_id = ?`);
    const permStmt = db.prepare(
      `SELECT p.slug, up.granted FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = ?`
    );

    const enriched = users.map((u) => ({
      ...u,
      assignedDirectionIds: (dirStmt.all(u.id) as Array<{ direction_id: number }>).map(
        (d) => d.direction_id
      ),
      permissionOverrides: permStmt.all(u.id),
    }));

    res.json({ users: enriched });
  });

  app.post('/api/users', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 60).toLowerCase();
      const fullName = sanitizeText(req.body?.fullName, 120);
      const phone = sanitizeText(req.body?.phone, 30);
      const email = sanitizeText(req.body?.email, 100);
      const roleSlug = sanitizeText(req.body?.roleSlug, 30);
      const mahallaId = req.body?.mahallaId ? Number(req.body.mahallaId) : null;
      const tempPassword = String(req.body?.temporaryPassword || '');
      const directionIds: number[] = Array.isArray(req.body?.directionIds)
        ? req.body.directionIds.map(Number).filter(Number.isInteger)
        : [];

      if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
        res.status(400).json({ error: "Login kamida 4 ta lotin harf/raqamdan iborat bo'lsin." });
        return;
      }
      if (!fullName || tempPassword.length < 8) {
        res.status(400).json({ error: "F.I.Sh va kamida 8 belgili vaqtinchalik parol talab qilinadi." });
        return;
      }

      const role = db.prepare(`SELECT id FROM roles WHERE slug = ?`).get(roleSlug) as
        | { id: number }
        | undefined;
      if (!role) {
        res.status(400).json({ error: 'Yaroqsiz rol tanlandi.' });
        return;
      }
      if (roleSlug === 'mahalla' && !mahallaId) {
        res.status(400).json({ error: 'Mahalla operatori uchun mahalla biriktirilishi shart.' });
        return;
      }

      const nowIso = toTashkentParts().iso;
      const tx = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO users
             (username, full_name, phone, email, password_hash, role_id, mahalla_id, is_active, is_blocked, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`
          )
          .run(
            username,
            fullName,
            phone,
            email,
            hashPassword(tempPassword),
            role.id,
            roleSlug === 'mahalla' ? mahallaId : null,
            nowIso,
            nowIso
          );
        const newUserId = Number(result.lastInsertRowid);
        for (const dId of directionIds) {
          db.prepare(`INSERT OR IGNORE INTO user_directions (user_id, direction_id) VALUES (?, ?)`).run(
            newUserId,
            dId
          );
        }
        writeAuditLog(db, {
          userId: req.authUser!.id,
          username: req.authUser!.username,
          roleSlug: req.authUser!.roleSlug,
          action: 'user_created',
          entityType: 'user',
          entityId: newUserId,
          ipAddress: getClientIp(req),
          details: { createdUsername: username, roleSlug, mahallaId, directionIds },
        });
        return newUserId;
      });

      const userId = tx();
      res.status(201).json({ message: 'Foydalanuvchi yaratildi (birinchi kirishda parol almashtiriladi).', userId });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.put('/api/users/:id', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      const fullName = sanitizeText(req.body?.fullName, 120);
      const phone = sanitizeText(req.body?.phone, 30);
      const email = sanitizeText(req.body?.email, 100);
      const roleSlug = sanitizeText(req.body?.roleSlug, 30);
      const mahallaId = req.body?.mahallaId ? Number(req.body.mahallaId) : null;
      const directionIds: number[] = Array.isArray(req.body?.directionIds)
        ? req.body.directionIds.map(Number).filter(Number.isInteger)
        : [];
      const permissionsOverride: Array<{ slug: string; granted: boolean }> = Array.isArray(
        req.body?.permissionOverrides
      )
        ? req.body.permissionOverrides
        : [];

      const role = db.prepare(`SELECT id FROM roles WHERE slug = ?`).get(roleSlug) as
        | { id: number }
        | undefined;
      if (!role) {
        res.status(400).json({ error: 'Yaroqsiz rol.' });
        return;
      }

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE users SET full_name = ?, phone = ?, email = ?, role_id = ?, mahalla_id = ?, updated_at = ? WHERE id = ?`
        ).run(
          fullName,
          phone,
          email,
          role.id,
          roleSlug === 'mahalla' ? mahallaId : null,
          toTashkentParts().iso,
          targetId
        );

        db.prepare(`DELETE FROM user_directions WHERE user_id = ?`).run(targetId);
        for (const dId of directionIds) {
          db.prepare(`INSERT OR IGNORE INTO user_directions (user_id, direction_id) VALUES (?, ?)`).run(
            targetId,
            dId
          );
        }

        if (permissionsOverride.length > 0) {
          db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(targetId);
          for (const po of permissionsOverride) {
            const pRow = db.prepare(`SELECT id FROM permissions WHERE slug = ?`).get(po.slug) as
              | { id: number }
              | undefined;
            if (pRow) {
              db.prepare(
                `INSERT INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, ?)`
              ).run(targetId, pRow.id, po.granted ? 1 : 0);
            }
          }
        }

        writeAuditLog(db, {
          userId: req.authUser!.id,
          username: req.authUser!.username,
          roleSlug: req.authUser!.roleSlug,
          action: 'user_updated',
          entityType: 'user',
          entityId: targetId,
          ipAddress: getClientIp(req),
          details: { roleSlug, mahallaId, directionIds },
        });
      });

      tx();
      res.json({ message: 'Foydalanuvchi maʼlumotlari yangilandi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.post('/api/users/:id/block', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      const confirmPassword = String(req.body?.confirmPassword || '');
      const block = Boolean(req.body?.blocked);

      const adminRow = db
        .prepare(`SELECT password_hash FROM users WHERE id = ?`)
        .get(req.authUser!.id) as { password_hash: string };
      if (!verifyPassword(confirmPassword, adminRow.password_hash)) {
        res.status(403).json({ error: 'Muhim amal uchun joriy parolingizni tasdiqlang.' });
        return;
      }
      if (targetId === req.authUser!.id) {
        res.status(400).json({ error: "O'zingizni bloklay olmaysiz." });
        return;
      }

      db.prepare(`UPDATE users SET is_blocked = ?, updated_at = ? WHERE id = ?`).run(
        block ? 1 : 0,
        toTashkentParts().iso,
        targetId
      );
      if (block) {
        db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(targetId);
      }

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: block ? 'user_blocked' : 'user_unblocked',
        entityType: 'user',
        entityId: targetId,
        ipAddress: getClientIp(req),
        severity: 'warning',
      });

      res.json({ message: block ? 'Foydalanuvchi bloklandi.' : 'Blokdan chiqarildi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.post('/api/users/:id/reset-password', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const targetId = Number(req.params.id);
      const confirmPassword = String(req.body?.confirmPassword || '');
      const newTemporaryPassword = String(req.body?.temporaryPassword || '');

      const adminRow = db
        .prepare(`SELECT password_hash FROM users WHERE id = ?`)
        .get(req.authUser!.id) as { password_hash: string };
      if (!verifyPassword(confirmPassword, adminRow.password_hash)) {
        res.status(403).json({ error: 'Muhim amal uchun joriy parolingizni tasdiqlang.' });
        return;
      }
      if (newTemporaryPassword.length < 8) {
        res.status(400).json({ error: 'Vaqtinchalik parol kamida 8 belgi bo‘lsin.' });
        return;
      }

      db.prepare(
        `UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`
      ).run(hashPassword(newTemporaryPassword), toTashkentParts().iso, targetId);
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(targetId);

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: 'user_password_reset',
        entityType: 'user',
        entityId: targetId,
        ipAddress: getClientIp(req),
        severity: 'warning',
      });

      res.json({ message: 'Parol tiklandi. Foydalanuvchi birinchi kirishda yangi parol kiritadi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Mahalla CRUD for Super Admin
  app.post('/api/mahallas', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const code = sanitizeText(req.body?.code, 20).toUpperCase();
      const name = sanitizeText(req.body?.name, 100);
      const sector = sanitizeText(req.body?.sector, 40) || '1-sektor';
      const populationBase = Math.max(0, Number(req.body?.populationBase || 0));
      if (!code || !name) {
        res.status(400).json({ error: 'Mahalla kodi va nomi majburiy.' });
        return;
      }
      const r = db
        .prepare(
          `INSERT INTO mahallas (code, name, sector, population_base, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
        )
        .run(code, name, sector, populationBase, toTashkentParts().iso);

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: 'mahalla_created',
        entityType: 'mahalla',
        entityId: Number(r.lastInsertRowid),
        ipAddress: getClientIp(req),
        details: { code, name, sector },
      });

      res.status(201).json({ message: 'Mahalla yaratildi.', id: Number(r.lastInsertRowid) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  app.put('/api/mahallas/:id', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const name = sanitizeText(req.body?.name, 100);
      const sector = sanitizeText(req.body?.sector, 40);
      const isActive = req.body?.isActive ? 1 : 0;
      db.prepare(`UPDATE mahallas SET name = ?, sector = ?, is_active = ? WHERE id = ?`).run(
        name,
        sector,
        isActive,
        id
      );
      res.json({ message: 'Mahalla yangilandi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Security & Audit
  app.get('/api/security/overview', requireAuth, requirePermission('security.view'), (_req: Request, res: Response) => {
    const logs = db
      .prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 100`)
      .all();

    const activeSessions = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > ?`)
        .get(toTashkentParts().iso) as { cnt: number }
    ).cnt;

    const blockedUsers = (
      db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE is_blocked = 1`).get() as { cnt: number }
    ).cnt;

    const securityAlerts = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM audit_logs WHERE severity IN ('warning', 'critical')`
        )
        .get() as { cnt: number }
    ).cnt;

    res.json({
      stats: { activeSessions, blockedUsers, securityAlerts },
      logs,
    });
  });

  // System Settings
  app.get('/api/settings', requireAuth, requireRole('super_admin'), (_req: Request, res: Response) => {
    const rows = db.prepare(`SELECT * FROM system_settings ORDER BY key ASC`).all();
    res.json({ settings: rows });
  });

  app.put('/api/settings', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const confirmPassword = String(req.body?.confirmPassword || '');
      const adminRow = db
        .prepare(`SELECT password_hash FROM users WHERE id = ?`)
        .get(req.authUser!.id) as { password_hash: string };
      if (!verifyPassword(confirmPassword, adminRow.password_hash)) {
        res.status(403).json({ error: 'Sozlamalarni o‘zgartirish uchun parolingizni tasdiqlang.' });
        return;
      }

      const updates = req.body?.settings as Record<string, string> | undefined;
      if (!updates || typeof updates !== 'object') {
        res.status(400).json({ error: "Sozlamalar obyekti yuborilmadi." });
        return;
      }

      const nowIso = toTashkentParts().iso;
      const stmt = db.prepare(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      );
      const tx = db.transaction(() => {
        for (const [k, v] of Object.entries(updates)) {
          stmt.run(sanitizeText(k, 60), sanitizeText(String(v), 250), req.authUser!.id, nowIso);
        }
        writeAuditLog(db, {
          userId: req.authUser!.id,
          username: req.authUser!.username,
          roleSlug: req.authUser!.roleSlug,
          action: 'settings_updated',
          entityType: 'system_settings',
          ipAddress: getClientIp(req),
          severity: 'warning',
          details: updates,
        });
      });
      tx();

      res.json({ message: 'Tizim sozlamalari saqlandi.' });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Backup export for Super Admin
  app.post('/api/backup/export', requireAuth, requireRole('super_admin'), (req: Request, res: Response) => {
    try {
      const confirmPassword = String(req.body?.confirmPassword || '');
      const adminRow = db
        .prepare(`SELECT password_hash FROM users WHERE id = ?`)
        .get(req.authUser!.id) as { password_hash: string };
      if (!verifyPassword(confirmPassword, adminRow.password_hash)) {
        res.status(403).json({ error: 'Zaxira nusxa olish uchun parolingizni tasdiqlang.' });
        return;
      }

      const backup = {
        exportedAt: toTashkentParts().iso,
        system: 'Mirzaobod PF-193 Monitoring',
        mahallas: db.prepare(`SELECT * FROM mahallas`).all(),
        directions: db.prepare(`SELECT * FROM directions`).all(),
        indicators: db.prepare(`SELECT * FROM indicators`).all(),
        indicatorValues: db.prepare(`SELECT * FROM indicator_values`).all(),
        indicatorHistories: db.prepare(`SELECT * FROM indicator_histories`).all(),
        approvals: db.prepare(`SELECT * FROM approvals`).all(),
        dataImports: db.prepare(`SELECT * FROM data_imports`).all(),
        reportSnapshots: db.prepare(`SELECT * FROM report_snapshots`).all(),
        systemSettings: db.prepare(`SELECT * FROM system_settings`).all(),
      };

      writeAuditLog(db, {
        userId: req.authUser!.id,
        username: req.authUser!.username,
        roleSlug: req.authUser!.roleSlug,
        action: 'backup_exported',
        entityType: 'system',
        ipAddress: getClientIp(req),
        severity: 'warning',
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pf193_backup_${toTashkentParts().dateStr}.json"`
      );
      res.send(JSON.stringify(backup, null, 2));
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    const rows = db
      .prepare(
        `SELECT * FROM notifications
         WHERE user_id = ? OR role_slug = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 25`
      )
      .all(user.id, user.roleSlug);
    res.json({ notifications: rows });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: Request, res: Response) => {
    const user = req.authUser!;
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? OR role_slug = ?`).run(
      user.id,
      user.roleSlug
    );
    res.json({ ok: true });
  });
}
