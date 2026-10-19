export const C = 200, RR = 150;
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const norm = d => ((d % 360) + 360) % 360;
export const pt = (deg, r) => [C + r * Math.sin(deg * Math.PI / 180), C - r * Math.cos(deg * Math.PI / 180)];
export const arc = (a0, a1) => {
  const [x0, y0] = pt(a0, RR), [x1, y1] = pt(a1, RR);
  return `M${x0} ${y0} A${RR} ${RR} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
// 47.5% · 9.5% · 0.35% · 0.01%: у малых шансов нужны сотые доли, иначе 0.01% превратится в «0%»
export const pct = n => (n == null ? '—' : +n.toFixed(n < 1 ? 2 : n < 10 ? 2 : 1)) + '%';
export const usd = n => (n == null ? '—' : '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(2)));
export { chanceFor, oddsInfo, tierOf, TIERS, EDGE } from '../odds.js';
import { tierOf, TIERS } from '../odds.js';
// добавляет к предмету каталога цвет и картинку по «редкости», выведенной из цены
export const decorate = it => { const t = TIERS[tierOf(it.price)]; return { ...it, color: t.color, image: t.image }; };
