import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Building2, Users, MapPin, CheckCircle2 } from 'lucide-react';
import { apiJson } from '../lib/api.ts';
import type { RoleSlug } from '../types.ts';
import { EmblemMark } from './EmblemMark.tsx';

interface LoginPortalProps {
  needsInitialSetup: boolean;
  activePortal: RoleSlug;
  onSelectPortal: (role: RoleSlug) => void;
  onLoginSuccess: (mustChangePassword: boolean, csrfToken: string) => void;
  onSetupCompleted: () => void;
  hokimlikName?: string;
  systemName?: string;
}

const PORTAL_META: Record<
  RoleSlug,
  {
    title: string;
    subtitle: string;
    pathHint: string;
    icon: typeof ShieldCheck;
    accent: string;
  }
> = {
  super_admin: {
    title: 'Super Admin kirishi',
    subtitle: "To'liq tizim nazorati, foydalanuvchilar, xavfsizlik va barcha dashboardlar",
    pathHint: '/login/super-admin',
    icon: ShieldCheck,
    accent: 'text-[#C59B27]',
  },
  admin_one: {
    title: 'Admin-1 kirishi',
    subtitle: "Biriktirilgan PF-193 yo'nalishlari bo'yicha ma'lumotlar va tahlillar",
    pathHint: '/login/admin-1',
    icon: Building2,
    accent: 'text-blue-700 dark:text-blue-400',
  },
  admin_two: {
    title: 'Admin-2 kirishi',
    subtitle: 'Mahallalar kesimi, reyting, taqqoslash va tasdiqlash boshqaruvi',
    pathHint: '/login/admin-2',
    icon: Users,
    accent: 'text-emerald-700 dark:text-emerald-400',
  },
  mahalla: {
    title: 'Mahalla kirishi',
    subtitle: "Mahalla fuqarolar yig'ini bo'yicha kundalik ko'rsatkichlarni kiritish",
    pathHint: '/login/mahalla',
    icon: MapPin,
    accent: 'text-amber-700 dark:text-amber-400',
  },
};

export function LoginPortal({
  needsInitialSetup,
  activePortal,
  onSelectPortal,
  onLoginSuccess,
  onSetupCompleted,
  hokimlikName = 'Mirzaobod tumani hokimligi',
  systemName = 'PF-193 Monitoring Platformasi',
}: LoginPortalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset request modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetNote, setResetNote] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  // First-run Setup state
  const [setupUsername, setSetupUsername] = useState('super_admin');
  const [setupFullName, setSetupFullName] = useState('Mirzaobod Tuman Super Admin');
  const [setupPassword, setSetupPassword] = useState('');
  const [seedDemoData, setSeedDemoData] = useState(true);
  const [createDemoAccounts, setCreateDemoAccounts] = useState(true);
  const [generatedAccounts, setGeneratedAccounts] = useState<
    Array<{ role: string; username: string; temporaryPassword: string; note: string }>
  >([]);

  const meta = PORTAL_META[activePortal];
  const PortalIcon = meta.icon;

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiJson<{
        mustChangePassword: boolean;
        csrfToken: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          portalRole: activePortal,
        }),
      });
      onLoginSuccess(res.mustChangePassword, res.csrfToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  }

  async function handleInitialSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiJson<{
        message: string;
        generatedAccounts: Array<{
          role: string;
          username: string;
          temporaryPassword: string;
          note: string;
        }>;
      }>('/api/setup/initialize', {
        method: 'POST',
        body: JSON.stringify({
          username: setupUsername,
          fullName: setupFullName,
          password: setupPassword,
          seedDemoData,
          createDemoAccounts,
        }),
      });

      if (res.generatedAccounts && res.generatedAccounts.length > 0) {
        setGeneratedAccounts(res.generatedAccounts);
        setUsername(setupUsername);
        setPassword('');
      } else {
        onSetupCompleted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "O'rnatishda xatolik.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setResetMessage('');
    try {
      const res = await apiJson<{ message: string }>('/api/auth/reset-request', {
        method: 'POST',
        body: JSON.stringify({ username: resetUsername, note: resetNote }),
      });
      setResetMessage(res.message);
    } catch (err) {
      setResetMessage(err instanceof Error ? err.message : 'Xatolik.');
    }
  }

  if (needsInitialSetup) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <EmblemMark size="lg" />
            <div>
              <p className="text-xs font-medium text-[#C59B27]">{hokimlikName}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                Tizimni birlamchi ishga tushirish
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Xavfsizlik talabiga ko'ra boshlang'ich parollar kodga yozilmagan. Birinchi Super Admin hisobini yarating.
              </p>
            </div>
          </div>

          {generatedAccounts.length > 0 ? (
            <div className="mt-6 space-y-5">
              <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900 dark:text-emerald-200">
                  <p className="font-semibold">Tizim muvaffaqiyatli o'rnatildi!</p>
                  <p className="mt-1">
                    Quyidagi bir martalik vaqtinchalik parollarni saqlab oling. Ular boshqa qayta ko'rsatilmaydi va birinchi kirishda almashtirilishi shart.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Rol</th>
                      <th className="px-4 py-2.5 font-medium">Login</th>
                      <th className="px-4 py-2.5 font-medium">Vaqtinchalik parol</th>
                      <th className="px-4 py-2.5 font-medium">Izoh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">Super Admin</td>
                      <td className="px-4 py-2.5 font-mono-tabular">{setupUsername}</td>
                      <td className="px-4 py-2.5 text-slate-500">Siz kiritgan parol</td>
                      <td className="px-4 py-2.5 text-slate-500">To'liq boshqaruv</td>
                    </tr>
                    {generatedAccounts.map((acc) => (
                      <tr key={acc.username} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{acc.role}</td>
                        <td className="px-4 py-2.5 font-mono-tabular">{acc.username}</td>
                        <td className="px-4 py-2.5 font-mono-tabular font-semibold text-[#0B1E3B] dark:text-[#C59B27]">
                          {acc.temporaryPassword}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{acc.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={onSetupCompleted}
                className="w-full py-2.5 px-4 bg-[#0B1E3B] hover:bg-[#132C54] text-white font-medium rounded-lg transition-colors"
              >
                Kirish sahifasiga o'tish
              </button>
            </div>
          ) : (
            <form onSubmit={handleInitialSetup} className="mt-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Super Admin logini
                  </label>
                  <input
                    type="text"
                    required
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1E3B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    F.I.Sh
                  </label>
                  <input
                    type="text"
                    required
                    value={setupFullName}
                    onChange={(e) => setSetupFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1E3B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Super Admin paroli (kamida 8 belgi)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Kuchli parol kiriting..."
                    className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1E3B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                    aria-label="Parolni ko'rsatish"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedDemoData}
                    onChange={(e) => setSeedDemoData(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>
                    12 ta mahalla va 14 ta yo'nalish bo'yicha ko'p haftalik PF-193 tarixiy bazasini shakllantirish
                  </span>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createDemoAccounts}
                    onChange={(e) => setCreateDemoAccounts(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>
                    Admin-1, Admin-2 va Mahalla operatorlari uchun tasodifiy bir martalik hisoblar yaratish
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#0B1E3B] hover:bg-[#132C54] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? 'Sozlanmoqda...' : 'Tizimni ishga tushirish'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-[440px] bg-[#0B1E3B] text-white p-8 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3.5">
            <EmblemMark size="md" />
            <div>
              <p className="text-xs text-[#C59B27] font-medium">{hokimlikName}</p>
              <h1 className="text-lg font-bold tracking-tight">{systemName}</h1>
            </div>
          </div>

          <div className="mt-10">
            <p className="text-xs text-slate-400 mb-3">Kirish portalini tanlang</p>
            <div className="space-y-2">
              {(['super_admin', 'admin_one', 'admin_two', 'mahalla'] as RoleSlug[]).map((role) => {
                const item = PORTAL_META[role];
                const Icon = item.icon;
                const active = activePortal === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      onSelectPortal(role);
                      setError('');
                    }}
                    className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 ${
                      active
                        ? 'bg-white/10 border-[#C59B27] text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${active ? 'text-[#C59B27]' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-300/80 mt-0.5 line-clamp-2">{item.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-8 mt-8 border-t border-white/10 text-xs text-slate-400 space-y-1">
          <p>O'zbekiston Respublikasi Prezidentining PF-193 farmoni ijrosi monitoringi</p>
          <p className="font-mono-tabular text-slate-500">Asia/Tashkent (UTC+5) · RBAC Himoyalangan</p>
        </div>
      </div>

      {/* Right Portal Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
          <div className="flex items-center gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <PortalIcon className={`w-5 h-5 ${meta.accent}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{meta.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">{meta.pathHint}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">{meta.subtitle}</p>

          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Login
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Foydalanuvchi loginini kiriting"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B1E3B]"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Parol
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B1E3B]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  aria-label="Parolni ko'rsatish yoki yashirish"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#0B1E3B] hover:bg-[#132C54] disabled:opacity-60 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Tekshirilmoqda...' : 'Tizimga kirish'}</span>
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setResetOpen(!resetOpen);
                setResetMessage('');
              }}
              className="text-[#0B1E3B] dark:text-[#C59B27] hover:underline font-medium flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Parolni tiklash</span>
            </button>
            <span className="text-slate-400">Himoyalangan ulanish</span>
          </div>

          {resetOpen && (
            <form
              onSubmit={handleResetRequest}
              className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
            >
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Super Adminga parolni tiklash so'rovini yuborish
              </p>
              <input
                type="text"
                required
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
                placeholder="Loginingiz"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <input
                type="text"
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
                placeholder="Aloqa telefoni yoki izoh"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <button
                type="submit"
                className="w-full py-2 px-3 bg-slate-800 dark:bg-slate-700 text-white text-xs font-medium rounded-md hover:bg-slate-700"
              >
                So'rov yuborish
              </button>
              {resetMessage && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{resetMessage}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
