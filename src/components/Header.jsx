import { LuLogOut, LuPlus } from 'react-icons/lu';
import { SiSteam } from 'react-icons/si';
import { useAuth } from '../auth.jsx';
import { useWallet } from '../wallet.jsx';
import { Link } from '../router.jsx';
import { usd } from '../lib.js';
import Avatar from './Avatar.jsx';
import { BRAND } from '../config.js';

export default function Header() {
  const { user, logout } = useAuth();
  const { wallet } = useWallet();
  return (
    <header className="bar">
      <div className="bar-left">
        <Link className="brand" to="/"><img className="brand-logo" src="/img/logo.svg" alt="" />{BRAND.toUpperCase()}</Link>
        <nav className="nav"><Link to="/">Апгрейд</Link><Link to="/players">Игроки</Link></nav>
      </div>
      <div className="bar-user">
        {user ? (<>
          <Link className="bal" to="/deposit" title="Пополнить">
            <b>{wallet ? usd(wallet.balance) : '—'}</b><span className="bal-plus"><LuPlus /></span><span className="hide-sm">Пополнить</span>
          </Link>
          <Link className="me" to="/profile" title="Мой профиль">
            <Avatar src={user.avatar} name={user.username} size="sm" />
            <span className="me-name">{user.username}</span>
          </Link>
          <button className="link-btn" onClick={logout}><LuLogOut /><span className="hide-sm">Выйти</span></button>
        </>) : (
          // обычная ссылка: это переход на сервер и затем на steamcommunity.com, а не маршрут интерфейса
          <a className="btn-steam" href="/auth/steam"><SiSteam />Войти через Steam</a>
        )}
      </div>
    </header>
  );
}
