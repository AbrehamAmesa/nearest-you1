import axios from 'axios';

let tokenProvider: (() => Promise<string | null>) | null = null;
export const setApiTokenProvider = (provider: () => Promise<string | null>) => {
  tokenProvider = provider;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 90000,
});

api.interceptors.request.use(async (config) => {
  if (tokenProvider && !config.headers.Authorization) {
    const token = await tokenProvider();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isTimeoutOrNetwork =
      error?.code === 'ECONNABORTED' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ERR_NETWORK' ||
      /timeout/i.test(String(error?.message || '')) ||
      (!error?.response && /network error/i.test(String(error?.message || '')));

    const responseData = error?.response?.data;
    const status = error?.response?.status;
    if (isTimeoutOrNetwork) {
      error.message = 'Connection error. Unable to reach the server right now. Please try again.';
    } else if (typeof responseData === 'string' && /<(?:!doctype|html|head|body)\b/i.test(responseData)) {
      error.message = status
        ? `Backend service unavailable (HTTP ${status}).`
        : 'Backend service unavailable.';
    } else if (responseData && typeof responseData === 'object') {
      const apiMsg = responseData.error || responseData.message;
      if (typeof apiMsg === 'string' && apiMsg.trim()) {
        error.message = apiMsg.trim();
      }
    }

    console.warn('API response error:', status || 'NETWORK', error.message);
    return Promise.reject(error);
  }
);

export default api;
