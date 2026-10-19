import { useMemo, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { SiSteam } from 'react-icons/si';
import ItemImg from './ItemImg.jsx';
import Pager, { pagesOf } from './Pager.jsx';
import { Link } from '../router.jsx';
import { usd } from '../lib.js';

// Левая колонка: баланс и инвентарь САЙТА. Ставить можно только деньгами с баланса (минимум $1);
// вкладка «Инвентарь» — просмотр выигранных скинов и их продажа.
const PAGE = 24;   // плиток на странице

export default function InventoryPanel({ user, wallet, stacks, mode, setMode, selected, onSelect, amount, setAmount, onSell, disabled }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return stacks.filter(i => !s || i.name.toLowerCase().includes(s)); }, [stacks, q]);
  const pages = pagesOf(list.length, PAGE);
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * PAGE, cur * PAGE);
  const sel = stacks.find(i => i.id === selected);
  const total = stacks.reduce((a, i) => a + i.price * i.count, 0);
  const bal = wallet?.balance || 0;

  return (
    <section className="panel" aria-label="Ваш инвентарь">
      <header className="panel-head">
        <h2>Ваш инвентарь</h2>
        {user && wallet && <span className="panel-sum">{usd(total)}</span>}
      </header>

      {!user ? (
        <div className="panel-empty">
          <p>Войдите через Steam, чтобы пополнить баланс и делать апгрейды.</p>
          <a className="btn-steam" href="/auth/steam"><SiSteam />Войти через Steam</a>
        </div>
      ) : !wallet ? (
        <div className="panel-empty"><p className="muted">Загрузка…</p></div>
      ) : (<>
        <div className="tabs" role="tablist" aria-label="Что ставить">
          <button role="tab" aria-selected={mode === 'balance'} onClick={() => setMode('balance')} disabled={disabled}>Баланс · {usd(bal)}</button>
          <button role="tab" aria-selected={mode === 'item'} onClick={() => setMode('item')} disabled={disabled}>Инвентарь{stacks.length ? ` · ${stacks.reduce((a, i) => a + i.count, 0)}` : ''}</button>
        </div>

        {mode === 'balance' ? (
          <div className="stake-bal">
            <label className="amount">
              <span>$</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 9))} placeholder="Сумма ставки, от $1" aria-label="Сумма ставки" disabled={disabled} />
            </label>
            <div className="quick">
              {[0.1, 0.25, 0.5, 1].map(f => (
                <button key={f} className="btn-ghost" disabled={disabled || bal < 1} onClick={() => setAmount(String(Math.min(bal, Math.max(1, Math.floor(bal * f * 100) / 100))))}>{f === 1 ? 'Всё' : `${f * 100}%`}</button>
              ))}
            </div>
            <p className="panel-note">Ставить можно только деньгами с баланса, минимальная ставка — $1. Выигранные скины попадают в инвентарь: продайте их, и деньги вернутся на баланс.</p>
            {bal < 1 && <p className="panel-note">На балансе меньше $1. Продайте предмет из инвентаря или <Link to="/deposit">пополните</Link>.</p>}
          </div>
        ) : !stacks.length ? (
          <div className="panel-empty">
            <p>В инвентаре сайта пока пусто. Выигранные скины появятся здесь.</p>
            <Link className="btn btn-inline" to="/deposit">Пополнить</Link>
          </div>
        ) : (<>
          <label className="search search-sm">
            <LuSearch aria-hidden="true" />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={`Поиск среди ${stacks.length}`} aria-label="Поиск по инвентарю" />
          </label>
          <ul className="tiles">
            {slice.map(it => (
              <li key={it.id}>
                <button className="tile" aria-pressed={it.id === selected} disabled={disabled} style={{ '--rc': it.color }}
                  onClick={() => onSelect(it.id === selected ? null : it.id)} title={it.name}>
                  <ItemImg item={it} />
                  <span className="tile-name">{it.name}</span>
                  <span className="tile-price">{usd(it.price)}</span>
                  {it.count > 1 && <span className="tile-count">×{it.count}</span>}
                </button>
              </li>
            ))}
            {!list.length && <li className="muted panel-note">Ничего не найдено</li>}
          </ul>
          <Pager page={cur} pages={pages} onChange={setPage} />
          {sel && <button className="btn-ghost sell" onClick={() => onSell(sel)} disabled={disabled}>Продать за {usd(sel.price)}</button>}
        </>)}
      </>)}
    </section>
  );
}
