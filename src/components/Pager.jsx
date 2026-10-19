import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

// Номера страниц с многоточиями: 1 … 4 5 [6] 7 8 … 20
function windowOf(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const nums = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…' + n); out.push(n); });
  return out;
}

// Постраничная навигация. page — с единицы. Если страниц меньше двух, ничего не рисуем.
export default function Pager({ page, pages, onChange, className = '' }) {
  if (pages <= 1) return null;
  const go = n => { if (n >= 1 && n <= pages && n !== page) onChange(n); };
  return (
    <nav className={('pager ' + className).trim()} aria-label="Страницы">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Назад"><LuChevronLeft /></button>
      {windowOf(page, pages).map(n => typeof n === 'string'
        ? <span key={n} className="pager-gap" aria-hidden="true">…</span>
        : <button type="button" key={n} onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Страница ${n}`}>{n}</button>)}
      <button type="button" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Вперёд"><LuChevronRight /></button>
    </nav>
  );
}

export const pagesOf = (total, size) => Math.max(1, Math.ceil(total / size));
