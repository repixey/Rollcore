import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);            // undefined — ещё проверяем сессию
  useEffect(() => { api('/me').then(d => setUser(d.user)).catch(() => setUser(null)); }, []);
  const value = {
    user,
    logout: async () => { try { await api('/logout', {}); } finally { setUser(null); } },
    expire: () => setUser(null),
    patch: data => setUser(u => (u ? { ...u, ...data } : u))   // обновить ник/аватарку в шапке без перезагрузки
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
