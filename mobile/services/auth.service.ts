import api from './api';
import * as SecureStore from 'expo-secure-store';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  type: string;
  company_id: number;
  company_name?: string;
  tenant_id?: string;
}

export interface MobileModules {
  app_enabled: boolean;
  pdv: boolean;
  conferencia: boolean;
  vendas: boolean;
  pedidos: boolean;
  catalogo: boolean;
  clientes: boolean;
}

export const DEFAULT_MODULES: MobileModules = {
  app_enabled: false,
  pdv: false,
  conferencia: false,
  vendas: false,
  pedidos: false,
  catalogo: false,
  clientes: false,
};

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user?: AuthUser;
  mobile_modules?: MobileModules;
}

/**
 * Realiza login na API Cronuz.
 * O endpoint /token usa OAuth2PasswordRequestForm (form-data, não JSON).
 */
export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const formData = new URLSearchParams();
  formData.append('username', payload.username);
  formData.append('password', payload.password);

  const { data } = await api.post<AuthResponse>('/token', formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  // Persiste token, dados do usuário e módulos de forma segura
  await SecureStore.setItemAsync('access_token', data.access_token);
  if (data.user) {
    await SecureStore.setItemAsync('user_data', JSON.stringify(data.user));
  }
  if (data.mobile_modules) {
    await SecureStore.setItemAsync('mobile_modules', JSON.stringify(data.mobile_modules));
  }

  return data;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('user_data');
  await SecureStore.deleteItemAsync('mobile_modules');
}

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token');
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await SecureStore.getItemAsync('user_data');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function getStoredModules(): Promise<MobileModules | null> {
  const raw = await SecureStore.getItemAsync('mobile_modules');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileModules;
  } catch {
    return null;
  }
}

/** Health check da API — útil para debug no desenvolvimento */
export async function ping(): Promise<boolean> {
  try {
    await api.get('/');
    return true;
  } catch {
    return false;
  }
}
