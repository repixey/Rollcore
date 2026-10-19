import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function RouterProvider({ children }) {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === location.pathname) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to);
    if (!replace) scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

export function Link({ to, children, ...rest }) {
  const { navigate } = useRouter();
  const go = e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); navigate(to); };
  return <a href={to} onClick={go} {...rest}>{children}</a>;
}
