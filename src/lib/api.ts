let csrfTokenStore = '';

export function setCsrfToken(token: string) {
  csrfTokenStore = token;
}

export function getCsrfToken(): string {
  return csrfTokenStore;
}

export async function apiJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type'] && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfTokenStore) {
    headers['X-CSRF-Token'] = csrfTokenStore;
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const contentType = res.headers.get('content-type') || '';
    const isHtml =
      contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(text);
    data = {
      error: isHtml
        ? 'Server API javobi HTML formatida keldi. Backend xizmatini tekshiring.'
        : text || 'Server javobi noto‘g‘ri.',
    };
  }

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP xatolik: ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function downloadFile(url: string, fallbackName: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (csrfTokenStore) headers['X-CSRF-Token'] = csrfTokenStore;
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || 'Yuklab olishda xatolik.');
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error('Yuklab olishda xatolik.');
    }
  }

  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const match = disp.match(/filename="?([^"]+)"?/i);
  const fileName = match ? match[1] : fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0';
  return val.toLocaleString('uz-UZ');
}

export function formatTashkentDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function translateStatus(status: string): { label: string; tone: string } {
  switch (status) {
    case 'approved':
      return { label: 'Tasdiqlangan', tone: 'text-emerald-700 dark:text-emerald-400' };
    case 'submitted':
      return { label: 'Yuborilgan', tone: 'text-amber-700 dark:text-amber-400' };
    case 'reviewing':
      return { label: 'Tekshirilmoqda', tone: 'text-blue-700 dark:text-blue-400' };
    case 'returned':
      return { label: 'Qaytarilgan', tone: 'text-red-700 dark:text-red-400' };
    case 'draft':
      return { label: 'Qoralama', tone: 'text-slate-600 dark:text-slate-400' };
    default:
      return { label: status, tone: 'text-slate-600 dark:text-slate-400' };
  }
}
