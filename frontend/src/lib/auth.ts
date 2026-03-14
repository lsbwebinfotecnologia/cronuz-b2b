import Cookies from 'js-cookie';

const TOKEN_KEY = 'cronuz_b2b_token';
const USER_KEY = 'cronuz_b2b_user';

export const setToken = (token: string, user: any) => {
  Cookies.set(TOKEN_KEY, token, { expires: 7 }); // 7 days
  Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7 });
};

export const getToken = () => {
  return Cookies.get(TOKEN_KEY);
};

export const getUser = () => {
  const userStr = Cookies.get(USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
};

export const removeToken = () => {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
};
