import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';
import { toTashkentParts } from './config.ts';

export const SESSION_COOKIE_NAME = 'pf193_session';

export interface AuthUserContext {
  id: number;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  roleSlug: 'super_admin' | 'admin_one' | 'admin_two' | 'mahalla';
  roleName: string;
  mahallaId: number | null;
  mahallaName: string | null;
  mahallaCode: string | null;
  mustChangePassword: boolean;
  permissions: string[];
  assignedDirectionIds: number[];
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUserContext;
      db?: Database.Database;
    }
  }
}

export function sanitizeText(input: unknown, maxLen = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export function writeAuditLog(
  db: Database.Database,
  params: {
    userId?: number | null;
    username?: string;
    roleSlug?: string;
    action: string;
    entityType: string;
    entityId?: string | number;
    ipAddress?: string;
    severity?: 'info' | 'warning' | 'critical';
    details?: Record<string, unknown>;
  }
): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, role_slug, action, entity_type, entity_id, ip_address, severity, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.username ?? 'system',
      params.roleSlug ?? 'system',
      params.action,
      params.entityType,
      String(params.entityId ?? ''),
      params.ipAddress ?? '',
      params.severity ?? 'info',
      JSON.stringify(params.details ?? {}),
      toTashkentParts().iso
    );
  } catch {
    // Avoid failing main flow if audit insert encounters transient error
  }
}

export function createNotification(
  db: Database.Database,
  params: {
    userId?: number | null;
    roleSlug?: string | null;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    link?: string;
  }
): void {
  db.prepare(
    `INSERT INTO notifications (user_id, role_slug, title, message, type, is_read, link, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    params.userId ?? null,
    params.roleSlug ?? null,
    sanitizeText(params.title, 160),
    sanitizeText(params.message, 500),
    params.type ?? 'info',
    sanitizeText(params.link ?? '', 200),
    toTashkentParts().iso
  );
}

export function loadUserPermissions(db: Database.Database, userId: number, roleId: number): string[] {
  const rolePerms = db
    .prepare(
      `SELECT p.slug FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`
    )
    .all(roleId) as Array<{ slug: string }>;

  const set = new Set(rolePerms.map((r) => r.slug));

  const overrides = db
    .prepare(
      `SELECT p.slug, up.granted FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = ?`
    )
    .all(userId) as Array<{ slug: string; granted: number }>;

  for (const ov of overrides) {
    if (ov.granted === 1) set.add(ov.slug);
    else set.delete(ov.slug);
  }

  return Array.from(set);
}

export function createSession(
  db: Database.Database,
  userId: number,
  ipAddress: string,
  userAgent: string
): { rawToken: string; csrfToken: string; expiresAt: string } {
  const ttlRow = db
    .prepare(`SELECT value FROM system_settings WHERE key = 'session_ttl_hours'`)
    .get() as { value: string } | undefined;
  const ttlHours = Math.max(1, Number(ttlRow?.value || 12));

  const rawToken = generateToken();
  const csrfToken = generateToken();
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000);
  const nowIso = toTashkentParts(now).iso;
  const expiresIso = toTashkentParts(expires).iso;

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, ip_address, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(tokenHash, userId, csrfToken, ipAddress, userAgent.slice(0, 250), expiresIso, nowIso);

  return { rawToken, csrfToken, expiresAt: expiresIso };
}

export function setSessionCookie(res: Response, rawToken: string, req: Request): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 12 * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function resolveSessionUser(db: Database.Database, rawToken?: string): AuthUserContext | null {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.user_id, s.csrf_token, s.expires_at,
              u.id, u.username, u.full_name, u.phone, u.email, u.role_id, u.mahalla_id,
              u.is_active, u.is_blocked, u.must_change_password,
              r.slug as role_slug, r.name as role_name,
              m.name as mahalla_name, m.code as mahalla_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN mahallas m ON m.id = u.mahalla_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        user_id: number;
        csrf_token: string;
        expires_at: string;
        id: number;
        username: string;
        full_name: string;
        phone: string;
        email: string;
        role_id: number;
        mahalla_id: number | null;
        is_active: number;
        is_blocked: number;
        must_change_password: number;
        role_slug: AuthUserContext['roleSlug'];
        role_name: string;
        mahalla_name: string | null;
        mahalla_code: string | null;
      }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }
  if (!row.is_active || row.is_blocked) {
    return null;
  }

  const permissions = loadUserPermissions(db, row.id, row.role_id);
  const dirs = db
    .prepare(`SELECT direction_id FROM user_directions WHERE user_id = ?`)
    .all(row.id) as Array<{ direction_id: number }>;

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    roleSlug: row.role_slug,
    roleName: row.role_name,
    mahallaId: row.mahalla_id,
    mahallaName: row.mahalla_name,
    mahallaCode: row.mahalla_code,
    mustChangePassword: row.must_change_password === 1,
    permissions,
    assignedDirectionIds: dirs.map((d) => d.direction_id),
    csrfToken: row.csrf_token,
  };
}

export function attachAuthMiddleware(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.db = db;
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      req.authUser = resolveSessionUser(db, rawToken) ?? undefined;
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Autentifikatsiya talab qilinadi. Iltimos, tizimga kiring." });
    return;
  }
  // CSRF check for mutating methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    const headerToken = req.headers['x-csrf-token'];
    if (typeof headerToken !== 'string' || headerToken !== req.authUser.csrfToken) {
      if (req.db) {
        writeAuditLog(req.db, {
          userId: req.authUser.id,
          username: req.authUser.username,
          roleSlug: req.authUser.roleSlug,
          action: 'csrf_mismatch',
          entityType: 'security',
          ipAddress: getClientIp(req),
          severity: 'critical',
          details: { path: req.path, method: req.method },
        });
      }
      res.status(403).json({ error: 'CSRF xavfsizlik tokeni yaroqsiz.' });
      return;
    }
  }
  next();
}

export function requireRole(...allowedRoles: AuthUserContext['roleSlug'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Tizimga kiring.' });
      return;
    }
    if (!allowedRoles.includes(req.authUser.roleSlug)) {
      if (req.db) {
        writeAuditLog(req.db, {
          userId: req.authUser.id,
          username: req.authUser.username,
          roleSlug: req.authUser.roleSlug,
          action: 'unauthorized_role_access',
          entityType: 'security',
          ipAddress: getClientIp(req),
          severity: 'warning',
          details: { path: req.path, requiredRoles: allowedRoles },
        });
      }
      res.status(403).json({ error: "Ushbu bo'limga kirish uchun ruxsatingiz yo'q." });
      return;
    }
    next();
  };
}

export function requirePermission(permissionSlug: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Tizimga kiring.' });
      return;
    }
    if (req.authUser.roleSlug === 'super_admin') {
      next();
      return;
    }
    if (!req.authUser.permissions.includes(permissionSlug)) {
      if (req.db) {
        writeAuditLog(req.db, {
          userId: req.authUser.id,
          username: req.authUser.username,
          roleSlug: req.authUser.roleSlug,
          action: 'permission_denied',
          entityType: 'security',
          ipAddress: getClientIp(req),
          severity: 'warning',
          details: { path: req.path, permissionSlug },
        });
      }
      res.status(403).json({ error: `Ruxsat yetarli emas: ${permissionSlug}` });
      return;
    }
    next();
  };
}

export function assertUserCanAccessDirection(user: AuthUserContext, directionId: number): boolean {
  if (user.roleSlug === 'super_admin' || user.roleSlug === 'admin_two' || user.roleSlug === 'mahalla') {
    return true;
  }
  if (user.roleSlug === 'admin_one') {
    if (user.assignedDirectionIds.length === 0) return false;
    return user.assignedDirectionIds.includes(directionId);
  }
  return false;
}

export function assertUserCanAccessMahalla(user: AuthUserContext, mahallaId: number): boolean {
  if (user.roleSlug === 'mahalla') {
    return user.mahallaId === mahallaId;
  }
  return true;
}
