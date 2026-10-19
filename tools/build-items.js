// Собирает catalog/items.json из catalog/source.csv  (формат строки: "Игра","Название предмета",цена)
// Запуск: npm run items [путь/к/файлу.csv]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = process.argv[2] || path.join(__dirname, '..', 'catalog', 'source.csv');
const out = path.join(__dirname, '..', 'catalog', 'items.json');
const outRemoved = path.join(__dirname, '..', 'catalog', 'removed.json');   // id -> цена предметов дешевле MIN_PRICE (нужна, чтобы вернуть их из инвентарей)
const MIN_PRICE = require('../rollcore.config').minPrice;   // предметы дешевле в каталог не попадают

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(Boolean)) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(Boolean)) rows.push(row);
  return rows;
}

const seen = new Set(), items = [], removed = {};
let skipped = 0;
for (const r of parseCsv(fs.readFileSync(src, 'utf8').replace(/^﻿/, ''))) {
  const name = (r[1] || '').trim(), price = Number(String(r[2] || '').replace(',', '.'));
  if (!name || !(price > 0) || seen.has(name)) { skipped++; continue; }
  seen.add(name);
  const id = crypto.createHash('sha1').update(name).digest('hex').slice(0, 10);
  if (price < MIN_PRICE) { removed[id] = +price.toFixed(2); continue; }
  // id стабилен: зависит только от названия, а не от порядка в файле
  items.push({ id: crypto.createHash('sha1').update(name).digest('hex').slice(0, 10), name, price: +price.toFixed(2) });
}
items.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('Коллизия id');
fs.writeFileSync(out, JSON.stringify(items));
fs.writeFileSync(outRemoved, JSON.stringify(removed));
console.log(`catalog/items.json: ${items.length} предметов (пропущено строк: ${skipped}, дешевле ${MIN_PRICE}: ${Object.keys(removed).length})`);
