import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, useRouter } from './router.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import { WalletProvider } from './wallet.jsx';
import Header from './components/Header.jsx';
import WheelPage from './pages/WheelPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PlayersPage from './pages/PlayersPage.jsx';
import DepositPage from './pages/DepositPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import Ticker from './components/Ticker.jsx';
import { BRAND } from './config.js';
import Footer from './components/Footer.jsx';
import './styles.css';

const ERRORS = {
  steam: 'Не удалось войти через Steam. Попробуйте ещё раз.',
  rate: 'Слишком много попыток. Попробуйте чуть позже.',
  setup: 'Вход через Steam не настроен на сервере: выполните npm install и перезапустите его.'
};
const PROFILE_RE = /^\/u\/(\d{1,17})\/?$/;

function App() {
  const { user } = useAuth();
  const { path, navigate } = useRouter();
  const [authError, setAuthError] = useState(() => new URLSearchParams(location.search).get('error'));

  // ?error=… приходит после неудачного входа через Steam: показываем и убираем из адреса
  useEffect(() => { if (authError) history.replaceState(null, '', location.pathname); }, [authError]);

  const publicId = (PROFILE_RE.exec(path) || [])[1];
  const isOwn = path === '/profile';
  const isPlayers = path === '/players';
  const isDeposit = path === '/deposit';
  const isPrivacy = path === '/privacy';
  const known = path === '/' || isOwn || isPlayers || isDeposit || isPrivacy || publicId;

  useEffect(() => {
    if (user === undefined) return;
    if (!known || ((isOwn || isDeposit) && !user)) navigate('/', { replace: true });   // старые /login, /register и неизвестные адреса → на главную
  }, [user, known, isOwn, isDeposit, navigate]);

  useEffect(() => { if (path === '/') document.title = `Апгрейд — ${BRAND}`; else if (isOwn && user) document.title = `${user.username} — ${BRAND}`; }, [path, isOwn, user]);

  if (user === undefined) return null;

  let page = null;
  if (path === '/') page = <WheelPage />;
  else if (isOwn && user) page = <ProfilePage pid={String(user.pid)} />;
  else if (isPlayers) page = <PlayersPage />;
  else if (isPrivacy) page = <PrivacyPage />;
  else if (isDeposit && user) page = <DepositPage />;
  else if (publicId) page = <ProfilePage pid={publicId} />;

  return (<>
    <div className="content">
    <Ticker />
    <Header />
    {authError && !user && (
      <div className="alert" role="alert">
        <span>{ERRORS[authError] || ERRORS.steam}</span>
        <button className="link-btn" onClick={() => setAuthError(null)} aria-label="Закрыть">✕</button>
      </div>
    )}
    {page}
    </div>
    <Footer />
  </>);
}

createRoot(document.getElementById('root')).render(
  <RouterProvider><AuthProvider><WalletProvider><App /></WalletProvider></AuthProvider></RouterProvider>
);
