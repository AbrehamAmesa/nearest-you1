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

    if (isTimeoutOrNetwork) {
      error.message = 'Connection error. Unable to reach the server right now. Please try again.';
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
