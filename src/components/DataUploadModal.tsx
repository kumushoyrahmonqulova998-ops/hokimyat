import { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  FileJson,
  PenLine,
  History,
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { apiJson, downloadFile, formatNum, formatTashkentDateTime } from '../lib/api.ts';
import type { AuthUser, DirectionItem, IndicatorItem, MahallaItem } from '../types.ts';

interface DataUploadModalProps {
  open: boolean;
  initialTab?: 'excel' | 'json' | 'manual' | 'history';
  onClose: () => void;
  user: AuthUser;
  directions: DirectionItem[];
  indicators: IndicatorItem[];
  mahallas: MahallaItem[];
  onDataCommitted: () => void;
}

interface PreviewRow {
  rowNumber: number;
  mahallaCode: string;
  mahallaName: string;
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  oldValue: number;
  newValue: number | null;
  delta: number | null;
  comment: string;
  status: 'valid' | 'error';
  errorMessage: string | null;
}

interface ImportPreviewResponse {
  importId: number;
  fileName: string;
  fileType: string;
  totalRows: number;
  validCount: number;
  errorCount: number;
  canCommit: boolean;
  rows: PreviewRow[];
}

interface ImportHistoryItem {
  id: number;
  file_name: string;
  file_type: string;
  direction_name: string | null;
  uploaded_by_name: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  status: string;
  created_at: string;
  committed_at: string | null;
}

export function DataUploadModal({
  open,
  initialTab = 'excel',
  onClose,
  user,
  directions,
  indicators,
  mahallas,
  onDataCommitted,
}: DataUploadModalProps) {
  const [tab, setTab] = useState<'excel' | 'json' | 'manual' | 'history'>(initialTab);
  const [directionId, setDirectionId] = useState<string>('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Manual entry state
  const [manualDirId, setManualDirId] = useState<number>(directions[0]?.id || 1);
  const [manualMahallaId, setManualMahallaId] = useState<number>(
    user.mahallaId || mahallas[0]?.id || 1
  );
  const [manualIndicatorId, setManualIndicatorId] = useState<number>(0);
  const [manualValue, setManualValue] = useState<string>('');
  const [manualComment, setManualComment] = useState<string>('');

  // Recent import history
  const [imports, setImports] = useState<ImportHistoryItem[]>([]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setError('');
      setSuccessMsg('');
      setPreview(null);
      if (directions.length > 0 && !directions.some((d) => d.id === manualDirId)) {
        setManualDirId(directions[0].id);
      }
      if (user.mahallaId) {
        setManualMahallaId(user.mahallaId);
      } else if (mahallas.length > 0 && !mahallas.some((m) => m.id === manualMahallaId)) {
        setManualMahallaId(mahallas[0].id);
      }
      loadImportsHistory();
    }
  }, [open, initialTab]);

  const dirIndicators = indicators.filter((i) => i.direction_id === manualDirId);
  useEffect(() => {
    if (dirIndicators.length > 0 && !dirIndicators.some((i) => i.id === manualIndicatorId)) {
      setManualIndicatorId(dirIndicators[0].id);
    }
  }, [manualDirId, indicators]);

  async function loadImportsHistory() {
    try {
      const res = await apiJson<{ imports: ImportHistoryItem[] }>('/api/imports/history?limit=20');
      setImports(res.imports);
    } catch {
      // ignore transient error
    }
  }

  if (!open) return null;

  async function handleExcelPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!excelFile) {
      setError('Iltimos, .xlsx yoki .csv faylini tanlang.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      if (directionId) fd.append('directionId', directionId);

      const res = await apiJson<ImportPreviewResponse>('/api/imports/excel', {
        method: 'POST',
        body: fd,
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Faylni tekshirishda xatolik.');
    } finally {
      setLoading(false);
    }
  }

  async function handleJsonPreview(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      let res: ImportPreviewResponse;
      if (jsonFile) {
        const fd = new FormData();
        fd.append('file', jsonFile);
        if (directionId) fd.append('directionId', directionId);
        res = await apiJson<ImportPreviewResponse>('/api/imports/json', {
          method: 'POST',
          body: fd,
        });
      } else {
        res = await apiJson<ImportPreviewResponse>('/api/imports/json', {
          method: 'POST',
          body: JSON.stringify({
            jsonText,
            directionId: directionId ? Number(directionId) : null,
          }),
        });
      }
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON tekshirishda xatolik.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCommit() {
    if (!preview) return;
    setError('');
    setLoading(true);
    try {
      const res = await apiJson<{ message: string }>(`/api/imports/${preview.importId}/commit`, {
        method: 'POST',
      });
      setSuccessMsg(res.message);
      setPreview(null);
      setExcelFile(null);
      setJsonFile(null);
      setJsonText('');
      await loadImportsHistory();
      onDataCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotlarni saqlashda xatolik.");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    const numVal = Number(manualValue);
    if (!Number.isFinite(numVal) || numVal < 0) {
      setError("Qiymat 0 yoki undan katta haqiqiy son bo'lishi kerak.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiJson<{ message: string }>('/api/data/manual', {
        method: 'POST',
        body: JSON.stringify({
          indicatorId: manualIndicatorId,
          mahallaId: manualMahallaId,
          newValue: numVal,
          comment: manualComment,
        }),
      });
      setSuccessMsg(res.message);
      setManualValue('');
      setManualComment('');
      onDataCommitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ma'lumotni saqlashda xatolik.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0B1E3B] text-white flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold">Ma'lumotlarni yuklash va kiritish</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Excel (.xlsx / .csv), JSON fayl yoki yozma shakl orqali tarixiy saqlash bilan kiritish
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 shrink-0 bg-slate-50 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={() => {
              setTab('excel');
              setPreview(null);
              setError('');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === 'excel'
                ? 'bg-[#0B1E3B] text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel / CSV yuklash</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('json');
              setPreview(null);
              setError('');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === 'json'
                ? 'bg-[#0B1E3B] text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <FileJson className="w-4 h-4" />
            <span>JSON yuklash</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('manual');
              setPreview(null);
              setError('');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === 'manual'
                ? 'bg-[#0B1E3B] text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <PenLine className="w-4 h-4" />
            <span>Yozma ravishda kiritish</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('history');
              loadImportsHistory();
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === 'history'
                ? 'bg-[#0B1E3B] text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Import tarixi ({imports.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {tab === 'excel' && !preview && (
            <form onSubmit={handleExcelPreview} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Qo'llab-quvvatlanadigan ustunlar:
                  </p>
                  <p className="font-mono-tabular mt-1">
                    mahalla_code · indicator_code · new_value · comment
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      `/api/imports/template?format=xlsx${directionId ? `&directionId=${directionId}` : ''}`,
                      'pf193_shablon.xlsx'
                    )
                  }
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel shablon yuklash</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Yo'nalishni tanlang (ixtiyoriy tekshiruv)
                  </label>
                  <select
                    value={directionId}
                    onChange={(e) => setDirectionId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    <option value="">Barcha ruxsat etilgan yo'nalishlar</option>
                    {directions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.sort_order}. {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Excel (.xlsx) yoki CSV (.csv) fayl
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                    className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#0B1E3B] file:text-white hover:file:bg-[#132C54] border border-slate-300 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !excelFile}
                className="px-5 py-2.5 bg-[#0B1E3B] hover:bg-[#132C54] disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>{loading ? 'Tekshirilmoqda...' : 'Faylni tekshirish va oldindan ko‘rish'}</span>
              </button>
            </form>
          )}

          {tab === 'json' && !preview && (
            <form onSubmit={handleJsonPreview} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">JSON formati namunasi:</p>
                  <p className="font-mono-tabular mt-1">
                    {`[{"mahalla_code":"M01","indicator_code":"demo_aholi","new_value":4850,"comment":"Yangilash"}]`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      `/api/imports/template?format=json${directionId ? `&directionId=${directionId}` : ''}`,
                      'pf193_shablon.json'
                    )
                  }
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON shablon yuklash</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Yo'nalish filtri (ixtiyoriy)
                  </label>
                  <select
                    value={directionId}
                    onChange={(e) => setDirectionId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    <option value="">Barcha ruxsat etilgan yo'nalishlar</option>
                    {directions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.sort_order}. {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    JSON fayl tanlash (.json)
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setJsonFile(e.target.files?.[0] || null)}
                    className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#0B1E3B] file:text-white hover:file:bg-[#132C54] border border-slate-300 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Yoki JSON matnini to'g'ridan-to'g'ri joylashtiring
                </label>
                <textarea
                  rows={5}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='[{"mahalla_code":"M01","indicator_code":"bandlik_ishga_joy","new_value":82,"comment":"Oylik yangilanish"}]'
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono-tabular text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={loading || (!jsonFile && !jsonText.trim())}
                className="px-5 py-2.5 bg-[#0B1E3B] hover:bg-[#132C54] disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {loading ? 'Tekshirilmoqda...' : 'JSON ni tekshirish va taqqoslash'}
              </button>
            </form>
          )}

          {/* Import Preview & Confirmation View */}
          {preview && (tab === 'excel' || tab === 'json') && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    Oldindan ko'rish: {preview.fileName}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 font-mono-tabular">
                    Jami qatorlar: {preview.totalRows} · To'g'ri: {preview.validCount} · Xato: {preview.errorCount}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    disabled={!preview.canCommit || loading}
                    onClick={handleConfirmCommit}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-medium"
                  >
                    {loading ? 'Saqlanmoqda...' : `Tasdiqlash va saqlash (${preview.validCount})`}
                  </button>
                </div>
              </div>

              {preview.errorCount > 0 && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                  Xato kataklar mavjud bo'lsa, qisman saqlashga ruxsat berilmaydi. Iltimos, faylni tuzatib qayta yuklang.
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg max-h-80">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Mahalla</th>
                      <th className="px-3 py-2">Ko'rsatkich</th>
                      <th className="px-3 py-2 text-right">Eski qiymat</th>
                      <th className="px-3 py-2 text-right">Yangi qiymat</th>
                      <th className="px-3 py-2 text-right">Farq</th>
                      <th className="px-3 py-2">Holat / Xabar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {preview.rows.map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={
                          r.status === 'error'
                            ? 'bg-red-50/70 dark:bg-red-950/30'
                            : 'bg-white dark:bg-slate-900'
                        }
                      >
                        <td className="px-3 py-2 font-mono-tabular">{r.rowNumber}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{r.mahallaName}</span>
                          <span className="text-slate-400 ml-1 font-mono-tabular">({r.mahallaCode})</span>
                        </td>
                        <td className="px-3 py-2">
                          <span>{r.indicatorName}</span>
                          <span className="text-slate-400 ml-1 font-mono-tabular">[{r.indicatorCode}]</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular">{formatNum(r.oldValue)}</td>
                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold">
                          {r.newValue !== null ? formatNum(r.newValue) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular">
                          {r.delta !== null ? (
                            <span className={r.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                              {r.delta >= 0 ? `+${formatNum(r.delta)}` : formatNum(r.delta)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.status === 'valid' ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">Tayyor</span>
                          ) : (
                            <span className="text-red-700 dark:text-red-400 font-medium">{r.errorMessage}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Yo'nalish
                  </label>
                  <select
                    value={manualDirId}
                    onChange={(e) => setManualDirId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    {directions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.sort_order}. {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Mahalla
                  </label>
                  <select
                    value={manualMahallaId}
                    disabled={user.roleSlug === 'mahalla'}
                    onChange={(e) => setManualMahallaId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-70"
                  >
                    {mahallas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Ko'rsatkich
                  </label>
                  <select
                    value={manualIndicatorId}
                    onChange={(e) => setManualIndicatorId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    {dirIndicators.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.name} ({ind.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Yangi qiymat ({dirIndicators.find((i) => i.id === manualIndicatorId)?.unit || ''})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    placeholder="Masalan: 1250"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Izoh / asos (tarixiy yozuvda saqlanadi)
                </label>
                <input
                  type="text"
                  required
                  value={manualComment}
                  onChange={(e) => setManualComment(e.target.value)}
                  placeholder="Masalan: Haftalik xatlov natijasiga ko'ra yangilandi"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {user.roleSlug === 'mahalla'
                    ? "Mahalla kiritgan ma'lumot tasdiqlash navbatiga yuboriladi."
                    : "Barcha o'zgarishlar yangi tarixiy versiya sifatida qayd etiladi."}
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[#0B1E3B] hover:bg-[#132C54] disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {loading ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          )}

          {tab === 'history' && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">Fayl nomi</th>
                    <th className="px-3.5 py-2.5">Yuklagan</th>
                    <th className="px-3.5 py-2.5">Yo'nalish</th>
                    <th className="px-3.5 py-2.5">Sana / Vaqt</th>
                    <th className="px-3.5 py-2.5 text-right">Muvaffaqiyatli</th>
                    <th className="px-3.5 py-2.5 text-right">Xato</th>
                    <th className="px-3.5 py-2.5">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {imports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Hozircha import tarixi mavjud emas.
                      </td>
                    </tr>
                  ) : (
                    imports.map((imp) => (
                      <tr key={imp.id} className="bg-white dark:bg-slate-900">
                        <td className="px-3.5 py-2.5 font-medium">
                          {imp.file_name}{' '}
                          <span className="text-slate-400 font-mono-tabular uppercase">({imp.file_type})</span>
                        </td>
                        <td className="px-3.5 py-2.5">{imp.uploaded_by_name}</td>
                        <td className="px-3.5 py-2.5">{imp.direction_name || 'Umumiy'}</td>
                        <td className="px-3.5 py-2.5 font-mono-tabular">
                          {formatTashkentDateTime(imp.committed_at || imp.created_at)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono-tabular text-emerald-700 dark:text-emerald-400">
                          {imp.success_rows}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono-tabular text-red-600">
                          {imp.error_rows}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium">
                          {imp.status === 'completed'
                            ? 'Bajarildi'
                            : imp.status === 'failed'
                              ? 'Xato'
                              : "Ko'rib chiqilgan"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
