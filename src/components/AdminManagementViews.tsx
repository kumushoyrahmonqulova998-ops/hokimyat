import { useEffect, useState } from 'react';
import {
  UserPlus,
  Lock,
  Unlock,
  KeyRound,
  ShieldAlert,
  DatabaseBackup,
  Plus,
  HelpCircle,
} from 'lucide-react';
import { apiJson, downloadFile, formatNum, formatTashkentDateTime } from '../lib/api.ts';
import type { AuthUser, DirectionItem, MahallaItem } from '../types.ts';

/* -------------------------------------------------------------------------- */
/* 1. Mahallas & Fair Ratings                                                 */
/* -------------------------------------------------------------------------- */
interface MahallaRatingRow {
  id: number;
  code: string;
  name: string;
  sector: string;
  population_base: number;
  is_active: number;
  bandlikPct: number;
  norasmiyPct: number;
  subsPct: number;
  mabPct: number;
  compositeIndex: number;
  tracked_indicators: number;
  last_updated_at: string | null;
}

export function MahallasRatingView({
  user,
  onChanged,
}: {
  user: AuthUser;
  onChanged: () => void;
}) {
  const [ratings, setRatings] = useState<MahallaRatingRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('1-sektor');
  const [popBase, setPopBase] = useState('4000');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    const res = await apiJson<{ ratings: MahallaRatingRow[] }>('/api/mahallas/ratings');
    setRatings(res.ratings);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const res = await apiJson<{ message: string }>('/api/mahallas', {
        method: 'POST',
        body: JSON.stringify({ code, name, sector, populationBase: Number(popBase) }),
      });
      setMsg(res.message);
      setCode('');
      setName('');
      setShowAdd(false);
      await load();
      onChanged();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Xatolik.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Mahallalar boshqaruvi va qiyosiy reyting
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reyting faqat barcha mahallalarda bir xil tasdiqlangan ko'rsatkichlar (bandlik, norasmiy sektor, subsidiya, mablag') asosida hisoblanadi
          </p>
        </div>
        {user.roleSlug === 'super_admin' && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="px-3.5 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi mahalla qo'shish</span>
          </button>
        )}
      </div>

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3"
        >
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Kodi (masalan: M13)"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
          />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mahalla nomi (MFY)"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:col-span-2"
          />
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          >
            <option value="1-sektor">1-sektor</option>
            <option value="2-sektor">2-sektor</option>
            <option value="3-sektor">3-sektor</option>
            <option value="4-sektor">4-sektor</option>
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={popBase}
              onChange={(e) => setPopBase(e.target.value)}
              placeholder="Aholi"
              className="w-24 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
            />
            <button
              type="submit"
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium"
            >
              Saqlash
            </button>
          </div>
          {err && <p className="text-xs text-red-600 sm:col-span-5">{err}</p>}
        </form>
      )}
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700">
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">O'rin</th>
                <th className="px-4 py-3">Mahalla / Kod</th>
                <th className="px-4 py-3">Sektor</th>
                <th className="px-4 py-3 text-right">Bandlik (%)</th>
                <th className="px-4 py-3 text-right">Norasmiy (%)</th>
                <th className="px-4 py-3 text-right">Subsidiya (%)</th>
                <th className="px-4 py-3 text-right">Mablag' (%)</th>
                <th className="px-4 py-3 text-right">Umumiy indeks</th>
                <th className="px-4 py-3">Oxirgi yangilanish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {ratings.map((m, idx) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono-tabular font-semibold">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    {m.name} <span className="text-slate-400 font-mono-tabular">({m.code})</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.sector}</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{m.bandlikPct}%</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{m.norasmiyPct}%</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{m.subsPct}%</td>
                  <td className="px-4 py-3 text-right font-mono-tabular">{m.mabPct}%</td>
                  <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#0B1E3B] dark:text-[#C59B27]">
                    {m.compositeIndex}%
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-slate-500">
                    {formatTashkentDateTime(m.last_updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Super Admin Users & RBAC Management                                     */
/* -------------------------------------------------------------------------- */
interface ManagedUserRow {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  role_slug: string;
  role_name: string;
  mahalla_id: number | null;
  mahalla_name: string | null;
  is_blocked: number;
  must_change_password: number;
  last_login_at: string | null;
  assignedDirectionIds: number[];
}

export function UsersManagementView({
  directions,
  mahallas,
}: {
  directions: DirectionItem[];
  mahallas: MahallaItem[];
}) {
  const [users, setUsers] = useState<ManagedUserRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [roleSlug, setRoleSlug] = useState('mahalla');
  const [mahallaId, setMahallaId] = useState<string>(String(mahallas[0]?.id || ''));
  const [directionIds, setDirectionIds] = useState<number[]>([]);
  const [tempPassword, setTempPassword] = useState('');

  // Re-auth modal for block / reset password
  const [reauthAction, setReauthAction] = useState<{
    type: 'block' | 'reset';
    user: ManagedUserRow;
  } | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newTempPass, setNewTempPass] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function loadUsers() {
    const res = await apiJson<{ users: ManagedUserRow[] }>('/api/users');
    setUsers(res.users);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const res = await apiJson<{ message: string }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          fullName,
          phone,
          roleSlug,
          mahallaId: roleSlug === 'mahalla' ? Number(mahallaId) : null,
          directionIds: roleSlug === 'admin_one' ? directionIds : [],
          temporaryPassword: tempPassword,
        }),
      });
      setMsg(res.message);
      setUsername('');
      setFullName('');
      setTempPassword('');
      setShowCreate(false);
      await loadUsers();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Xatolik.');
    }
  }

  async function handleReauthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reauthAction) return;
    setErr('');
    setMsg('');
    try {
      if (reauthAction.type === 'block') {
        const res = await apiJson<{ message: string }>(
          `/api/users/${reauthAction.user.id}/block`,
          {
            method: 'POST',
            body: JSON.stringify({
              blocked: reauthAction.user.is_blocked === 0,
              confirmPassword,
            }),
          }
        );
        setMsg(res.message);
      } else {
        const res = await apiJson<{ message: string }>(
          `/api/users/${reauthAction.user.id}/reset-password`,
          {
            method: 'POST',
            body: JSON.stringify({
              temporaryPassword: newTempPass,
              confirmPassword,
            }),
          }
        );
        setMsg(res.message);
      }
      setReauthAction(null);
      setConfirmPassword('');
      setNewTempPass('');
      await loadUsers();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Tasdiqlashda xatolik.');
    }
  }

  function toggleDir(id: number) {
    setDirectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Foydalanuvchilar va ruxsatlar (RBAC)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Admin-1 yo'nalishlari, Admin-2 va Mahalla hisoblarini yaratish, bloklash va parolni tiklash
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          <span>Yangi foydalanuvchi</span>
        </button>
      </div>

      {err && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {err}
        </div>
      )}
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreateUser}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold">Yangi foydalanuvchi yaratish</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Login (lotin, min 4 belgi)"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="F.I.Sh"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefon raqami"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="mahalla">Mahalla operatori</option>
              <option value="admin_one">Admin-1 (Yo'nalishlar)</option>
              <option value="admin_two">Admin-2 (Hududiy tahlil)</option>
              <option value="super_admin">Super Admin</option>
            </select>

            {roleSlug === 'mahalla' && (
              <select
                value={mahallaId}
                onChange={(e) => setMahallaId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {mahallas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="text"
              required
              minLength={8}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Vaqtinchalik parol (min 8 belgi)"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
            />
          </div>

          {roleSlug === 'admin_one' && (
            <div>
              <p className="text-xs font-medium mb-2">Admin-1 ga biriktiriladigan yo'nalishlar:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {directions.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directionIds.includes(d.id)}
                      onChange={() => toggleDir(d.id)}
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium"
          >
            Yaratish
          </button>
        </form>
      )}

      {reauthAction && (
        <form
          onSubmit={handleReauthSubmit}
          className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-5 space-y-3"
        >
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Xavfsizlik tasdig'i (qayta autentifikatsiya): {reauthAction.user.full_name} (
            {reauthAction.user.username})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {reauthAction.type === 'reset' && (
              <input
                type="text"
                required
                minLength={8}
                value={newTempPass}
                onChange={(e) => setNewTempPass(e.target.value)}
                placeholder="Yangi vaqtinchalik parol (min 8 belgi)"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            )}
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Super Admin joriy parolingiz"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0B1E3B] text-white text-xs font-medium"
              >
                Tasdiqlash
              </button>
              <button
                type="button"
                onClick={() => setReauthAction(null)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
              >
                Bekor
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">F.I.Sh / Login</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Biriktirilgan hudud / yo'nalish</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Oxirgi kirish</th>
                <th className="px-4 py-3">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{u.full_name}</div>
                    <div className="font-mono-tabular text-slate-500">{u.username}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{u.role_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {u.mahalla_name
                      ? u.mahalla_name
                      : u.assignedDirectionIds.length > 0
                        ? `${u.assignedDirectionIds.length} ta yo'nalish`
                        : 'Umumiy'}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_blocked ? (
                      <span className="text-red-600 font-semibold">Bloklangan</span>
                    ) : u.must_change_password ? (
                      <span className="text-amber-700 dark:text-amber-400">Parol almashtirish kutilmoqda</span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-400">Faol</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-slate-500">
                    {formatTashkentDateTime(u.last_login_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReauthAction({ type: 'reset', user: u })}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Parol tiklash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReauthAction({ type: 'block', user: u })}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        {u.is_blocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        <span>{u.is_blocked ? 'Ochish' : 'Bloklash'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Security & Audit Logs                                                   */
/* -------------------------------------------------------------------------- */
export function SecurityAuditView() {
  const [stats, setStats] = useState({ activeSessions: 0, blockedUsers: 0, securityAlerts: 0 });
  const [logs, setLogs] = useState<
    Array<{
      id: number;
      username: string;
      role_slug: string;
      action: string;
      entity_type: string;
      ip_address: string;
      severity: string;
      details_json: string;
      created_at: string;
    }>
  >([]);

  useEffect(() => {
    apiJson<{
      stats: { activeSessions: number; blockedUsers: number; securityAlerts: number };
      logs: typeof logs;
    }>('/api/security/overview').then((res) => {
      setStats(res.stats);
      setLogs(res.logs);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Faol sessiyalar</p>
          <p className="text-2xl font-bold font-mono-tabular mt-1">{formatNum(stats.activeSessions)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Bloklangan hisoblar</p>
          <p className="text-2xl font-bold font-mono-tabular mt-1 text-red-600">
            {formatNum(stats.blockedUsers)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500">Xavfsizlik ogohlantirishlari</p>
          <p className="text-2xl font-bold font-mono-tabular mt-1 text-amber-600">
            {formatNum(stats.securityAlerts)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#C59B27]" />
          <h3 className="text-sm font-semibold">Xavfsizlik va harakatlar audit jurnali</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Vaqt</th>
                <th className="px-4 py-2.5">Foydalanuvchi</th>
                <th className="px-4 py-2.5">Harakat</th>
                <th className="px-4 py-2.5">Obyekt</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="px-4 py-2.5">Daraja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-mono-tabular text-slate-500">
                    {formatTashkentDateTime(l.created_at)}
                  </td>
                  <td className="px-4 py-2 font-mono-tabular">
                    {l.username} ({l.role_slug})
                  </td>
                  <td className="px-4 py-2 font-medium">{l.action}</td>
                  <td className="px-4 py-2 font-mono-tabular text-slate-500">{l.entity_type}</td>
                  <td className="px-4 py-2 font-mono-tabular text-slate-500">{l.ip_address}</td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      l.severity === 'critical'
                        ? 'text-red-600'
                        : l.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {l.severity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. System Settings & Backup                                                */
/* -------------------------------------------------------------------------- */
export function SettingsAndBackupView() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiJson<{ settings: Array<{ key: string; value: string }> }>('/api/settings').then((res) => {
      const map: Record<string, string> = {};
      for (const s of res.settings) map[s.key] = s.value;
      setSettings(map);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const res = await apiJson<{ message: string }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings, confirmPassword }),
      });
      setMsg(res.message);
      setConfirmPassword('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Saqlashda xatolik.');
    }
  }

  async function handleBackup() {
    setErr('');
    try {
      await downloadFile('/api/backup/export', 'pf193_backup.json', {
        method: 'POST',
        body: JSON.stringify({ confirmPassword }),
      });
      setMsg('Zaxira nusxa muvaffaqiyatli yuklab olindi.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Zaxira olishda xatolik.');
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Tizim sozlamalari va ma'lumotlarni zaxiralash
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Barcha o'zgartirishlar Super Admin paroli bilan qayta tasdiqlanadi
        </p>

        {err && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700">
            {msg}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Tizim nomi</label>
              <input
                type="text"
                value={settings.system_name || ''}
                onChange={(e) => setSettings({ ...settings, system_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hokimlik nomi</label>
              <input
                type="text"
                value={settings.hokimlik_name || ''}
                onChange={(e) => setSettings({ ...settings, hokimlik_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Maksimal import fayl hajmi (MB)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.max_import_size_mb || '10'}
                onChange={(e) => setSettings({ ...settings, max_import_size_mb: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Login urinishlar limiti</label>
              <input
                type="number"
                min={3}
                max={20}
                value={settings.max_login_attempts || '5'}
                onChange={(e) => setSettings({ ...settings, max_login_attempts: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium mb-1">
                Tasdiqlash uchun joriy Super Admin paroli
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Parolingizni kiriting"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium"
            >
              Sozlamalarni saqlash
            </button>
            <button
              type="button"
              onClick={handleBackup}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5"
            >
              <DatabaseBackup className="w-4 h-4" />
              <span>To'liq zaxira nusxa (JSON)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Help Center                                                             */
/* -------------------------------------------------------------------------- */
export function HelpCenterView() {
  return (
    <div className="max-w-4xl space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-6 h-6 text-[#C59B27]" />
          <div>
            <h2 className="text-lg font-bold">Yordam markazi va foydalanish yo'riqnomasi</h2>
            <p className="text-xs text-slate-500">
              Mirzaobod tumani hokimligi PF-193 axborot-tahlil platformasi
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-semibold text-sm">1. 4 ta alohida rol va kirish</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Super Admin barcha bo'limlarni boshqaradi. Admin-1 faqat o'ziga biriktirilgan yo'nalishlar bilan ishlaydi. Admin-2 hududiy tahlil va tasdiqlashni amalga oshiradi. Mahalla operatori esa faqat o'z mahallasining ma'lumotlarini kiritadi.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-semibold text-sm">2. 3 xil usulda ma'lumot yuklash</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Header qismidagi "Ma'lumotlarni yuklash" tugmasi orqali .xlsx/.csv fayl, JSON yoki qo'lda kiritish mumkin. Excel va JSON yuklashda avval oldindan ko'rish (eski va yangi qiymatlar farqi) tekshiriladi; xato bo'lsa qisman saqlashga yo'l qo'yilmaydi.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-semibold text-sm">3. Tarixiy versiyalash va tasdiqlash</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Har bir o'zgarish alohida tarixiy yozuv sifatida Asia/Tashkent vaqti bilan saqlanadi. Mahalla yuborgan ma'lumotlar tasdiqlanmaguncha umumiy rasmiy statistikaga qo'shilmaydi.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-semibold text-sm">4. Avtomatik hisobotlar va eksport</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Haftalik, oylik va yillik hisobotlar faqat haqiqiy tasdiqlangan tarixiy yozuvlardan hisoblanadi va PDF, Excel (.xlsx), CSV (UTF-8) hamda JSON formatlarida yuklab olinadi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
