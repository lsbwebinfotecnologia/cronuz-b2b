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

  // Remove potential global / legacy cookies with absolute certainty
  const domainsToClear = [
     undefined,
     '.horusb2b.com.br',
     'horusb2b.com.br',
     '.cronuzb2b.com.br',
     'cronuzb2b.com.br',
     window.location.hostname
  ];

  domainsToClear.forEach(d => {
    Cookies.remove(TOKEN_KEY, { domain: d, path: '/' });
    Cookies.remove(USER_KEY, { domain: d, path: '/' });
    Cookies.remove(TOKEN_KEY, { domain: d });
    Cookies.remove(USER_KEY, { domain: d });
  });

  Cookies.set(hostTokenKey, token, { expires: 7, path: '/' }); 
  Cookies.set(hostUserKey, JSON.stringify(user), { expires: 7, path: '/' });
  
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

  const domainsToClear = [
     undefined,
     '.horusb2b.com.br',
     'horusb2b.com.br',
     '.cronuzb2b.com.br',
     'cronuzb2b.com.br',
     window.location.hostname
  ];

  Cookies.remove(hostTokenKey, { path: '/' });
  Cookies.remove(hostUserKey, { path: '/' });

  domainsToClear.forEach(d => {
    Cookies.remove(TOKEN_KEY, { domain: d, path: '/' });
    Cookies.remove(USER_KEY, { domain: d, path: '/' });
    Cookies.remove(TOKEN_KEY, { domain: d });
    Cookies.remove(USER_KEY, { domain: d });
  });

  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};
