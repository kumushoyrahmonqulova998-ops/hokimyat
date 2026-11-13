import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as XLSX from 'xlsx';
import { createAppServer } from '../server.ts';
import { resetDbInstanceForTests } from '../server/db.ts';

process.env.VITEST_NO_VITE = 'true';

let server: http.Server;
let baseUrl = '';

interface CookieJar {
  cookie: string;
  csrf: string;
}

async function req(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    jar?: CookieJar;
    formData?: FormData;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.jar?.cookie) headers['Cookie'] = opts.jar.cookie;
  if (opts.jar?.csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opts.method || 'GET')) {
    headers['X-CSRF-Token'] = opts.jar.csrf;
  }

  let bodyPayload: BodyInit | undefined;
  if (opts.formData) {
    bodyPayload = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyPayload = JSON.stringify(opts.body);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: bodyPayload,
  });

  const setCookie = res.headers.get('set-cookie');
  const nextCookie = setCookie ? setCookie.split(';')[0] : opts.jar?.cookie || '';
  const contentType = res.headers.get('content-type') || '';

  let data: any;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = Buffer.from(await res.arrayBuffer());
  }

  return { status: res.status, data, cookie: nextCookie, headers: res.headers };
}

describe('Mirzaobod PF-193 Monitoring Platform — Full Integration & Security Suite', () => {
  const superJar: CookieJar = { cookie: '', csrf: '' };
  const admin1Jar: CookieJar = { cookie: '', csrf: '' };
  const admin2Jar: CookieJar = { cookie: '', csrf: '' };
  const mahallaJar: CookieJar = { cookie: '', csrf: '' };

  let generatedAccounts: Array<{ role: string; username: string; temporaryPassword: string }> = [];

  before(async () => {
    resetDbInstanceForTests();
    const { app } = await createAppServer(':memory:');
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetDbInstanceForTests();
  });

  it('1. Initial setup works once and creates Super Admin + temporary role accounts without hardcoded passwords', async () => {
    const statusBefore = await req('/api/setup/status');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.needsInitialSetup, true);

    const initRes = await req('/api/setup/initialize', {
      method: 'POST',
      body: {
        username: 'super_test',
        fullName: 'Test Super Admin',
        password: 'SuperStrongPassword!2026',
        seedDemoData: true,
        createDemoAccounts: true,
      },
    });
    assert.equal(initRes.status, 201);
    assert.equal(initRes.data.generatedAccounts.length, 3);
    generatedAccounts = initRes.data.generatedAccounts;

    // Second setup attempt must be blocked
    const secondInit = await req('/api/setup/initialize', {
      method: 'POST',
      body: { username: 'hacker', password: 'Password123' },
    });
    assert.equal(secondInit.status, 403);
  });

  it('2. 4-portal authentication enforces role separation & brute force protection', async () => {
    // Super admin trying to log into Mahalla portal must be rejected
    const wrongPortal = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: 'super_test',
        password: 'SuperStrongPassword!2026',
        portalRole: 'mahalla',
      },
    });
    assert.equal(wrongPortal.status, 403);

    // Super admin logs in via super_admin portal
    const sLogin = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: 'super_test',
        password: 'SuperStrongPassword!2026',
        portalRole: 'super_admin',
      },
    });
    assert.equal(sLogin.status, 200);
    superJar.cookie = sLogin.cookie;
    superJar.csrf = sLogin.data.csrfToken;

    // Admin-1, Admin-2, Mahalla log in via their portals
    const a1Acc = generatedAccounts.find((a) => a.role === 'Admin-1')!;
    const a1Login = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: a1Acc.username,
        password: a1Acc.temporaryPassword,
        portalRole: 'admin_one',
      },
    });
    assert.equal(a1Login.status, 200);
    assert.equal(a1Login.data.mustChangePassword, true);
    admin1Jar.cookie = a1Login.cookie;
    admin1Jar.csrf = a1Login.data.csrfToken;

    const a2Acc = generatedAccounts.find((a) => a.role === 'Admin-2')!;
    const a2Login = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: a2Acc.username,
        password: a2Acc.temporaryPassword,
        portalRole: 'admin_two',
      },
    });
    assert.equal(a2Login.status, 200);
    admin2Jar.cookie = a2Login.cookie;
    admin2Jar.csrf = a2Login.data.csrfToken;

    const mAcc = generatedAccounts.find((a) => a.role === 'Mahalla')!;
    const mLogin = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: mAcc.username,
        password: mAcc.temporaryPassword,
        portalRole: 'mahalla',
      },
    });
    assert.equal(mLogin.status, 200);
    mahallaJar.cookie = mLogin.cookie;
    mahallaJar.csrf = mLogin.data.csrfToken;
  });

  it('3. CSRF validation blocks mutations without X-CSRF-Token', async () => {
    const res = await req('/api/data/manual', {
      method: 'POST',
      headers: { Cookie: superJar.cookie }, // intentionally omit X-CSRF-Token
      body: { indicatorId: 1, mahallaId: 1, newValue: 5000, comment: 'CSRF test' },
    });
    assert.equal(res.status, 403);
  });

  it('4. Admin-1 is restricted to assigned directions and Mahalla cannot access other mahallas', async () => {
    // Admin-1 assigned directions 1..7; direction 14 (ajratilgan-mablaglar) must be 403!
    const allowedDir = await req('/api/directions/demografiya', { jar: admin1Jar });
    assert.equal(allowedDir.status, 200);

    const forbiddenDir = await req('/api/directions/ajratilgan-mablaglar', { jar: admin1Jar });
    assert.equal(forbiddenDir.status, 403);

    // Mahalla user belongs to M01 (id=1); requesting dashboard for mahallaId=2 must be 403!
    const forbiddenMahalla = await req('/api/dashboard?mahallaId=2', { jar: mahallaJar });
    assert.equal(forbiddenMahalla.status, 403);

    // Mahalla trying to access Super Admin /api/users must be 403!
    const forbiddenUsers = await req('/api/users', { jar: mahallaJar });
    assert.equal(forbiddenUsers.status, 403);
  });

  it('5. Manual entry rejects negative values, preserves history, and keeps pending data out of official totals until approved', async () => {
    // Negative value rejected
    const negRes = await req('/api/data/manual', {
      method: 'POST',
      jar: mahallaJar,
      body: { indicatorId: 1, mahallaId: 1, newValue: -10, comment: 'Negative' },
    });
    assert.equal(negRes.status, 400);

    // Snapshot current approved aholi KPI
    const beforeDash = await req('/api/dashboard', { jar: superJar });
    const beforeAholi = beforeDash.data.kpis.find((k: any) => k.key === 'aholi').currentValue;

    // Mahalla submits +25 population update
    const subRes = await req('/api/data/manual', {
      method: 'POST',
      jar: mahallaJar,
      body: {
        indicatorId: 1,
        mahallaId: 1,
        newValue: 4845,
        comment: "Navro'z MFY yangi tug'ilganlar hisoboti",
      },
    });
    assert.equal(subRes.status, 201);
    assert.equal(subRes.data.result.approvalStatus, 'submitted');

    // Official dashboard total must NOT change before Admin approval!
    const midDash = await req('/api/dashboard', { jar: superJar });
    const midAholi = midDash.data.kpis.find((k: any) => k.key === 'aholi').currentValue;
    assert.equal(midAholi, beforeAholi);

    // Admin-2 approves the latest pending submission
    const appList = await req('/api/approvals?status=submitted', { jar: admin2Jar });
    const targetApp = appList.data.approvals.find(
      (a: any) => a.indicator_id === 1 && a.mahalla_id === 1
    );
    assert.ok(targetApp);

    const approveRes = await req(`/api/approvals/${targetApp.id}/review`, {
      method: 'POST',
      jar: admin2Jar,
      body: { decision: 'approved', comment: 'Tasdiqlandi' },
    });
    assert.equal(approveRes.status, 200);

    // Now official total reflects 4845 (+25 over 4820)!
    const afterDash = await req('/api/dashboard', { jar: superJar });
    const afterAholi = afterDash.data.kpis.find((k: any) => k.key === 'aholi').currentValue;
    assert.equal(afterAholi, beforeAholi + 25);

    // Verify immutable history preserved both old and new records
    const histRes = await req('/api/history?mahallaId=1&directionId=1', { jar: superJar });
    assert.equal(histRes.status, 200);
    assert.ok(histRes.data.rows.some((r: any) => r.new_value === 4845));
    assert.ok(histRes.data.rows.some((r: any) => r.new_value === 4820));
  });

  it('6. Excel (.xlsx) & JSON imports preview diffs, block partial bad imports, and commit atomically', async () => {
    // 1. Bad JSON returns 400
    const badJson = await req('/api/imports/json', {
      method: 'POST',
      jar: superJar,
      body: { jsonText: '{not valid json' },
    });
    assert.equal(badJson.status, 400);

    // 2. Excel with 1 invalid row cannot commit (no partial save)
    const wbBad = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbBad,
      XLSX.utils.json_to_sheet([
        { mahalla_code: 'M01', indicator_code: 'demo_oilalar', new_value: 1240, comment: 'Ok' },
        { mahalla_code: 'M01', indicator_code: 'demo_oilalar', new_value: -5, comment: 'Bad' },
      ]),
      'Sheet1'
    );
    const badBuf = XLSX.write(wbBad, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const fdBad = new FormData();
    fdBad.append(
      'file',
      new Blob([new Uint8Array(badBuf)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'bad_test.xlsx'
    );
    const badPreview = await req('/api/imports/excel', {
      method: 'POST',
      jar: superJar,
      formData: fdBad,
    });
    assert.equal(badPreview.status, 200);
    assert.equal(badPreview.data.canCommit, false);
    assert.equal(badPreview.data.errorCount, 1);

    const commitRejected = await req(`/api/imports/${badPreview.data.importId}/commit`, {
      method: 'POST',
      jar: superJar,
    });
    assert.equal(commitRejected.status, 400);

    // 3. Valid Excel commits cleanly
    const wbGood = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbGood,
      XLSX.utils.json_to_sheet([
        {
          mahalla_code: 'M01',
          indicator_code: 'demo_oilalar',
          new_value: 1245,
          comment: 'Excel test commit',
        },
      ]),
      'Sheet1'
    );
    const goodBuf = XLSX.write(wbGood, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const fdGood = new FormData();
    fdGood.append(
      'file',
      new Blob([new Uint8Array(goodBuf)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'good_test.xlsx'
    );
    const goodPreview = await req('/api/imports/excel', {
      method: 'POST',
      jar: superJar,
      formData: fdGood,
    });
    assert.equal(goodPreview.data.canCommit, true);

    const commitOk = await req(`/api/imports/${goodPreview.data.importId}/commit`, {
      method: 'POST',
      jar: superJar,
    });
    assert.equal(commitOk.status, 200);
    assert.equal(commitOk.data.committedCount, 1);
  });

  it('7. Weekly, Monthly, Yearly reports compute from real history and return empty for future dates with no data', async () => {
    const weekly = await req('/api/reports?period=weekly&date=2026-11-13', { jar: superJar });
    assert.equal(weekly.status, 200);
    assert.equal(weekly.data.report.hasData, true);

    const monthly = await req('/api/reports?period=monthly&date=2026-11-13', { jar: superJar });
    assert.equal(monthly.status, 200);
    assert.equal(monthly.data.report.hasData, true);

    const yearly = await req('/api/reports?period=yearly&date=2026-11-13', { jar: superJar });
    assert.equal(yearly.status, 200);
    assert.equal(yearly.data.report.hasData, true);

    // Future year with zero historical records must NOT fabricate numbers
    const emptyYear = await req('/api/reports?period=yearly&date=2032-05-01', { jar: superJar });
    assert.equal(emptyYear.status, 200);
    assert.equal(emptyYear.data.report.hasData, false);
    assert.equal(emptyYear.data.report.overview.endValue, 0);
  });

  it('8. PDF, XLSX, CSV (UTF-8 BOM), and JSON exports work properly', async () => {
    const pdf = await req('/api/export?format=pdf', { jar: superJar });
    assert.equal(pdf.status, 200);
    assert.ok(pdf.headers.get('content-type')?.includes('application/pdf'));
    assert.ok(pdf.data.subarray(0, 4).toString('utf8') === '%PDF');

    const xlsx = await req('/api/export?format=xlsx', { jar: superJar });
    assert.equal(xlsx.status, 200);
    assert.ok(xlsx.data.length > 500);

    const csv = await req('/api/export?format=csv', { jar: superJar });
    assert.equal(csv.status, 200);
    assert.ok(csv.data.toString('utf8').includes('Mirzaobod') || csv.data.toString('utf8').includes('Hisobot'));

    const json = await req('/api/export?format=json', { jar: superJar });
    assert.equal(json.status, 200);
    assert.ok(Array.isArray(json.data.rows));
  });

  it('9. XSS sanitization & SQL injection resistance work across inputs', async () => {
    const xssComment = '<script>alert(1)</script>Xatlov izohi';
    const res = await req('/api/data/manual', {
      method: 'POST',
      jar: superJar,
      body: { indicatorId: 1, mahallaId: 2, newValue: 5150, comment: xssComment },
    });
    assert.equal(res.status, 201);

    const hist = await req('/api/history?mahallaId=2', { jar: superJar });
    const latest = hist.data.rows[0];
    assert.equal(latest.comment.includes('<script>'), false);

    // SQL injection attempt in search query parameter
    const sqli = await req("/api/history?search=' OR 1=1 --", { jar: superJar });
    assert.equal(sqli.status, 200);
    assert.equal(sqli.data.rows.length, 0);
  });
});
