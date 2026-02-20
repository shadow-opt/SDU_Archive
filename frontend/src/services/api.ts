export const apiBase = import.meta.env.VITE_API_BASE ?? '';

export const getAuthToken = () => localStorage.getItem('token');
export const clearAuthToken = () => localStorage.removeItem('token');

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
    }
    const error = new Error(authMessage ?? 'An error occurred while fetching the data.');
    // Attach extra info to the error object.
    (error as any).info = await res.json().catch(() => ({}));
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

export const parseApiError = async (res: Response, fallback: string) => {
  const authMessage = authErrorMessage(res.status);
  if (authMessage) {
    clearAuthToken();
    return authMessage;
  }
  const payload = await res.json().catch(() => ({}));
  return (payload as { detail?: string }).detail ?? fallback;
};
