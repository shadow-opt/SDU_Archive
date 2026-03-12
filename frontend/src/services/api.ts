export const apiBase = import.meta.env.VITE_API_BASE ?? '';

export const getAuthToken = () => localStorage.getItem('token');
export const clearAuthToken = () => localStorage.removeItem('token');

type ApiErrorOptions = {
  redirectOn401To?: string | null;
};

type ApiRequestOptions = RequestInit & ApiErrorOptions & {
  includeJsonContentType?: boolean;
};

const authErrorMessage = (status: number) => {
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 403) return '权限不足，无法执行该操作';
  return null;
};

export const getAuthHeaders = (includeJsonContentType = true): Record<string, string> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const fetcher = async (url: string) => {
  const headers = getAuthHeaders(true);

  const res = await fetch(`${apiBase}${url}`, { headers });
  if (!res.ok) {
    const authMessage = authErrorMessage(res.status);
    if (authMessage) {
      clearAuthToken();
      // Auto-redirect to login page (avoid loop if already there)
      if (res.status === 401 && !window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    const error = new Error(authMessage ?? 'An error occurred while fetching the data.');
    // Attach extra info to the error object.
    (error as any).info = await res.json().catch(() => ({}));
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

export const parseApiError = async (res: Response, fallback: string, options: ApiErrorOptions = {}) => {
  const authMessage = authErrorMessage(res.status);
  if (authMessage) {
    clearAuthToken();
    if (res.status === 401 && options.redirectOn401To) {
      window.location.href = options.redirectOn401To;
    }
    return authMessage;
  }
  const payload = await res.json().catch(() => ({}));
  return (payload as { detail?: string }).detail ?? fallback;
};

export const apiRequest = async <T>(url: string, options: ApiRequestOptions = {}, fallback = '请求失败'): Promise<T> => {
  const {
    includeJsonContentType = true,
    redirectOn401To = null,
    headers,
    ...init
  } = options;

  const res = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      ...getAuthHeaders(includeJsonContentType),
      ...(headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(await parseApiError(res, fallback, { redirectOn401To }));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
};
