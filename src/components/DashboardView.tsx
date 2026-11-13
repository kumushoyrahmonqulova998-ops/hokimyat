import { ArrowUpRight, ArrowDownRight, ChevronRight, RefreshCw } from 'lucide-react';
import { formatNum, formatTashkentDateTime, translateStatus } from '../lib/api.ts';
import type { DashboardPayload, MahallaItem, PeriodType, RoleSlug } from '../types.ts';
import { ChartCanvas } from './ChartCanvas.tsx';

interface DashboardViewProps {
  data: DashboardPayload | null;
  loading: boolean;
  dark: boolean;
  roleSlug: RoleSlug;
  periodType: PeriodType;
  mahallas: MahallaItem[];
  selectedMahallaId: number | null;
  onSelectMahalla: (id: number | null) => void;
  onRefresh: () => void;
  onOpenDirection: (slug: string) => void;
  onOpenApprovals: () => void;
}

export function DashboardView({
  data,
  loading,
  dark,
  roleSlug,
  mahallas,
  selectedMahallaId,
  onSelectMahalla,
  onRefresh,
  onOpenDirection,
  onOpenApprovals,
}: DashboardViewProps) {
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-16 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Dashboard ma'lumotlari yuklanmadi.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 px-4 py-2 rounded-lg bg-[#0B1E3B] text-white text-xs font-medium"
        >
          Qayta yuklash
        </button>
      </div>
    );
  }

  const { liveUpdates, kpis, charts, dailyActivity, directions } = data;

  return (
    <div className="space-y-6">
      {/* Live Daily Updates Panel */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="font-semibold text-[#0B1E3B] dark:text-[#C59B27] font-mono-tabular">
              OXIRGI YANGILANISH: {liveUpdates.lastUpdatedDisplay}
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
            <span className="text-slate-600 dark:text-slate-300">
              Bugun yangilangan yo'nalishlar:{' '}
              <strong className="font-mono-tabular text-slate-900 dark:text-white">
                {liveUpdates.directionsUpdated} ta
              </strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
            <span className="text-slate-600 dark:text-slate-300">
              Faol mahallalar:{' '}
              <strong className="font-mono-tabular text-slate-900 dark:text-white">
                {liveUpdates.mahallasUpdated} ta
              </strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
            <button
              type="button"
              onClick={onOpenApprovals}
              className="text-amber-700 dark:text-amber-400 hover:underline font-medium"
            >
              Tekshirish kutilmoqda:{' '}
              <strong className="font-mono-tabular">{liveUpdates.pendingApprovals} ta</strong>
            </button>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
            <span className="text-slate-600 dark:text-slate-300">
              Kunlik o'zgarish:{' '}
              <strong
                className={`font-mono-tabular ${
                  liveUpdates.totalDelta >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {liveUpdates.totalDelta >= 0
                  ? `+${formatNum(liveUpdates.totalDelta)}`
                  : formatNum(liveUpdates.totalDelta)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {roleSlug !== 'mahalla' && (
              <select
                value={selectedMahallaId ?? ''}
                onChange={(e) =>
                  onSelectMahalla(e.target.value ? Number(e.target.value) : null)
                }
                aria-label="Mahalla bo'yicha filtr"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              >
                <option value="">Barcha mahallalar (tuman)</option>
                {mahallas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.sector})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Ma'lumotlarni yangilash"
              aria-label="Yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* 8 Core KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const isPositive = kpi.changePercent >= 0;
          return (
            <article
              key={kpi.key}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {kpi.title}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-mono-tabular font-semibold ${
                      isPositive
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {isPositive ? `+${kpi.changePercent}%` : `${kpi.changePercent}%`}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono-tabular">
                    {formatNum(kpi.currentValue)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{kpi.unit}</span>
                </div>

                <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                  <span>
                    Oldingi:{' '}
                    <span className="font-mono-tabular text-slate-700 dark:text-slate-300">
                      {formatNum(kpi.previousValue)}
                    </span>
                  </span>
                  {kpi.pendingDelta !== 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-700 dark:text-amber-400 font-mono-tabular">
                        Tekshiruvda: {kpi.pendingDelta > 0 ? `+${kpi.pendingDelta}` : kpi.pendingDelta}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {kpi.sparkline.length > 1 ? (
                  <ChartCanvas
                    type="line"
                    sparkline
                    height={38}
                    dark={dark}
                    labels={kpi.sparkline.map((s) => s.label)}
                    datasets={[
                      {
                        label: kpi.title,
                        data: kpi.sparkline.map((s) => s.value),
                        color: isPositive ? '#16A34A' : '#DC2626',
                        fill: true,
                      },
                    ]}
                  />
                ) : (
                  <div className="h-[38px] flex items-center text-[11px] text-slate-400">
                    Oxirgi yangilanish: {formatTashkentDateTime(kpi.lastUpdatedAt)}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Chart.js Analytical Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Aholi o'sishi va oilalar dinamikasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tasdiqlangan tarixiy kesimlar bo'yicha
              </p>
            </div>
          </div>
          <ChartCanvas
            type="line"
            height={230}
            dark={dark}
            labels={charts.populationFamilies.labels}
            datasets={[
              {
                label: 'Doimiy aholi (nafar)',
                data: charts.populationFamilies.series['demo_aholi'] || [],
                color: '#0B1E3B',
                fill: true,
              },
              {
                label: 'Oilalar soni (ta)',
                data: charts.populationFamilies.series['demo_oilalar'] || [],
                color: '#C59B27',
              },
            ]}
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Bandlik ko'rsatkichlari dinamikasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aniqlangan ishsizlar, ishga joylashtirilgan va o'zini o'zi band qilganlar
              </p>
            </div>
          </div>
          <ChartCanvas
            type="bar"
            height={230}
            dark={dark}
            labels={charts.employment.labels}
            datasets={[
              {
                label: 'Aniqlangan ishsizlar',
                data: charts.employment.series['bandlik_ishsizlar'] || [],
                color: '#DC2626',
              },
              {
                label: 'Ishga joylashtirilganlar',
                data: charts.employment.series['bandlik_ishga_joy'] || [],
                color: '#16A34A',
              },
              {
                label: "O'zini o'zi band qilganlar",
                data: charts.employment.series['bandlik_ozini_band'] || [],
                color: '#1D4ED8',
              },
            ]}
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ijtimoiy reyestr, subsidiyalar, ta'lim va tibbiy yordam
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Asosiy ijtimoiy himoya ko'rsatkichlari o'zgarishi
              </p>
            </div>
          </div>
          <ChartCanvas
            type="line"
            height={230}
            dark={dark}
            labels={charts.subsidiesMedicalEducation.labels}
            datasets={[
              {
                label: 'Ajratilgan subsidiyalar',
                data: charts.subsidiesMedicalEducation.series['subs_ajratilgan'] || [],
                color: '#C59B27',
              },
              {
                label: "Bog'chaga qamralgan bolalar",
                data: charts.subsidiesMedicalEducation.series['mtt_qamralgan'] || [],
                color: '#1D4ED8',
              },
              {
                label: 'Davolangan bemorlar',
                data: charts.subsidiesMedicalEducation.series['tib_davolangan'] || [],
                color: '#16A34A',
              },
            ]}
          />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Mahallalar kesimida bandlik va mablag' ijrosi (%)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Faqat tasdiqlangan ko'rsatkichlar asosida taqqoslash
              </p>
            </div>
          </div>
          <ChartCanvas
            type="bar"
            height={230}
            dark={dark}
            labels={charts.mahallaComparison.map((m) => m.name.replace(' MFY', ''))}
            datasets={[
              {
                label: 'Bandlik ijrosi (%)',
                data: charts.mahallaComparison.map((m) => m.employmentPercent),
                color: '#16A34A',
              },
              {
                label: "Mablag' o'zlashtirish (%)",
                data: charts.mahallaComparison.map((m) => m.fundPercent),
                color: '#1D4ED8',
              },
            ]}
          />
        </div>
      </section>

      {/* Daily Activity Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kunlik faoliyat va oxirgi o'zgarishlar jadvali
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kim, qaysi mahalla, qaysi yo'nalish va qancha o'zgarish kiritgani
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            Oxirgi {dailyActivity.length} ta yozuv
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Foydalanuvchi</th>
                <th className="px-4 py-3 font-medium">Mahalla</th>
                <th className="px-4 py-3 font-medium">Yo'nalish / Ko'rsatkich</th>
                <th className="px-4 py-3 font-medium text-right">Eski → Yangi</th>
                <th className="px-4 py-3 font-medium text-right">Farq</th>
                <th className="px-4 py-3 font-medium">Sana / Vaqt</th>
                <th className="px-4 py-3 font-medium">Tasdiqlash holati</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {dailyActivity.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Hozircha kunlik yozuvlar mavjud emas.
                  </td>
                </tr>
              ) : (
                dailyActivity.map((act) => {
                  const st = translateStatus(act.approval_status);
                  return (
                    <tr
                      key={act.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {act.changed_by_name}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {act.mahalla_name}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenDirection(act.direction_slug)}
                          className="text-left hover:underline text-slate-900 dark:text-slate-100 font-medium"
                        >
                          {act.indicator_name}
                        </button>
                        <div className="text-[11px] text-slate-500">{act.direction_name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {formatNum(act.old_value)} → <strong>{formatNum(act.new_value)}</strong>{' '}
                        <span className="text-slate-400">{act.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                        <span
                          className={
                            act.difference >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {act.difference >= 0
                            ? `+${formatNum(act.difference)}`
                            : formatNum(act.difference)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-slate-500">
                        {formatTashkentDateTime(act.changed_at)}
                      </td>
                      <td className={`px-4 py-3 font-medium ${st.tone}`}>{st.label}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 14 Directions Overview Grid */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              PF-193 bo'yicha yo'nalishlar kesimi ({directions.length} ta)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Har bir yo'nalishning batafsil jadvali, grafiklari va eksporti uchun tanlang
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {directions.map((dir) => (
            <button
              key={dir.id}
              type="button"
              onClick={() => onOpenDirection(dir.slug)}
              className="text-left p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0B1E3B] dark:hover:border-[#C59B27] transition-colors flex flex-col justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono-tabular text-slate-500">
                    {String(dir.sort_order).padStart(2, '0')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {dir.name}
                </h4>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between font-mono-tabular">
                <span>{dir.indicator_count || 0} ko'rsatkich</span>
                {Number(dir.pending_count) > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {dir.pending_count} kutilmoqda
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
