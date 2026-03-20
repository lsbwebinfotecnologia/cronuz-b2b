import Cookies from 'js-cookie';

const TOKEN_KEY = 'cronuz_b2b_token';
const USER_KEY = 'cronuz_b2b_user';

export const setToken = (token: string, user: any) => {
  Cookies.set(TOKEN_KEY, token, { expires: 7 }); // 7 days
  Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7 });
  // Also set in localStorage for backwards compatibility
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};

export const getToken = () => {
  const cookieToken = Cookies.get(TOKEN_KEY);
  if (cookieToken) return cookieToken;
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return undefined;
};

export const getUser = () => {
  const userStr = Cookies.get(USER_KEY);
  if (userStr) return JSON.parse(userStr);
  if (typeof window !== 'undefined') {
    const localUser = localStorage.getItem(USER_KEY);
    return localUser ? JSON.parse(localUser) : null;
  }
  return null;
};

export const removeToken = () => {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};
