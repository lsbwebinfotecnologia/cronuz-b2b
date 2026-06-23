import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://cronuzb2b.com.br/api';

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 75000, // 75s — aguarda o backend processar a resposta do Horus (até 60s read)
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Callback de sessão expirada ──────────────────────────────────────────────
// Registrado no _layout.tsx para acionar o logout do auth store sem circular dep.
type SessionExpiredCallback = () => void;
let _onSessionExpired: SessionExpiredCallback | null = null;

export function registerSessionExpiredCallback(cb: SessionExpiredCallback) {
  _onSessionExpired = cb;
}

// ─── Interceptor de request: injeta JWT ───────────────────────────────────────
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Interceptor de response: trata erros globais ─────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido — limpa sessão e aciona logout
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('user_data');
      await SecureStore.deleteItemAsync('mobile_modules');

      // Notifica o auth store para atualizar o estado e redirecionar para login
      _onSessionExpired?.();
    }
    return Promise.reject(error);
  }
);

export default api;
export { BASE_URL };
