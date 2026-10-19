// Иконки предметов лежат в папке (по умолчанию data/item-icons, меняется переменной ICONS_DIR) и отдаются
// с нашего сервера. Ничего не скачивается и ни к каким внешним API сервер не обращается.
// Файл подбирается к предмету по имени (регистр, пробелы и знаки не важны), подходит любой из вариантов:
//   <id предмета>.png                     (id — из catalog/items.json, например 695e4cfcd6.png)
//   Mace of Aeons.png / mace_of_aeons.png / Mace-of-Aeons.webp   (название предмета)
// Форматы: png, jpg, jpeg, webp, gif, svg. Новые файлы подхватываются без перезапуска (проверка не чаще раза в 30 с).
//
// Фильтр каталога (filterItems, вызывается при старте сервера): предметы без иконки убираются из каталога.
// Размер файлов иконок значения не имеет: интерфейс показывает все иконки в одном размере (см. --ic-w/--ic-h в styles.css).
const fs = require('fs');
const path = require('path');

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const QUALITY = /^(?:(?:Inscribed|Autographed|Genuine|Corrupted|Unusual|Frozen|Cursed|Heroic|Auspicious|Exalted|Infused|Kinetic|Elder|Prismatic|Golden|Base|Tournament|Ultimate|Legacy|Feat|Standard):?\s+)+/i;

const norm = s => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9а-яё]+/g, '');

function createIcons({ dir, items, log = () => {} }) {
  const byId = new Map(items.map(i => [i.id, i]));
  const byName = new Map(), byBase = new Map();
  for (const i of items) {
    byName.set(norm(i.name), i);
    const b = norm(i.name.replace(QUALITY, '').trim()); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(i);
  }
  let found = new Map(), scannedAt = 0;               // id предмета -> полный путь к файлу

  function scan() {
    scannedAt = Date.now();
    const next = new Map(), exact = new Set();
    let names = [];
    try { names = fs.readdirSync(dir); } catch { found = next; return; }
    const files = names.map(f => { const m = /^(.*)\.([a-z0-9]+)$/i.exec(f); return m && MIME[m[2].toLowerCase()] ? { f, base: m[1], ext: m[2].toLowerCase() } : null; }).filter(Boolean);
    for (const { f, base } of files) {                // 1) по id или точному названию
      const it = byId.get(base) || byName.get(norm(base));
      if (it) { next.set(it.id, path.join(dir, f)); exact.add(it.id); }
    }
    for (const { f, base } of files) {                // 2) файл с названием без качества (Inscribed/Genuine…) подходит всем вариантам
      for (const it of byBase.get(norm(base)) || []) if (!next.has(it.id)) next.set(it.id, path.join(dir, f));
    }
    found = next;
    log(`[icons] папка ${dir}: файлов ${files.length}, предметов с иконкой ${found.size} из ${items.length}`);
  }
  scan();

  // Фильтр каталога: оставляет только предметы, у которых есть иконка (размер иконки не важен —
  // в интерфейсе все иконки масштабируются под один размер).
  // Возвращает { keep, dropped: [{ item, reason }], skipped: 'причина' | undefined }.
  // skipped заполнено, если иконок нет вообще — тогда каталог остаётся как есть.
  function filterItems(list) {
    const keep = [], dropped = [];
    for (const it of list) (found.has(it.id) ? keep : dropped).push(found.has(it.id) ? it : { item: it, reason: 'нет иконки' });
    if (!keep.length) return { keep: list, dropped: [], skipped: 'в папке ' + dir + ' нет ни одной подходящей иконки' };
    return { keep, dropped };
  }

  return {
    filterItems,
    file(id) {
      let f = found.get(id);
      if (!f && Date.now() - scannedAt > 30000) { scan(); f = found.get(id); }
      return f || null;
    },
    mime: f => MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream',
    count: () => found.size
  };
}

module.exports = { createIcons };
