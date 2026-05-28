export const apiBase = import.meta.env.VITE_API_BASE ?? '';

const AUTH_TOKEN_KEY = 'token';
const QUIZ_GUEST_TOKEN_KEY = 'guest_quiz_token';

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
export const clearAuthToken = () => localStorage.removeItem(AUTH_TOKEN_KEY);
export const getQuizGuestToken = () => localStorage.getItem(QUIZ_GUEST_TOKEN_KEY);
export const clearQuizGuestToken = () => localStorage.removeItem(QUIZ_GUEST_TOKEN_KEY);
export const getQuizAuthToken = () => getAuthToken() || getQuizGuestToken();

type ApiErrorOptions = {
  redirectOn401To?: string | null;
};

type ApiRequestOptions = RequestInit & ApiErrorOptions & {
  includeJsonContentType?: boolean;
};

type ApiRequestError = Error & {
  info?: unknown;
  status?: number;
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

export const getQuizAuthHeaders = (includeJsonContentType = true): Record<string, string> => {
  const token = getQuizAuthToken();
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const ensureGuestQuizToken = async () => {
  const existingToken = getQuizAuthToken();
  if (existingToken) {
    return existingToken;
  }
  const res = await fetch(`${apiBase}/api/quiz/guest-session`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(await parseApiError(res, '游客会话创建失败'));
  }
  const data = (await res.json()) as { access_token: string };
  localStorage.setItem(QUIZ_GUEST_TOKEN_KEY, data.access_token);
  return data.access_token;
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
    const error: ApiRequestError = new Error(authMessage ?? 'An error occurred while fetching the data.');
    // Attach extra info to the error object.
    error.info = await res.json().catch(() => ({}));
    error.status = res.status;
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

export const quizApiRequest = async <T>(url: string, options: ApiRequestOptions = {}, fallback = '请求失败'): Promise<T> => {
  const {
    includeJsonContentType = true,
    redirectOn401To = null,
    headers,
    ...init
  } = options;

  const res = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: {
      ...getQuizAuthHeaders(includeJsonContentType),
      ...(headers ?? {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearQuizGuestToken();
    }
    throw new Error(await parseApiError(res, fallback, { redirectOn401To }));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
};
