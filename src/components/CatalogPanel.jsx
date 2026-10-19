import { useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import ItemImg from './ItemImg.jsx';
import Select from './Select.jsx';
import Pager, { pagesOf } from './Pager.jsx';
import { pct, usd, chanceFor } from '../lib.js';

const PAGE = 40;   // предметов на странице

// Правая колонка: все предметы каталога. Если слева выбран предмет, у каждой строки виден шанс получить её.
export default function CatalogPanel({ items, selected, givePrice, onSelect, disabled }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const listRef = useRef(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? items.filter(i => i.name.toLowerCase().includes(s)) : items;
    return sort === 'desc' ? f : [...f].reverse();             // каталог уже отсортирован по цене по убыванию
  }, [items, q, sort]);

  const pages = pagesOf(list.length, PAGE);
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * PAGE, cur * PAGE);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [cur, q, sort]);

  return (
    <section className="panel" aria-label="Все предметы">
      <header className="panel-head">
        <h2>Все предметы</h2>
        <Select label="Сортировка" value={sort} onChange={v => { setSort(v); setPage(1); }}
          options={[{ value: 'desc', label: 'Сначала дорогие' }, { value: 'asc', label: 'Сначала дешёвые' }]} />
      </header>
      <label className="search search-sm">
        <LuSearch aria-hidden="true" />
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={`Поиск среди ${items.length}`} aria-label="Поиск по предметам" />
      </label>
      <p className="panel-note">{givePrice ? 'Справа от каждого предмета — шанс получить его за выбранный слева. Предметы дешевле ставки недоступны.' : 'Выберите предмет в инвентаре — здесь появятся шансы.'}</p>
      <ul className="rows-list" ref={listRef}>
        {slice.map(it => {
          const cheap = !!givePrice && Math.round(it.price * 100) < Math.round(givePrice * 100);   // дешевле ставки — выбрать нельзя
          const ch = givePrice && !cheap ? chanceFor(givePrice, it.price) : null;
          return (
            <li key={it.id}>
              <button className="row" aria-pressed={it.id === selected} disabled={disabled || cheap} title={cheap ? 'Ставка дороже этого предмета' : undefined} onClick={() => onSelect(it.id)} style={{ '--rc': it.color }}>
                <ItemImg item={it} />
                <span className="row-main"><b>{it.name}</b><small>{usd(it.price)}</small></span>
                {ch != null && <span className={'row-chance' + (ch >= 50 ? ' hi' : ch < 5 ? ' lo' : '')}>{pct(ch)}</span>}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="muted panel-note">Ничего не найдено</li>}
      </ul>
      <Pager page={cur} pages={pages} onChange={setPage} />
    </section>
  );
}
