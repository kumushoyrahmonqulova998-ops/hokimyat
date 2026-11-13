import { useEffect, useState } from 'react';
import { Search, Download, Plus, ArrowUpDown } from 'lucide-react';
import {
  apiJson,
  downloadFile,
  formatNum,
  formatTashkentDateTime,
  translateStatus,
} from '../lib/api.ts';
import type { AuthUser } from '../types.ts';
import { ChartCanvas } from './ChartCanvas.tsx';

interface DirectionViewProps {
  slug: string;
  dark: boolean;
  user: AuthUser;
  onOpenManualEntry: () => void;
  onOpenHistoryForDirection: (directionId: number) => void;
  refreshSignal: number;
}

interface DirectionDetailPayload {
  direction: {
    id: number;
    sort_order: number;
    slug: string;
    name: string;
    description: string;
  };
  indicators: Array<{
    id: number;
    code: string;
    name: string;
    unit: string;
    totalApproved: number;
    totalPrevious: number;
    changePercent: number;
    pendingCount: number;
  }>;
  rows: Array<{
    id: number;
    indicator_id: number;
    mahalla_id: number;
    approved_value: number;
    previous_value: number;
    pending_value: number | null;
    approval_status: string;
    last_updated_at: string;
    indicator_name: string;
    unit: string;
    mahalla_code: string;
    mahalla_name: string;
    sector: string;
  }>;
  chart: {
    labels: string[];
    datasets: Array<{ code: string; label: string; data: number[] }>;
  };
}

export function DirectionView({
  slug,
  dark,
  user,
  onOpenManualEntry,
  onOpenHistoryForDirection,
  refreshSignal,
}: DirectionViewProps) {
  const [data, setData] = useState<DirectionDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [sortByDateDesc, setSortByDateDesc] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sector) params.set('sector', sector);

    apiJson<DirectionDetailPayload>(`/api/directions/${slug}?${params.toString()}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Yuklashda xatolik.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, search, sector, refreshSignal]);

  if (loading && !data) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500">
        Yo'nalish ma'lumotlari yuklanmoqda...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const sortedRows = [...data.rows].sort((a, b) => {
    const cmp = a.last_updated_at.localeCompare(b.last_updated_at);
    return sortByDateDesc ? -cmp : cmp;
  });

  const palette = ['#0B1E3B', '#16A34A', '#C59B27'];

  return (
    <div className="space-y-6">
      {/* Direction Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono-tabular text-[#C59B27] font-semibold">
            Yo'nalish {String(data.direction.sort_order).padStart(2, '0')}
          </p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {data.direction.name}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {data.direction.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.permissions.includes('data.enter_manual') && (
            <button
              type="button"
              onClick={onOpenManualEntry}
              className="px-3.5 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ma'lumot kiritish</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenHistoryForDirection(data.direction.id)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Tarixni ko'rish
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                `/api/export?format=xlsx&directionId=${data.direction.id}&title=${encodeURIComponent(
                  data.direction.name
                )}`,
                `${data.direction.slug}.xlsx`
              )
            }
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                `/api/export?format=pdf&directionId=${data.direction.id}&title=${encodeURIComponent(
                  data.direction.name
                )}`,
                `${data.direction.slug}.pdf`
              )
            }
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Indicator KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.indicators.map((ind) => (
          <div
            key={ind.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {ind.name}
              </h3>
              <span
                className={`text-xs font-mono-tabular font-semibold ${
                  ind.changePercent >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {ind.changePercent >= 0 ? `+${ind.changePercent}%` : `${ind.changePercent}%`}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatNum(ind.totalApproved)}
              </span>
              <span className="text-xs text-slate-500">{ind.unit}</span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 font-mono-tabular">
              Oldingi: {formatNum(ind.totalPrevious)} · Kutilmoqda: {ind.pendingCount} ta
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {data.chart.datasets.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Yo'nalish ko'rsatkichlari dinamikasi
          </h3>
          <ChartCanvas
            type="line"
            height={240}
            dark={dark}
            labels={data.chart.labels}
            datasets={data.chart.datasets.map((ds, i) => ({
              label: ds.label,
              data: ds.data,
              color: palette[i % palette.length],
              fill: i === 0,
            }))}
          />
        </div>
      )}

      {/* Search, Filter & Detailed Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mahalla yoki ko'rsatkich qidirish..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            {user.roleSlug !== 'mahalla' && (
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="">Barcha sektorlar</option>
                <option value="1-sektor">1-sektor</option>
                <option value="2-sektor">2-sektor</option>
                <option value="3-sektor">3-sektor</option>
                <option value="4-sektor">4-sektor</option>
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSortByDateDesc(!sortByDateDesc)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sana bo'yicha ({sortByDateDesc ? 'Yangi' : 'Eski'})</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Mahalla</th>
                <th className="px-4 py-3 font-medium">Sektor</th>
                <th className="px-4 py-3 font-medium">Ko'rsatkich</th>
                <th className="px-4 py-3 font-medium text-right">Oldingi</th>
                <th className="px-4 py-3 font-medium text-right">Tasdiqlangan</th>
                <th className="px-4 py-3 font-medium text-right">Tekshiruvda</th>
                <th className="px-4 py-3 font-medium">Holat</th>
                <th className="px-4 py-3 font-medium">Oxirgi yangilanish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Filtr shartlariga mos ma'lumot topilmadi.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const st = translateStatus(row.approval_status);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {row.mahalla_name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.sector}</td>
                      <td className="px-4 py-2.5">
                        {row.indicator_name}{' '}
                        <span className="text-slate-400">({row.unit})</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular">
                        {formatNum(row.previous_value)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {formatNum(row.approved_value)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular text-amber-700 dark:text-amber-400">
                        {row.pending_value !== null ? formatNum(row.pending_value) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 font-medium ${st.tone}`}>{st.label}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-slate-500">
                        {formatTashkentDateTime(row.last_updated_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
