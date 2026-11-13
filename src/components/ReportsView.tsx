import { useEffect, useState } from 'react';
import { Download, BookmarkCheck, AlertCircle } from 'lucide-react';
import { apiJson, downloadFile, formatNum, formatTashkentDateTime } from '../lib/api.ts';
import type { AuthUser, DirectionItem, MahallaItem, PeriodType } from '../types.ts';
import { ChartCanvas } from './ChartCanvas.tsx';

interface ReportsViewProps {
  user: AuthUser;
  dark: boolean;
  directions: DirectionItem[];
  mahallas: MahallaItem[];
  periodType: PeriodType;
  onChangePeriod: (p: PeriodType) => void;
}

interface ReportPayload {
  hasData: boolean;
  periodType: PeriodType;
  periodLabel: string;
  previousLabel: string;
  generatedAt: string;
  overview: {
    startValue: number;
    endValue: number;
    delta: number;
    growthPercent: number;
    decreaseAmount: number;
    previousPeriodTotal: number;
    executionPercent: number;
    updatesCount: number;
  };
  financial: {
    allocated: number;
    spent: number;
    remaining: number;
    executionPercent: number;
  };
  byDirection: Array<{
    directionId: number;
    directionName: string;
    startValue: number;
    endValue: number;
    delta: number;
    growthPercent: number;
    decreaseAmount: number;
    updatesCount: number;
  }>;
  byMahalla: Array<{
    mahallaId: number;
    mahallaCode: string;
    mahallaName: string;
    sector: string;
    startValue: number;
    endValue: number;
    delta: number;
    growthPercent: number;
    updatesCount: number;
  }>;
  topPerformers: Array<{
    mahallaId: number;
    mahallaName: string;
    sector: string;
    growthPercent: number;
    delta: number;
  }>;
  laggingDirections: Array<{
    directionId: number;
    directionName: string;
    growthPercent: number;
    delta: number;
  }>;
  analyticalSummary: string;
  recommendations: string[];
}

interface SnapshotItem {
  id: number;
  period_type: string;
  period_key: string;
  created_at: string;
  generated_by_name: string | null;
}

export function ReportsView({
  user,
  dark,
  directions,
  mahallas,
  periodType,
  onChangePeriod,
}: ReportsViewProps) {
  const [referenceDate, setReferenceDate] = useState('2026-11-13');
  const [directionId, setDirectionId] = useState<string>('');
  const [mahallaId, setMahallaId] = useState<string>(user.mahallaId ? String(user.mahallaId) : '');
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotMsg, setSnapshotMsg] = useState('');

  async function fetchReport(saveSnapshot = false) {
    setLoading(true);
    setSnapshotMsg('');
    try {
      const params = new URLSearchParams({
        period: periodType,
        date: referenceDate,
      });
      if (directionId) params.set('directionId', directionId);
      if (mahallaId) params.set('mahallaId', mahallaId);
      if (saveSnapshot) params.set('saveSnapshot', '1');

      const res = await apiJson<{ report: ReportPayload; snapshots: SnapshotItem[] }>(
        `/api/reports?${params.toString()}`
      );
      setReport(res.report);
      setSnapshots(res.snapshots);
      if (saveSnapshot) {
        setSnapshotMsg('Hisobot nusxasi bazaga saqlandi.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport(false);
  }, [periodType, referenceDate, directionId, mahallaId]);

  const exportParams = new URLSearchParams({
    title: report ? `PF-193 ${report.periodLabel}` : 'PF-193 Hisobot',
  });
  if (directionId) exportParams.set('directionId', directionId);
  if (mahallaId) exportParams.set('mahallaId', mahallaId);

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Avtomatik haftalik, oylik va yillik hisobotlar
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Barcha raqamlar faqat tasdiqlangan tarixiy ma'lumotlar bazasidan hisoblanadi
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'weekly', label: 'HAFTALIK' },
                { id: 'monthly', label: 'OYLIK' },
                { id: 'yearly', label: 'YILLIK' },
              ] as Array<{ id: PeriodType; label: string }>
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => onChangePeriod(btn.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  periodType === btn.id
                    ? 'bg-[#0B1E3B] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Tayanch sana (davrni tanlash)
            </label>
            <input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono-tabular"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Yo'nalish</label>
            <select
              value={directionId}
              onChange={(e) => setDirectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="">Barcha yo'nalishlar</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.sort_order}. {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Mahalla</label>
            <select
              value={mahallaId}
              disabled={user.roleSlug === 'mahalla'}
              onChange={(e) => setMahallaId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs disabled:opacity-70"
            >
              <option value="">Barcha mahallalar</option>
              {mahallas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fetchReport(true)}
              className="flex-1 px-3 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Saqlash</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            {snapshotMsg}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['pdf', 'xlsx', 'csv', 'json'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() =>
                  downloadFile(
                    `/api/export?format=${fmt}&${exportParams.toString()}`,
                    `pf193_hisobot.${fmt}`
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 uppercase"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{fmt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !report ? (
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500">
          Hisobot hisoblanmoqda...
        </div>
      ) : report && !report.hasData ? (
        <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {report.periodLabel} — Ma'lumot topilmadi
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {report.analyticalSummary}
            </p>
          </div>
        </div>
      ) : (
        report && (
          <>
            {/* Overview Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">Boshlang'ich qiymat</p>
                <p className="text-xl font-bold font-mono-tabular mt-1">
                  {formatNum(report.overview.startValue)}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">Yakuniy qiymat</p>
                <p className="text-xl font-bold font-mono-tabular mt-1">
                  {formatNum(report.overview.endValue)}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">Davr o'zgarishi</p>
                <p
                  className={`text-xl font-bold font-mono-tabular mt-1 ${
                    report.overview.delta >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600'
                  }`}
                >
                  {report.overview.delta >= 0
                    ? `+${formatNum(report.overview.delta)}`
                    : formatNum(report.overview.delta)}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">O'sish sur'ati</p>
                <p className="text-xl font-bold font-mono-tabular mt-1 text-blue-700 dark:text-blue-400">
                  {report.overview.growthPercent >= 0
                    ? `+${report.overview.growthPercent}%`
                    : `${report.overview.growthPercent}%`}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">Bandlik ijrosi / Mablag'</p>
                <p className="text-xl font-bold font-mono-tabular mt-1 text-[#C59B27]">
                  {report.overview.executionPercent}% / {report.financial.executionPercent}%
                </p>
              </div>
            </div>

            {/* Analytical Summary & Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tahliliy xulosa ({report.periodLabel})
                </h3>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {report.analyticalSummary}
                </p>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 font-mono-tabular">
                  Oldingi davr ({report.previousLabel}) yig'indisi:{' '}
                  {formatNum(report.overview.previousPeriodTotal)} · Tarixiy yozuvlar:{' '}
                  {report.overview.updatesCount} ta
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tavsiyalar va moliyaviy ijro
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {report.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                  <div>
                    <span className="text-slate-500 block">Ajratilgan</span>
                    <strong>{formatNum(report.financial.allocated)} mln</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Sarflangan</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {formatNum(report.financial.spent)} mln
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Qolgan</span>
                    <strong>{formatNum(report.financial.remaining)} mln</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart & Top/Lagging */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">Yo'nalishlar bo'yicha o'sish (%)</h3>
                <ChartCanvas
                  type="bar"
                  height={230}
                  dark={dark}
                  labels={report.byDirection.map((d) => d.directionName.slice(0, 18))}
                  datasets={[
                    {
                      label: "O'sish (%)",
                      data: report.byDirection.map((d) => d.growthPercent),
                      color: '#0B1E3B',
                    },
                  ]}
                />
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                    Eng yaxshi natija ko'rsatgan mahallalar
                  </h4>
                  <div className="space-y-2 text-xs">
                    {report.topPerformers.map((m) => (
                      <div key={m.mahallaId} className="flex items-center justify-between">
                        <span>{m.mahallaName}</span>
                        <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                          {m.growthPercent >= 0 ? `+${m.growthPercent}%` : `${m.growthPercent}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">
                    E'tibor talab qiladigan yo'nalishlar
                  </h4>
                  <div className="space-y-2 text-xs">
                    {report.laggingDirections.map((d) => (
                      <div key={d.directionId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{d.directionName}</span>
                        <span className="font-mono-tabular font-semibold shrink-0">
                          {d.growthPercent >= 0 ? `+${d.growthPercent}%` : `${d.growthPercent}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Direction Breakdown Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold">Yo'nalishlar kesimida hisobot jadvali</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">Yo'nalish</th>
                      <th className="px-4 py-2.5 text-right">Boshlang'ich</th>
                      <th className="px-4 py-2.5 text-right">Yakuniy</th>
                      <th className="px-4 py-2.5 text-right">O'zgarish</th>
                      <th className="px-4 py-2.5 text-right">O'sish (%)</th>
                      <th className="px-4 py-2.5 text-right">Yozuvlar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {report.byDirection.map((row) => (
                      <tr key={row.directionId}>
                        <td className="px-4 py-2.5 font-medium">{row.directionName}</td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular">
                          {formatNum(row.startValue)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold">
                          {formatNum(row.endValue)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular">
                          {row.delta >= 0 ? `+${formatNum(row.delta)}` : formatNum(row.delta)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold">
                          {row.growthPercent >= 0 ? `+${row.growthPercent}%` : `${row.growthPercent}%`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular text-slate-500">
                          {row.updatesCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* Saved Snapshots */}
      {snapshots.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Saqlangan hisobot nusxalari</h3>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {snapshots.map((s) => (
              <div key={s.id} className="py-2 flex items-center justify-between">
                <span>
                  <strong className="uppercase">{s.period_type}</strong> · {s.period_key}
                </span>
                <span className="text-slate-500 font-mono-tabular">
                  {s.generated_by_name || 'Tizim'} · {formatTashkentDateTime(s.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
