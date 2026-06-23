import { create } from 'zustand';
import {
  AuthUser,
  MobileModules,
  DEFAULT_MODULES,
  login,
  logout,
  getStoredToken,
  getStoredUser,
  getStoredModules,
} from '../services/auth.service';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  modules: MobileModules;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Helpers: verifica se um módulo está ativo
  hasModule: (module: keyof MobileModules) => boolean;

  // Actions
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  modules: DEFAULT_MODULES,
  isLoading: true,
  isAuthenticated: false,

  /**
   * Verifica se um módulo específico está habilitado para o seller.
   * Uso: const { hasModule } = useAuthStore(); hasModule('pdv')
   */
  hasModule: (module: keyof MobileModules) => {
    return get().modules[module] === true;
  },

  /**
   * Carrega sessão persistida no startup do app.
   * Chamado no _layout.tsx raiz.
   */
  hydrate: async () => {
    set({ isLoading: true });
    try {
      const token = await getStoredToken();
      const user = await getStoredUser();
      const modules = await getStoredModules();
      set({
        token,
        user,
        modules: modules ?? DEFAULT_MODULES,
        isAuthenticated: !!token,
        isLoading: false,
      });
    } catch {
      set({ token: null, user: null, modules: DEFAULT_MODULES, isAuthenticated: false, isLoading: false });
    }
  },

  /**
   * Login: chama a API e armazena JWT + módulos.
   */
  signIn: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await login({ username, password });
      set({
        token: response.access_token,
        user: response.user ?? null,
        modules: response.mobile_modules ?? DEFAULT_MODULES,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  /**
   * Logout: limpa SecureStore e estado.
   */
  signOut: async () => {
    await logout();
    set({ token: null, user: null, modules: DEFAULT_MODULES, isAuthenticated: false });
  },
}));
