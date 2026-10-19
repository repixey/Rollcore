import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const Ctx = createContext(null);
const ACTIVE = ['pending', 'sent', 'escrow'];

// Баланс, инвентарь сайта, trade-ссылка и заявки на пополнение текущего игрока
export function WalletProvider({ children }) {
  const { user, expire } = useAuth();
  const [wallet, setWallet] = useState(null);

  const reload = useCallback(async () => {
    try { const d = await api('/wallet'); setWallet(d); return d; }
    catch (e) { if (e.status === 401) expire(); return null; }
  }, [expire]);

  useEffect(() => { if (user) reload(); else setWallet(null); }, [user?.pid]);   // eslint-disable-line react-hooks/exhaustive-deps

  // пока есть незавершённое пополнение — спрашиваем статус каждые 4 секунды
  const active = !!wallet?.deposits?.some(d => ACTIVE.includes(d.status));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { if (!document.hidden) reload(); }, 4000);
    return () => clearInterval(id);
  }, [active, reload]);

  // POST-действие, ответом приходит свежий кошелёк
  const act = useCallback(async (path, body) => { const d = await api(path, body); setWallet(d); return d; }, []);

  return <Ctx.Provider value={{ wallet, reload, act }}>{children}</Ctx.Provider>;
}
export const useWallet = () => useContext(Ctx);
