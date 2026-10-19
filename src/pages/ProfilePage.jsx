import { useEffect, useState } from 'react';
import { LuRefreshCw, LuLink, LuCheck, LuExternalLink } from 'react-icons/lu';
import { SiSteam } from 'react-icons/si';
import Avatar from '../components/Avatar.jsx';
import Pager, { pagesOf } from '../components/Pager.jsx';
import ItemImg from '../components/ItemImg.jsx';
import { BRAND } from '../config.js';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Link } from '../router.jsx';
import { pct, usd, decorate } from '../lib.js';

const fmtDate = t => (t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} дн назад`;
  return fmtDate(t);
}

const ITEMS_PAGE = 8;     // строк «По предметам» на странице
const HISTORY_PAGE = 10;  // строк истории на странице

export default function ProfilePage({ pid }) {
  const { user, patch } = useAuth();
  const own = !!user && String(user.pid) === String(pid);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');
  const [itemsPage, setItemsPage] = useState(1);
  const [histPage, setHistPage] = useState(1);

  useEffect(() => {
    let live = true;
    setProfile(null); setError(''); setNotFound(false); setNote(''); setItemsPage(1); setHistPage(1);
    api('/users/' + pid).then(d => live && setProfile(d))
      .catch(e => { if (!live) return; if (e.status === 404) setNotFound(true); else setError(e.message); });
    api('/items').then(d => live && setItems(d.map(decorate))).catch(() => {});
    return () => { live = false; };
  }, [pid]);

  useEffect(() => { if (profile) document.title = `${profile.username} — ${BRAND}`; }, [profile]);

  async function refresh() {
    setBusy(true); setError(''); setNote('');
    try {
      const d = await api('/profile/refresh', {});
      setProfile(d); patch({ username: d.username, avatar: d.avatar, avatarFull: d.avatarFull, profileUrl: d.profileUrl });
      setNote('Данные обновлены из Steam');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }
  async function copy() {
    const url = `${location.origin}/u/${profile.pid}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt('Ссылка на профиль:', url); return; }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  if (notFound) return (
    <main className="page"><div className="card empty">
      <h1>Игрок не найден</h1>
      <p>Такой профиль ещё не зарегистрирован — игрок должен хотя бы раз войти через Steam.</p>
      <Link className="btn btn-inline" to="/">К апгрейду</Link>
    </div></main>
  );
  if (!profile) return <main className="page">{error ? <p className="form-error">{error}</p> : null}</main>;

  const { stats, history } = profile;
  const rate = stats.spins ? Math.round((stats.wins / stats.spins) * 100) : 0;
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const played = Object.entries(stats.byItem).filter(([id]) => byId[id]).sort((a, b) => b[1].wins - a[1].wins || b[1].spins - a[1].spins);
  const itemsPages = pagesOf(played.length, ITEMS_PAGE), itemsCur = Math.min(itemsPage, itemsPages);
  const histPages = pagesOf(history.length, HISTORY_PAGE), histCur = Math.min(histPage, histPages);

  return (
    <main className="page">
      <section className="card hero">
        <Avatar src={profile.avatarFull || profile.avatar} name={profile.username} size="lg" />
        <div className="hero-info">
          <h1>{profile.username}{own && <span className="badge">это вы</span>}</h1>
          <p className="muted"><span className="pid" title="Уникальный ID профиля">ID {profile.pid}</span> · Играет с {fmtDate(profile.createdAt)}</p>
          <div className="hero-actions">
            <a className="btn-steam" href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
              <SiSteam />Профиль Steam<LuExternalLink className="ext" />
            </a>
            <button className="btn-ghost" onClick={copy}>{copied ? <LuCheck /> : <LuLink />}{copied ? 'Скопировано' : 'Ссылка на профиль'}</button>
            {own && <button className="btn-ghost" onClick={refresh} disabled={busy}><LuRefreshCw className={busy ? 'spin' : ''} />Обновить из Steam</button>}
          </div>
          {note && <p className="ok" role="status">{note}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>

      <section className="stats">
        <div className="card stat"><b>{stats.spins}</b><span>Спинов</span></div>
        <div className="card stat"><b>{stats.wins}</b><span>Выпало</span></div>
        <div className="card stat"><b>{rate}%</b><span>Успешных</span></div>
      </section>

      <section className="card">
        <h2>По предметам</h2>
        {played.length ? (<>
          <ul className="rows">
            {played.slice((itemsCur - 1) * ITEMS_PAGE, itemsCur * ITEMS_PAGE).map(([id, b]) => {
              const it = byId[id];
              return (
                <li key={id}>
                  <ItemImg item={it} />
                  <span className="grow">{it.name}<small>{usd(it.price)}</small></span>
                  <span className="muted num">{b.wins} / {b.spins}</span>
                </li>
              );
            })}
          </ul>
          <Pager page={itemsCur} pages={itemsPages} onChange={setItemsPage} />
        </>) : <p className="muted">Пока ни одного спина.</p>}
      </section>

      <section className="card">
        <h2>Последние спины</h2>
        {history.length ? (<>
          <ul className="rows">
            {history.slice((histCur - 1) * HISTORY_PAGE, histCur * HISTORY_PAGE).map((h, i) => {
              const it = byId[h.id];
              return (
                <li key={h.t + '-' + i}>
                  <span className={'dot ' + (h.win ? 'win' : 'lose')} style={h.win && it ? { background: it.color } : undefined} />
                  <span className="grow">{it ? it.name : h.id}{h.give && <small>за {h.give}{h.chance != null ? ` · ${pct(h.chance)}` : ''}</small>}</span>
                  <span className={h.win ? 'res-win' : 'muted'}>{h.win ? 'Выпало' : 'Мимо'}</span>
                  <span className="muted when">{ago(h.t)}</span>
                </li>
              );
            })}
          </ul>
          <Pager page={histCur} pages={histPages} onChange={setHistPage} />
        </>) : <p className="muted">Пока ни одного спина.</p>}
      </section>
    </main>
  );
}
