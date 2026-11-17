import {
  useEffect,
  useState,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import {
  LayoutDashboard,
  FileBarChart2,
  ClipboardCheck,
  History,
  FileSpreadsheet,
  Users,
  Shield,
  Settings,
  HelpCircle,
  MapPin,
  Upload,
  Bell,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Download,
  KeyRound,
  ChevronDown,
} from 'lucide-react';
import { apiJson, downloadFile, formatTashkentDateTime, setCsrfToken } from './lib/api.ts';
import type {
  AuthUser,
  DashboardPayload,
  DirectionItem,
  IndicatorItem,
  MahallaItem,
  NotificationItem,
  PeriodType,
  RoleSlug,
} from './types.ts';
import { EmblemMark } from './components/EmblemMark.tsx';
import { LoginPortal } from './components/LoginPortal.tsx';
import { DataUploadModal } from './components/DataUploadModal.tsx';
const DashboardView = lazy(() =>
  import('./components/DashboardView.tsx').then((module) => ({
    default: module.DashboardView,
  }))
);

const DirectionView = lazy(() =>
  import('./components/DirectionView.tsx').then((module) => ({
    default: module.DirectionView,
  }))
);

const ReportsView = lazy(() =>
  import('./components/ReportsView.tsx').then((module) => ({
    default: module.ReportsView,
  }))
);
import { ApprovalsView, HistoryLedgerView } from './components/ApprovalsAndHistoryView.tsx';
import {
  HelpCenterView,
  MahallasRatingView,
  SecurityAuditView,
  SettingsAndBackupView,
  UsersManagementView,
} from './components/AdminManagementViews.tsx';

type ActiveSection =
  | { type: 'dashboard' }
  | { type: 'direction'; slug: string }
  | { type: 'reports' }
  | { type: 'approvals' }
  | { type: 'imports' }
  | { type: 'history'; directionId?: number | null }
  | { type: 'mahallas' }
  | { type: 'users' }
  | { type: 'security' }
  | { type: 'settings' }
  | { type: 'help' };

function portalFromPath(pathname: string): RoleSlug {
  if (pathname.includes('admin-1')) return 'admin_one';
  if (pathname.includes('admin-2')) return 'admin_two';
  if (pathname.includes('mahalla')) return 'mahalla';
  return 'super_admin';
}

function pathForPortal(role: RoleSlug): string {
  switch (role) {
    case 'admin_one':
      return '/login/admin-1';
    case 'admin_two':
      return '/login/admin-2';
    case 'mahalla':
      return '/login/mahalla';
    default:
      return '/login/super-admin';
  }
}

export default function App() {
  const [dark, setDark] = useState<boolean>(() => {
    return localStorage.getItem('pf193_theme') === 'dark';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [bootLoading, setBootLoading] = useState(true);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [systemMeta, setSystemMeta] = useState<{
    hokimlik_name?: string;
    system_name?: string;
    displayDate?: string;
  }>({});
  const [portalRole, setPortalRole] = useState<RoleSlug>(() =>
    portalFromPath(window.location.pathname)
  );

  const [user, setUser] = useState<AuthUser | null>(null);
  const [directions, setDirections] = useState<DirectionItem[]>([]);
  const [indicators, setIndicators] = useState<IndicatorItem[]>([]);
  const [mahallas, setMahallas] = useState<MahallaItem[]>([]);

  const [section, setSection] = useState<ActiveSection>({ type: 'dashboard' });
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedMahallaId, setSelectedMahallaId] = useState<number | null>(null);

  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'excel' | 'json' | 'manual' | 'history'>('excel');

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Forced or manual password change modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('pf193_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const loadBootstrap = useCallback(async () => {
    setBootLoading(true);
    try {
      const setup = await apiJson<{
        needsInitialSetup: boolean;
        serverTime: { displayDate: string };
        settings: Record<string, string>;
      }>('/api/setup/status');
      setNeedsInitialSetup(setup.needsInitialSetup);
      setSystemMeta({
        hokimlik_name: setup.settings.hokimlik_name,
        system_name: setup.settings.system_name,
        displayDate: setup.serverTime.displayDate,
      });

      if (!setup.needsInitialSetup) {
        try {
          const me = await apiJson<{ user: AuthUser }>('/api/auth/me');
          setUser(me.user);
          setCsrfToken(me.user.csrfToken);
          if (me.user.mustChangePassword) {
            setPwdModalOpen(true);
          }
        } catch {
          setUser(null);
        }
      }
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const loadCatalogAndDashboard = useCallback(async () => {
    if (!user) return;
    setDashLoading(true);
    try {
      const [cat, dash, notifs] = await Promise.all([
        apiJson<{
          directions: DirectionItem[];
          indicators: IndicatorItem[];
          mahallas: MahallaItem[];
        }>('/api/catalog'),
        apiJson<DashboardPayload>(
          `/api/dashboard?period=${periodType}${
            selectedMahallaId ? `&mahallaId=${selectedMahallaId}` : ''
          }`
        ),
        apiJson<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setDirections(cat.directions);
      setIndicators(cat.indicators);
      setMahallas(cat.mahallas);
      setDashboardData(dash);
      setNotifications(notifs.notifications);
    } finally {
      setDashLoading(false);
    }
  }, [user, periodType, selectedMahallaId]);

  useEffect(() => {
    if (user) {
      loadCatalogAndDashboard();
    }
  }, [user, loadCatalogAndDashboard, refreshSignal]);

  // Lightweight background refresh every 30s only while tab is visible
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadCatalogAndDashboard();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [user, loadCatalogAndDashboard]);

  async function handleLogout() {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setCsrfToken('');
    setUser(null);
    setDashboardData(null);
    setSection({ type: 'dashboard' });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdErr('');
    setPwdMsg('');
    try {
      const res = await apiJson<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });
      setPwdMsg(res.message);
      setCurPwd('');
      setNewPwd('');
      if (user) {
        setUser({ ...user, mustChangePassword: false });
      }
      setTimeout(() => {
        setPwdModalOpen(false);
        setPwdMsg('');
      }, 900);
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Parolni o‘zgartirishda xatolik.');
    }
  }

  async function handleMarkNotificationsRead() {
    await apiJson('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  }

  function handleSelectPortal(role: RoleSlug) {
    setPortalRole(role);
    try {
      window.history.replaceState({}, '', pathForPortal(role));
    } catch {
      // ignore in sandboxed frames if restricted
    }
  }

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9] dark:bg-slate-950 text-sm text-slate-500">
        Platforma yuklanmoqda...
      </div>
    );
  }

  if (!user || needsInitialSetup) {
    return (
      <LoginPortal
        needsInitialSetup={needsInitialSetup}
        activePortal={portalRole}
        onSelectPortal={handleSelectPortal}
        hokimlikName={systemMeta.hokimlik_name}
        systemName={systemMeta.system_name}
        onSetupCompleted={() => {
          setNeedsInitialSetup(false);
          loadBootstrap();
        }}
        onLoginSuccess={(mustChange, csrf) => {
          setCsrfToken(csrf);
          try {
            window.history.replaceState({}, '', '/');
          } catch {
            // ignore
          }
          loadBootstrap().then(() => {
            if (mustChange) setPwdModalOpen(true);
          });
        }}
      />
    );
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const sectionTitle = (() => {
    switch (section.type) {
      case 'dashboard':
        return 'Bosh sahifa · Umumiy monitoring';
      case 'direction':
        return (
          directions.find((d) => d.slug === section.slug)?.name || "Yo'nalish dashboardi"
        );
      case 'reports':
        return 'Hisobotlar va blankalar';
      case 'approvals':
        return "Ma'lumotlarni boshqarish va tasdiqlash";
      case 'imports':
        return 'Import tarixi';
      case 'history':
        return "O'zgarishlar tarixi";
      case 'mahallas':
        return 'Mahallalar va qiyosiy reyting';
      case 'users':
        return 'Foydalanuvchilar va ruxsatlar';
      case 'security':
        return 'Xavfsizlik va audit jurnali';
      case 'settings':
        return 'Tizim sozlamalari';
      case 'help':
        return 'Yordam markazi';
    }
  })();

  const triggerDataRefresh = () => setRefreshSignal((s) => s + 1);

  return (
    <div className="app-shell overflow-hidden bg-[#F4F6F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Navigation Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-full min-h-0 w-[268px] bg-[#0B1E3B] text-slate-200 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <EmblemMark size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">Mirzaobod PF-193</div>
              <div className="text-[11px] text-[#C59B27] truncate">
                {user.mahallaName || user.roleName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-300 hover:text-white"
            aria-label="Menyuni yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain panel-scroll px-3 py-4 space-y-6 text-xs">
          {/* ASOSIY */}
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400">Asosiy</div>
            <button
              type="button"
              onClick={() => {
                setSection({ type: 'dashboard' });
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                section.type === 'dashboard'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span className="truncate">Bosh sahifa</span>
            </button>
          </div>

          {/* 14 YO'NALISHLAR */}
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400">
              Yo'nalishlar ({directions.length})
            </div>
            <div className="space-y-0.5">
              {directions.map((dir) => {
                const active = section.type === 'direction' && section.slug === dir.slug;
                return (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => {
                      setSection({ type: 'direction', slug: dir.slug });
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                      active
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="font-mono-tabular text-[11px] text-[#C59B27] w-5 shrink-0">
                      {String(dir.sort_order).padStart(2, '0')}
                    </span>
                    <span className="truncate">{dir.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TIZIM */}
          <div>
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400">Tizim</div>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setSection({ type: 'reports' });
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  section.type === 'reports'
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <FileBarChart2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Hisobotlar va blankalar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSection({ type: 'approvals' });
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  section.type === 'approvals'
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">Ma'lumotlarni boshqarish</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUploadTab('history');
                  setUploadOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-300 hover:bg-white/10"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span className="truncate">Import tarixi</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSection({ type: 'history' });
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  section.type === 'history'
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <History className="w-4 h-4 shrink-0" />
                <span className="truncate">O'zgarishlar tarixi</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSection({ type: 'mahallas' });
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  section.type === 'mahallas'
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">Mahallalar va reyting</span>
              </button>

              {user.roleSlug === 'super_admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSection({ type: 'users' });
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                      section.type === 'users'
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="truncate">Foydalanuvchilar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSection({ type: 'security' });
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                      section.type === 'security'
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span className="truncate">Xavfsizlik</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSection({ type: 'settings' });
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                      section.type === 'settings'
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span className="truncate">Sozlamalar</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setSection({ type: 'help' });
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  section.type === 'help'
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">Yordam markazi</span>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-y-auto overscroll-contain panel-scroll">
        {/* Top Header */}
        <header className="relative bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
              aria-label="Menyuni ochish"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {sectionTitle}
              </h1>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular truncate">
                {dashboardData?.periodLabel || `Sana: ${systemMeta.displayDate || ''}`} · Asia/Tashkent
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Switcher */}
            <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'weekly', label: 'Haftalik' },
                  { id: 'monthly', label: 'Oylik' },
                  { id: 'yearly', label: 'Yillik' },
                ] as Array<{ id: PeriodType; label: string }>
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodType(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    periodType === p.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Prominent Data Upload Button */}
            {(user.permissions.includes('data.enter_manual') ||
              user.permissions.includes('data.import_excel') ||
              user.roleSlug === 'super_admin') && (
              <button
                type="button"
                onClick={() => {
                  setUploadTab('excel');
                  setUploadOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 border border-[#C59B27]/50"
              >
                <Upload className="w-4 h-4 text-[#C59B27]" />
                <span>MA'LUMOTLARNI YUKLASH</span>
              </button>
            )}

            {/* Export Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Eksport</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-40 text-xs">
                  {(['pdf', 'xlsx', 'csv', 'json'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false);
                        downloadFile(
                          `/api/export?format=${fmt}${
                            selectedMahallaId ? `&mahallaId=${selectedMahallaId}` : ''
                          }`,
                          `pf193_eksport.${fmt}`
                        );
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase font-medium"
                    >
                      {fmt} yuklab olish
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label="Bildirishnomalar"
                className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 relative"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-red-600 text-white text-[10px] font-mono-tabular flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-1.5 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-semibold">Bildirishnomalar</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkNotificationsRead}
                        className="text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        O'qilgan deb belgilash
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 text-center">
                        Yangi bildirishnomalar yo'q.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3 text-xs ${
                            n.is_read === 0 ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <div className="font-semibold">{n.title}</div>
                          <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                            {n.message}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono-tabular mt-1">
                            {formatTashkentDateTime(n.created_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setDark(!dark)}
              aria-label="Yorug' yoki qorong'i rejim"
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {dark ? <Sun className="w-4 h-4 text-[#C59B27]" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-left flex items-center gap-2"
              >
                <div className="hidden sm:block max-w-[140px] truncate">
                  <div className="font-semibold truncate">{user.fullName}</div>
                  <div className="text-[10px] text-slate-500 truncate">{user.roleName}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 z-40 text-xs">
                  <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="font-semibold">{user.fullName}</div>
                    <div className="text-slate-500 font-mono-tabular">{user.username}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setPwdModalOpen(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Parolni almashtirish</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Tizimdan chiqish</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {section.type === 'dashboard' && (
            <DashboardView
              data={dashboardData}
              loading={dashLoading}
              dark={dark}
              roleSlug={user.roleSlug}
              periodType={periodType}
              mahallas={mahallas}
              selectedMahallaId={selectedMahallaId}
              onSelectMahalla={setSelectedMahallaId}
              onRefresh={triggerDataRefresh}
              onOpenDirection={(slug) => setSection({ type: 'direction', slug })}
              onOpenApprovals={() => setSection({ type: 'approvals' })}
            />
          )}

          {section.type === 'direction' && (
            <DirectionView
              slug={section.slug}
              dark={dark}
              user={user}
              refreshSignal={refreshSignal}
              onOpenManualEntry={() => {
                setUploadTab('manual');
                setUploadOpen(true);
              }}
              onOpenHistoryForDirection={(dirId) =>
                setSection({ type: 'history', directionId: dirId })
              }
            />
          )}

          {section.type === 'reports' && (
            <ReportsView
              user={user}
              dark={dark}
              directions={directions}
              mahallas={mahallas}
              periodType={periodType}
              onChangePeriod={setPeriodType}
            />
          )}

          {section.type === 'approvals' && (
            <ApprovalsView user={user} onChanged={triggerDataRefresh} />
          )}

          {section.type === 'history' && (
            <HistoryLedgerView
              user={user}
              directions={directions}
              indicators={indicators}
              mahallas={mahallas}
              initialDirectionId={section.directionId}
              onDataChanged={triggerDataRefresh}
            />
          )}

          {section.type === 'mahallas' && (
            <MahallasRatingView user={user} onChanged={triggerDataRefresh} />
          )}

          {section.type === 'users' && user.roleSlug === 'super_admin' && (
            <UsersManagementView directions={directions} mahallas={mahallas} />
          )}

          {section.type === 'security' && user.roleSlug === 'super_admin' && (
            <SecurityAuditView />
          )}

          {section.type === 'settings' && user.roleSlug === 'super_admin' && (
            <SettingsAndBackupView />
          )}

          {section.type === 'help' && <HelpCenterView />}
        </main>
      </div>

      {/* 3-Method Data Upload Modal */}
      <DataUploadModal
        open={uploadOpen}
        initialTab={uploadTab}
        onClose={() => setUploadOpen(false)}
        user={user}
        directions={directions}
        indicators={indicators}
        mahallas={mahallas}
        onDataCommitted={triggerDataRefresh}
      />

      {/* Password Change Modal (Mandatory on first temp login) */}
      {pwdModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleChangePassword}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-bold">
                {user.mustChangePassword
                  ? 'Birinchi kirish: vaqtinchalik parolni almashtiring'
                  : 'Parolni o‘zgartirish'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Xavfsizlik uchun kamida 8 ta belgidan iborat shaxsiy parol o‘rnating.
              </p>
            </div>
            {pwdErr && <p className="text-xs text-red-600">{pwdErr}</p>}
            {pwdMsg && <p className="text-xs text-emerald-700">{pwdMsg}</p>}
            <input
              type="password"
              required
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
              placeholder="Joriy (yoki vaqtinchalik) parol"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Yangi parol (kamida 8 belgi)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
            <div className="flex justify-end gap-2">
              {!user.mustChangePassword && (
                <button
                  type="button"
                  onClick={() => setPwdModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                >
                  Bekor qilish
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0B1E3B] text-white text-xs font-medium"
              >
                Saqlash
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
