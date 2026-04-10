import Cookies from 'js-cookie';

const TOKEN_KEY = 'cronuz_b2b_token';
const USER_KEY = 'cronuz_b2b_user';

const getHostKey = (key: string) => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.split(':')[0];
    return `${key}_${host}`;
  }
  return key;
};

export const setToken = (token: string, user: any) => {
  const hostTokenKey = getHostKey(TOKEN_KEY);
  const hostUserKey = getHostKey(USER_KEY);

  // Remove potential global / legacy cookies
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
  Cookies.remove(TOKEN_KEY, { domain: '.horusb2b.com.br' });
  Cookies.remove(USER_KEY, { domain: '.horusb2b.com.br' });
  Cookies.remove(TOKEN_KEY, { domain: '.cronuzb2b.com.br' });
  Cookies.remove(USER_KEY, { domain: '.cronuzb2b.com.br' });

  Cookies.set(hostTokenKey, token, { expires: 7 }); 
  Cookies.set(hostUserKey, JSON.stringify(user), { expires: 7 });
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};

export const getToken = () => {
  const hostTokenKey = getHostKey(TOKEN_KEY);
  const cookieToken = Cookies.get(hostTokenKey) || Cookies.get(TOKEN_KEY);
  if (cookieToken) return cookieToken;
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return undefined;
};

export const getUser = () => {
  const hostUserKey = getHostKey(USER_KEY);
  const userStr = Cookies.get(hostUserKey) || Cookies.get(USER_KEY);
  if (userStr) return JSON.parse(userStr);
  if (typeof window !== 'undefined') {
    const localUser = localStorage.getItem(USER_KEY);
    return localUser ? JSON.parse(localUser) : null;
  }
  return null;
};

export const removeToken = () => {
  const hostTokenKey = getHostKey(TOKEN_KEY);
  const hostUserKey = getHostKey(USER_KEY);

  Cookies.remove(hostTokenKey);
  Cookies.remove(hostUserKey);
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
  Cookies.remove(TOKEN_KEY, { domain: '.horusb2b.com.br' });
  Cookies.remove(USER_KEY, { domain: '.horusb2b.com.br' });
  Cookies.remove(TOKEN_KEY, { domain: '.cronuzb2b.com.br' });
  Cookies.remove(USER_KEY, { domain: '.cronuzb2b.com.br' });

  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};
