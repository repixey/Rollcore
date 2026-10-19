import { useEffect, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import Avatar from '../components/Avatar.jsx';
import Pager, { pagesOf } from '../components/Pager.jsx';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { BRAND } from '../config.js';

const PAGE = 15;   // игроков на странице

export default function PlayersPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api('/users?q=' + encodeURIComponent(q.trim())).then(d => { if (live) { setList(d); setError(''); setPage(1); } })
        .catch(e => live && setError(e.message));
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => { document.title = `Игроки — ${BRAND}`; }, []);

  const pages = list ? pagesOf(list.length, PAGE) : 1;
  const cur = Math.min(page, pages);
  const start = (cur - 1) * PAGE;

  return (
    <main className="page">
      <section className="card">
        <h1 className="page-title">Игроки</h1>
        <p className="muted">Публичные профили всех, кто входил через Steam. Рейтинг — по числу выпадений, справа «выпало / спинов».</p>
        <label className="search">
          <LuSearch />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по нику или ID (например, 12)" maxLength={40} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {list && (list.length ? (<>
          <ol className="players">
            {list.slice(start, start + PAGE).map((p, i) => (
              <li key={p.pid}>
                <Link to={`/u/${p.pid}`} className="player">
                  <span className="rank">{q ? '' : start + i + 1}</span>
                  <Avatar src={p.avatar} name={p.username} size="md" />
                  <span className="grow"><b>{p.username}</b><small>ID {p.pid}</small></span>
                  <span className="num muted">{p.wins} / {p.spins}</span>
                </Link>
              </li>
            ))}
          </ol>
          <Pager page={cur} pages={pages} onChange={setPage} />
        </>) : <p className="muted empty-note">Никого не найдено.</p>)}
      </section>
    </main>
  );
}
