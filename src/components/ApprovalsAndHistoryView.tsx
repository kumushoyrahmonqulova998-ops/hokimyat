import { useEffect, useState } from 'react';
import { Check, RotateCcw, Eye, Search, PlusCircle } from 'lucide-react';
import { apiJson, formatNum, formatTashkentDateTime, translateStatus } from '../lib/api.ts';
import type { AuthUser, DirectionItem, IndicatorItem, MahallaItem } from '../types.ts';

interface ApprovalsViewProps {
  user: AuthUser;
  onChanged: () => void;
}

interface ApprovalRow {
  id: number;
  indicator_id: number;
  mahalla_id: number;
  status: string;
  old_value: number;
  new_value: number;
  difference: number;
  source: string;
  submission_comment: string;
  decision_comment: string;
  indicator_name: string;
  unit: string;
  direction_name: string;
  mahalla_name: string;
  sector: string;
  submitted_by_name: string;
  reviewed_by_name: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export function ApprovalsView({ user, onChanged }: ApprovalsViewProps) {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [commentMap, setCommentMap] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canApprove = user.permissions.includes('data.approve') || user.roleSlug === 'super_admin';

  async function load() {
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await apiJson<{ approvals: ApprovalRow[] }>(`/api/approvals${qs}`);
      setApprovals(res.approvals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yuklashda xatolik.');
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function handleReview(id: number, decision: 'approved' | 'returned' | 'reviewing') {
    setError('');
    setMessage('');
    try {
      const res = await apiJson<{ message: string }>(`/api/approvals/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comment: commentMap[id] || '',
        }),
      });
      setMessage(res.message);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qarorni saqlashda xatolik.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Ma'lumotlarni tekshirish va tasdiqlash navbati
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tasdiqlanmagan ma'lumotlar umumiy rasmiy statistikaga qo'shilmaydi
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">Barcha holatlar</option>
          <option value="submitted">Yuborilgan</option>
          <option value="reviewing">Tekshirilmoqda</option>
          <option value="approved">Tasdiqlangan</option>
          <option value="returned">Qaytarilgan</option>
        </select>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Mahalla</th>
                <th className="px-4 py-3">Yo'nalish / Ko'rsatkich</th>
                <th className="px-4 py-3 text-right">Eski → Yangi</th>
                <th className="px-4 py-3">Izoh</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Sana</th>
                {canApprove && <th className="px-4 py-3">Qaror va izoh</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {approvals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Tekshirish uchun arizalar mavjud emas.
                  </td>
                </tr>
              ) : (
                approvals.map((a) => {
                  const st = translateStatus(a.status);
                  const pending = a.status === 'submitted' || a.status === 'reviewing';
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium">
                        <div>{a.mahalla_name}</div>
                        <div className="text-[11px] text-slate-400">{a.submitted_by_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.indicator_name}</div>
                        <div className="text-[11px] text-slate-500">{a.direction_name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {formatNum(a.old_value)} → <strong>{formatNum(a.new_value)}</strong>{' '}
                        <span className="text-slate-400">{a.unit}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div>{a.submission_comment}</div>
                        {a.decision_comment && a.status !== 'submitted' && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Qaror izohi: {a.decision_comment}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 font-medium ${st.tone}`}>{st.label}</td>
                      <td className="px-4 py-3 font-mono-tabular text-slate-500">
                        {formatTashkentDateTime(a.created_at)}
                      </td>
                      {canApprove && (
                        <td className="px-4 py-3">
                          {pending ? (
                            <div className="space-y-1.5 min-w-[220px]">
                              <input
                                type="text"
                                value={commentMap[a.id] || ''}
                                onChange={(e) =>
                                  setCommentMap({ ...commentMap, [a.id]: e.target.value })
                                }
                                placeholder="Izoh (qaytarishda majburiy)"
                                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleReview(a.id, 'approved')}
                                  className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-medium flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Tasdiqlash</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReview(a.id, 'reviewing')}
                                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] flex items-center gap-1"
                                  title="Tekshiruvga olish"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReview(a.id, 'returned')}
                                  className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Qaytarish</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {a.reviewed_by_name || '—'} · {formatTashkentDateTime(a.reviewed_at)}
                            </span>
                          )}
                        </td>
                      )}
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

interface HistoryViewProps {
  user: AuthUser;
  directions: DirectionItem[];
  indicators: IndicatorItem[];
  mahallas: MahallaItem[];
  initialDirectionId?: number | null;
  onDataChanged: () => void;
}

interface HistoryRow {
  id: number;
  indicator_id: number;
  mahalla_id: number;
  old_value: number;
  new_value: number;
  difference: number;
  percent_change: number;
  changed_by_name: string;
  changed_at: string;
  source: string;
  approval_status: string;
  comment: string;
  indicator_name: string;
  unit: string;
  direction_name: string;
  mahalla_name: string;
}

export function HistoryLedgerView({
  user,
  directions,
  indicators,
  mahallas,
  initialDirectionId,
  onDataChanged,
}: HistoryViewProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [directionId, setDirectionId] = useState<string>(
    initialDirectionId ? String(initialDirectionId) : ''
  );
  const [mahallaId, setMahallaId] = useState<string>(user.mahallaId ? String(user.mahallaId) : '');
  const [search, setSearch] = useState('');

  // Append-only correction form
  const [showCorrect, setShowCorrect] = useState(false);
  const [corrDirId, setCorrDirId] = useState<number>(directions[0]?.id || 1);
  const [corrIndId, setCorrIndId] = useState<number>(0);
  const [corrMahId, setCorrMahId] = useState<number>(mahallas[0]?.id || 1);
  const [corrValue, setCorrValue] = useState('');
  const [corrComment, setCorrComment] = useState('');
  const [corrMsg, setCorrMsg] = useState('');
  const [corrErr, setCorrErr] = useState('');

  const corrIndicators = indicators.filter((i) => i.direction_id === corrDirId);
  useEffect(() => {
    if (corrIndicators.length > 0 && !corrIndicators.some((i) => i.id === corrIndId)) {
      setCorrIndId(corrIndicators[0].id);
    }
  }, [corrDirId, indicators]);

  async function loadHistory() {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (directionId) params.set('directionId', directionId);
    if (mahallaId) params.set('mahallaId', mahallaId);
    if (search) params.set('search', search);

    const res = await apiJson<{ total: number; rows: HistoryRow[] }>(
      `/api/history?${params.toString()}`
    );
    setRows(res.rows);
    setTotal(res.total);
  }

  useEffect(() => {
    loadHistory();
  }, [page, directionId, mahallaId, search]);

  async function handleCorrection(e: React.FormEvent) {
    e.preventDefault();
    setCorrErr('');
    setCorrMsg('');
    try {
      const res = await apiJson<{ message: string }>('/api/history/correct', {
        method: 'POST',
        body: JSON.stringify({
          indicatorId: corrIndId,
          mahallaId: corrMahId,
          correctedValue: Number(corrValue),
          comment: corrComment,
        }),
      });
      setCorrMsg(res.message);
      setCorrValue('');
      setCorrComment('');
      setShowCorrect(false);
      await loadHistory();
      onDataChanged();
    } catch (err) {
      setCorrErr(err instanceof Error ? err.message : 'Xatolik.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Ma'lumotlar o'zgarishlar tarixi (O'chirilmaydigan jurnal)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Har bir qiymat o'zgarishi yangi versiya sifatida saqlanadi; eski tarix hech qachon o'chirilmaydi
            </p>
          </div>
          {(user.roleSlug === 'super_admin' || user.roleSlug === 'admin_one') && (
            <button
              type="button"
              onClick={() => setShowCorrect(!showCorrect)}
              className="px-3.5 py-2 rounded-lg bg-[#0B1E3B] hover:bg-[#132C54] text-white text-xs font-medium flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tuzatish yozuvi kiritish</span>
            </button>
          )}
        </div>

        {showCorrect && (
          <form
            onSubmit={handleCorrection}
            className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3"
          >
            <p className="text-xs font-semibold">
              Yangi tuzatish versiyasi (oldingi qiymatlar tarixda saqlanib qoladi)
            </p>
            {corrErr && <p className="text-xs text-red-600">{corrErr}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={corrDirId}
                onChange={(e) => setCorrDirId(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={corrIndId}
                onChange={(e) => setCorrIndId(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                {corrIndicators.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <select
                value={corrMahId}
                onChange={(e) => setCorrMahId(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                {mahallas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={corrValue}
                onChange={(e) => setCorrValue(e.target.value)}
                placeholder="To'g'rilangan qiymat"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono-tabular"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={corrComment}
                onChange={(e) => setCorrComment(e.target.value)}
                placeholder="Tuzatish sababi (majburiy)"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium"
              >
                Saqlash
              </button>
            </div>
          </form>
        )}

        {corrMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
            {corrMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Ko'rsatkich, mahalla yoki izoh..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>
          <select
            value={directionId}
            onChange={(e) => {
              setPage(1);
              setDirectionId(e.target.value);
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          >
            <option value="">Barcha yo'nalishlar</option>
            {directions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.sort_order}. {d.name}
              </option>
            ))}
          </select>
          <select
            value={mahallaId}
            disabled={user.roleSlug === 'mahalla'}
            onChange={(e) => {
              setPage(1);
              setMahallaId(e.target.value);
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs disabled:opacity-70"
          >
            <option value="">Barcha mahallalar</option>
            {mahallas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Sana / Vaqt</th>
                <th className="px-4 py-3">Mahalla</th>
                <th className="px-4 py-3">Yo'nalish / Ko'rsatkich</th>
                <th className="px-4 py-3 text-right">Oldingi</th>
                <th className="px-4 py-3 text-right">Yangi</th>
                <th className="px-4 py-3 text-right">Farq (%)</th>
                <th className="px-4 py-3">Manba</th>
                <th className="px-4 py-3">Kim / Izoh</th>
                <th className="px-4 py-3">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((r) => {
                const st = translateStatus(r.approval_status);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono-tabular text-slate-500">
                      {formatTashkentDateTime(r.changed_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{r.mahalla_name}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.indicator_name}</div>
                      <div className="text-[11px] text-slate-500">{r.direction_name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular">
                      {formatNum(r.old_value)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular font-semibold">
                      {formatNum(r.new_value)} <span className="text-slate-400">{r.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tabular">
                      <span
                        className={
                          r.difference >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600'
                        }
                      >
                        {r.difference >= 0 ? `+${formatNum(r.difference)}` : formatNum(r.difference)}
                      </span>{' '}
                      <span className="text-slate-400">({r.percent_change}%)</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono-tabular uppercase text-slate-500">
                      {r.source}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.changed_by_name}</div>
                      <div className="text-[11px] text-slate-500">{r.comment}</div>
                    </td>
                    <td className={`px-4 py-2.5 font-medium ${st.tone}`}>{st.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-mono-tabular">
            Jami: {total} ta tarixiy yozuv · Sahifa {page}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
            >
              Oldingi
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
            >
              Keyingi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
