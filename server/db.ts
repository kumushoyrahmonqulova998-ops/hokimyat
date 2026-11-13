import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  DIRECTIONS,
  INDICATORS,
  MAHALLA_CATALOG,
  PERMISSIONS_CATALOG,
  ROLE_DEFINITIONS,
  toTashkentParts,
} from './config.ts';

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;

  const resolvedPath =
    customPath ||
    process.env.DB_PATH ||
    path.resolve(process.cwd(), 'data', 'mirzaobod_pf193.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  initSchema(db);
  seedReferenceCatalog(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbInstanceForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mahallas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      sector TEXT NOT NULL DEFAULT '1-sektor',
      population_base INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      mahalla_id INTEGER NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT NULL,
      last_login_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
    CREATE INDEX IF NOT EXISTS idx_users_mahalla ON users(mahalla_id);

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS directions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sort_order INTEGER NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Layers'
    );

    CREATE TABLE IF NOT EXISTS user_directions (
      user_id INTEGER NOT NULL,
      direction_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, direction_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (direction_id) REFERENCES directions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'integer',
      is_target_metric INTEGER NOT NULL DEFAULT 0,
      is_negative_good INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (direction_id) REFERENCES directions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_indicators_direction ON indicators(direction_id);

    CREATE TABLE IF NOT EXISTS indicator_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator_id INTEGER NOT NULL,
      mahalla_id INTEGER NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      previous_value REAL NOT NULL DEFAULT 0,
      approved_value REAL NOT NULL DEFAULT 0,
      pending_value REAL NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      last_updated_by INTEGER NULL,
      last_updated_at TEXT NOT NULL,
      last_approved_by INTEGER NULL,
      last_approved_at TEXT NULL,
      UNIQUE (indicator_id, mahalla_id),
      FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE,
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id) ON DELETE CASCADE,
      FOREIGN KEY (last_updated_by) REFERENCES users(id),
      FOREIGN KEY (last_approved_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_iv_indicator ON indicator_values(indicator_id);
    CREATE INDEX IF NOT EXISTS idx_iv_mahalla ON indicator_values(mahalla_id);
    CREATE INDEX IF NOT EXISTS idx_iv_status ON indicator_values(approval_status);

    CREATE TABLE IF NOT EXISTS data_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      direction_id INTEGER NULL,
      mahalla_id INTEGER NULL,
      uploaded_by INTEGER NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      success_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'preview',
      created_at TEXT NOT NULL,
      committed_at TEXT NULL,
      FOREIGN KEY (direction_id) REFERENCES directions(id),
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_imports_user ON data_imports(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_imports_created ON data_imports(created_at);

    CREATE TABLE IF NOT EXISTS data_import_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      mahalla_code TEXT NOT NULL,
      indicator_code TEXT NOT NULL,
      old_value REAL NULL,
      new_value REAL NULL,
      status TEXT NOT NULL,
      error_message TEXT NULL,
      raw_json TEXT NOT NULL,
      FOREIGN KEY (import_id) REFERENCES data_imports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_import_rows_import ON data_import_rows(import_id);

    CREATE TABLE IF NOT EXISTS indicator_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator_id INTEGER NOT NULL,
      mahalla_id INTEGER NOT NULL,
      old_value REAL NOT NULL DEFAULT 0,
      new_value REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0,
      percent_change REAL NOT NULL DEFAULT 0,
      changed_by INTEGER NULL,
      changed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      import_id INTEGER NULL,
      approval_status TEXT NOT NULL DEFAULT 'submitted',
      comment TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE RESTRICT,
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id) ON DELETE RESTRICT,
      FOREIGN KEY (changed_by) REFERENCES users(id),
      FOREIGN KEY (import_id) REFERENCES data_imports(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ih_ind_mah_date ON indicator_histories(indicator_id, mahalla_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_ih_changed_at ON indicator_histories(changed_at);
    CREATE INDEX IF NOT EXISTS idx_ih_status ON indicator_histories(approval_status);

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      history_id INTEGER NOT NULL,
      indicator_id INTEGER NOT NULL,
      mahalla_id INTEGER NOT NULL,
      submitted_by INTEGER NULL,
      reviewed_by INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      decision_comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      reviewed_at TEXT NULL,
      FOREIGN KEY (history_id) REFERENCES indicator_histories(id) ON DELETE CASCADE,
      FOREIGN KEY (indicator_id) REFERENCES indicators(id),
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_approvals_mahalla ON approvals(mahalla_id);

    CREATE TABLE IF NOT EXISTS report_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT NOT NULL,
      period_key TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      direction_id INTEGER NULL,
      mahalla_id INTEGER NULL,
      summary_json TEXT NOT NULL,
      generated_by INTEGER NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (direction_id) REFERENCES directions(id),
      FOREIGN KEY (mahalla_id) REFERENCES mahallas(id),
      FOREIGN KEY (generated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      username TEXT NOT NULL DEFAULT 'system',
      role_slug TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'info',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by INTEGER NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      role_slug TEXT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      link TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
  `);
}

export function seedReferenceCatalog(db: Database.Database): void {
  const now = toTashkentParts().iso;

  const tx = db.transaction(() => {
    const insertRole = db.prepare(
      `INSERT OR IGNORE INTO roles (slug, name, description) VALUES (?, ?, ?)`
    );
    for (const r of ROLE_DEFINITIONS) {
      insertRole.run(r.slug, r.name, r.description);
    }

    const insertPerm = db.prepare(
      `INSERT OR IGNORE INTO permissions (slug, name, group_name) VALUES (?, ?, ?)`
    );
    for (const p of PERMISSIONS_CATALOG) {
      insertPerm.run(p.slug, p.name, p.groupName);
    }

    const getRole = db.prepare(`SELECT id FROM roles WHERE slug = ?`);
    const getPerm = db.prepare(`SELECT id FROM permissions WHERE slug = ?`);
    const insertRolePerm = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`
    );
    for (const r of ROLE_DEFINITIONS) {
      const roleRow = getRole.get(r.slug) as { id: number } | undefined;
      if (!roleRow) continue;
      for (const pSlug of r.permissions) {
        const permRow = getPerm.get(pSlug) as { id: number } | undefined;
        if (permRow) {
          insertRolePerm.run(roleRow.id, permRow.id);
        }
      }
    }

    const insertMahalla = db.prepare(
      `INSERT OR IGNORE INTO mahallas (code, name, sector, population_base, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
    );
    for (const m of MAHALLA_CATALOG) {
      insertMahalla.run(m.code, m.name, m.sector, m.populationBase, now);
    }

    const insertDirection = db.prepare(
      `INSERT OR IGNORE INTO directions (sort_order, slug, name, short_name, description, icon) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const d of DIRECTIONS) {
      insertDirection.run(d.sortOrder, d.slug, d.name, d.shortName, d.description, d.icon);
    }

    const getDir = db.prepare(`SELECT id FROM directions WHERE slug = ?`);
    const insertInd = db.prepare(
      `INSERT OR IGNORE INTO indicators (direction_id, code, name, unit, value_type, is_target_metric, is_negative_good, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ind of INDICATORS) {
      const dirRow = getDir.get(ind.directionSlug) as { id: number } | undefined;
      if (!dirRow) continue;
      insertInd.run(
        dirRow.id,
        ind.code,
        ind.name,
        ind.unit,
        ind.valueType,
        ind.isTargetMetric ? 1 : 0,
        ind.isNegativeGood ? 1 : 0,
        ind.sortOrder
      );
    }

    const defaultSettings: Array<[string, string]> = [
      ['system_name', 'Mirzaobod PF-193 Monitoring'],
      ['hokimlik_name', 'Mirzaobod tumani hokimligi'],
      ['default_period', 'monthly'],
      ['max_import_size_mb', '10'],
      ['max_login_attempts', '5'],
      ['lockout_minutes', '15'],
      ['session_ttl_hours', '12'],
      ['timezone', 'Asia/Tashkent'],
    ];
    const insertSetting = db.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)`
    );
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v, now);
    }
  });

  tx();
}

export function seedHistoricalPf193Data(db: Database.Database, actorUserId: number | null): { seededRows: number } {
  const existingCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM indicator_histories`).get() as { cnt: number }
  ).cnt;
  if (existingCount > 0) {
    return { seededRows: 0 };
  }

  const mahallas = db
    .prepare(`SELECT id, code, population_base FROM mahallas ORDER BY id ASC`)
    .all() as Array<{ id: number; code: string; population_base: number }>;

  const indicators = db
    .prepare(`SELECT id, code, direction_id, value_type FROM indicators ORDER BY id ASC`)
    .all() as Array<{ id: number; code: string; direction_id: number; value_type: string }>;

  // Realistic multi-week / multi-month historical snapshots across 2026
  const checkpoints = [
    { date: '2026-09-15T10:15:00+05:00', factor: 0.86, label: "Sentyabr o'rtasi bazaviy yig'im" },
    { date: '2026-10-01T09:30:00+05:00', factor: 0.91, label: '1-oktabr oylik kesim' },
    { date: '2026-10-15T11:20:00+05:00', factor: 0.94, label: '15-oktabr haftalik monitoring' },
    { date: '2026-11-02T10:05:00+05:00', factor: 0.97, label: 'Noyabr boshi yangilanishi' },
    { date: '2026-11-09T14:10:00+05:00', factor: 0.99, label: 'Haftalik tekshiruv natijasi' },
    { date: '2026-11-13T11:45:00+05:00', factor: 1.0, label: 'Bugungi tasdiqlangan holat' },
  ];

  const computeBaseTarget = (code: string, pop: number, idx: number): number => {
    const families = Math.round(pop / 3.9);
    const seedJitter = ((idx % 5) + 8) / 10; // 0.8 .. 1.2
    const map: Record<string, number> = {
      demo_aholi: pop,
      demo_oilalar: families,
      demo_ayollar: Math.round(pop * 0.496),
      demo_erkaklar: pop - Math.round(pop * 0.496),
      demo_voyaga_yetmagan: Math.round(pop * 0.31),
      demo_yoshlar: Math.round(pop * 0.27),

      reyestr_oilalar: Math.round(families * 0.14 * seedJitter),
      reyestr_fuqarolar: Math.round(pop * 0.13 * seedJitter),
      reyestr_davlat_taminot: Math.round(families * 0.045 * seedJitter),
      reyestr_kambagal: Math.round(families * 0.065 * seedJitter),
      reyestr_chegaradagi: Math.round(families * 0.03 * seedJitter),

      bandlik_ishsizlar: Math.round(145 * seedJitter),
      bandlik_ishga_joy: Math.round(74 * seedJitter),
      bandlik_ozini_band: Math.round(48 * seedJitter),
      bandlik_qolgan: Math.round(23 * seedJitter),

      tadbirkor_ehtiyoj: Math.round(38 * seedJitter),
      tadbirkor_kredit_olgan: Math.round(27 * seedJitter),
      tadbirkor_loyihalar: Math.round(19 * seedJitter),
      tadbirkor_kredit_summa: Math.round(1420 * seedJitter),
      tadbirkor_ish_orin: Math.round(54 * seedJitter),

      norasmiy_aniqlangan: Math.round(112 * seedJitter),
      norasmiy_rasmiy: Math.round(89 * seedJitter),
      norasmiy_qolgan: Math.round(23 * seedJitter),

      subs_ehtiyoj: Math.round(44 * seedJitter),
      subs_murojaat: Math.round(39 * seedJitter),
      subs_ajratilgan: Math.round(31 * seedJitter),
      subs_yordam_olgan: Math.round(31 * seedJitter),
      subs_mablag: Math.round(285 * seedJitter),

      kasb_yuborilgan: Math.round(56 * seedJitter),
      kasb_tugatgan: Math.round(44 * seedJitter),
      kasb_sertifikat: Math.round(42 * seedJitter),
      kasb_ishga_joy: Math.round(36 * seedJitter),

      mtt_ehtiyoj: Math.round(240 * seedJitter),
      mtt_qamralgan: Math.round(198 * seedJitter),
      mtt_navbat: Math.round(42 * seedJitter),
      mtt_xizmat: Math.round(205 * seedJitter),

      tib_bemorlar: Math.round(92 * seedJitter),
      tib_korik: Math.round(88 * seedJitter),
      tib_davolangan: Math.round(69 * seedJitter),
      tib_doridarmon: Math.round(74 * seedJitter),
      tib_qolgan: Math.round(18 * seedJitter),

      uy_ehtiyoj: Math.round(26 * seedJitter),
      uy_tamirlash: Math.round(19 * seedJitter),
      uy_kadastr: Math.round(34 * seedJitter),
      uy_bajarilgan: Math.round(29 * seedJitter),

      moddiy_muhtoj: Math.round(48 * seedJitter),
      moddiy_olgan: Math.round(41 * seedJitter),
      moddiy_mablag: Math.round(165 * seedJitter),

      kom_qarzdor: Math.round(64 * seedJitter),
      kom_muhtoj: Math.round(35 * seedJitter),
      kom_yordam: Math.round(28 * seedJitter),
      kom_mablag: Math.round(94 * seedJitter),

      korx_soni: Math.round(7 * seedJitter),
      korx_kredit: Math.round(4 * seedJitter),
      korx_saqlangan_ish: Math.round(84 * seedJitter),
      korx_reja_ish: Math.round(96 * seedJitter),

      mab_ajratilgan: Math.round(2150 * seedJitter),
      mab_sarflangan: Math.round(1820 * seedJitter),
      mab_qolgan: Math.round(330 * seedJitter),
    };
    return map[code] ?? Math.round(40 * seedJitter);
  };

  let inserted = 0;

  const tx = db.transaction(() => {
    const insertHistory = db.prepare(`
      INSERT INTO indicator_histories
      (indicator_id, mahalla_id, old_value, new_value, difference, percent_change, changed_by, changed_at, source, approval_status, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'approved', ?)
    `);

    const upsertValue = db.prepare(`
      INSERT INTO indicator_values
      (indicator_id, mahalla_id, current_value, previous_value, approved_value, pending_value, approval_status, last_updated_by, last_updated_at, last_approved_by, last_approved_at)
      VALUES (?, ?, ?, ?, ?, NULL, 'approved', ?, ?, ?, ?)
      ON CONFLICT(indicator_id, mahalla_id) DO UPDATE SET
        current_value = excluded.current_value,
        previous_value = excluded.previous_value,
        approved_value = excluded.approved_value,
        approval_status = excluded.approval_status,
        last_updated_by = excluded.last_updated_by,
        last_updated_at = excluded.last_updated_at,
        last_approved_by = excluded.last_approved_by,
        last_approved_at = excluded.last_approved_at
    `);

    const insertApproval = db.prepare(`
      INSERT INTO approvals (history_id, indicator_id, mahalla_id, submitted_by, reviewed_by, status, decision_comment, created_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let mIdx = 0; mIdx < mahallas.length; mIdx++) {
      const m = mahallas[mIdx];
      for (const ind of indicators) {
        const finalTarget = computeBaseTarget(ind.code, m.population_base, mIdx);
        let prevVal = 0;
        let lastVal = 0;

        for (let cIdx = 0; cIdx < checkpoints.length; cIdx++) {
          const cp = checkpoints[cIdx];
          // For negative-good metrics (qolgan, qarzdor), make them decrease over time!
          const isReducing =
            ind.code.endsWith('_qolgan') ||
            ind.code === 'mtt_navbat' ||
            ind.code === 'kom_qarzdor' ||
            ind.code === 'reyestr_kambagal';

          const val = isReducing
            ? Math.max(0, Math.round(finalTarget * (2 - cp.factor)))
            : Math.max(0, Math.round(finalTarget * cp.factor));

          const oldVal = cIdx === 0 ? 0 : prevVal;
          const diff = Number((val - oldVal).toFixed(2));
          const pct = oldVal > 0 ? Number(((diff / oldVal) * 100).toFixed(2)) : 0;

          insertHistory.run(
            ind.id,
            m.id,
            oldVal,
            val,
            diff,
            pct,
            actorUserId,
            cp.date,
            cp.label
          );
          inserted++;

          if (cIdx === checkpoints.length - 2) {
            lastVal = val;
          }
          prevVal = val;
        }

        const finalCp = checkpoints[checkpoints.length - 1];
        upsertValue.run(
          ind.id,
          m.id,
          prevVal,
          lastVal,
          prevVal,
          actorUserId,
          finalCp.date,
          actorUserId,
          finalCp.date
        );
      }
    }

    // Add 3 realistic pending submissions from mahallas on 2026-11-13 so "Tekshirish kutilmoqda" works out of the box
    const pendingTargets = [
      { mIdx: 0, code: 'bandlik_ishga_joy', delta: 6, comment: "Navro'z MFY yangi ish o'rinlari hisoboti" },
      { mIdx: 1, code: 'reyestr_oilalar', delta: 4, comment: 'Mustaqillik MFY ijtimoiy reyestr yangilanishi' },
      { mIdx: 4, code: 'subs_ajratilgan', delta: 3, comment: "Mirzo Ulug'bek MFY subsidiya ajratilishi" },
    ];

    for (const pt of pendingTargets) {
      const m = mahallas[pt.mIdx];
      const ind = indicators.find((i) => i.code === pt.code);
      if (!m || !ind) continue;
      const cur = db
        .prepare(`SELECT current_value FROM indicator_values WHERE indicator_id = ? AND mahalla_id = ?`)
        .get(ind.id, m.id) as { current_value: number } | undefined;
      if (!cur) continue;

      const oldVal = cur.current_value;
      const newVal = oldVal + pt.delta;
      const diff = pt.delta;
      const pct = oldVal > 0 ? Number(((diff / oldVal) * 100).toFixed(2)) : 0;
      const ts = '2026-11-13T13:20:00+05:00';

      const res = insertHistory.run(
        ind.id,
        m.id,
        oldVal,
        newVal,
        diff,
        pct,
        actorUserId,
        ts,
        pt.comment
      );
      // Update pending_value WITHOUT modifying approved_value!
      db.prepare(
        `UPDATE indicator_histories SET approval_status = 'submitted' WHERE id = ?`
      ).run(res.lastInsertRowid);
      db.prepare(
        `UPDATE indicator_values SET pending_value = ?, approval_status = 'submitted', last_updated_at = ? WHERE indicator_id = ? AND mahalla_id = ?`
      ).run(newVal, ts, ind.id, m.id);

      insertApproval.run(
        res.lastInsertRowid,
        ind.id,
        m.id,
        actorUserId,
        null,
        'submitted',
        pt.comment,
        ts,
        null
      );
      inserted++;
    }
  });

  tx();
  return { seededRows: inserted };
}
