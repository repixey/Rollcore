import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import Avatar from './Avatar.jsx';
import ItemImg from './ItemImg.jsx';
import { pct, reduce } from '../lib.js';

// Бегущая строка: последние выпадения всех игроков. Данные запрашиваются раз в 8 секунд,
// но в саму дорожку попадают в конце круга — иначе новая запись дёргала бы ленту посреди движения.
export default function Ticker() {
  const [feed, setFeed] = useState(null);
  const pending = useRef(null);
  const shown = useRef(null);
  shown.current = feed;

  useEffect(() => {
    let live = true;
    const load = () => api('/feed').then(d => {
      if (!live) return;
      // первая загрузка, пустая лента или «без анимации» — показываем сразу, иначе ждём конец круга
      if (!shown.current || !shown.current.length || reduce) setFeed(d); else pending.current = d;
    }).catch(() => {});
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => { live = false; clearInterval(id); };
  }, []);

  if (feed === null) return <div className="ticker" aria-hidden="true" />;
  if (!feed.length) return <div className="ticker"><span className="ticker-empty">Выпадений пока нет — станьте первым</span></div>;

  const row = feed.map(f => (
    <Link key={f.t + '-' + f.pid} to={`/u/${f.pid}`} className="tick" style={{ '--c': f.item.color }}>
      <Avatar src={f.avatar} name={f.username} size="xs" />
      <b className="tick-name">{f.username}</b>
      <span className="tick-text">выбил</span>
      <ItemImg item={f.item} />
      <span className="tick-item">{f.item.name}</span>
      <small>{pct(f.item.chance)}</small>
    </Link>
  ));
  // дорожка дублируется для бесшовной прокрутки; скорость не зависит от количества записей
  return (
    <div className="ticker" role="marquee" aria-label="Последние выпадения игроков">
      <div className="ticker-track" style={{ animationDuration: `${Math.max(20, feed.length * 5)}s` }}
        onAnimationIteration={() => { if (pending.current) { setFeed(pending.current); pending.current = null; } }}>
        <div className="ticker-row">{row}</div>
        <div className="ticker-row" aria-hidden="true">{row}</div>
      </div>
    </div>
  );
}
