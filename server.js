// Мини-сервер: апгрейд, вход через Steam (OpenID 2.0, без API-ключей), cookie-сессии, честный спин.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const cfg = require('./rollcore.config');
const { TIERS, tierOf, chanceFor } = require('./odds');
const { createIcons } = require('./icons');
const { createBot } = require('./bot');
const { openStore } = require('./db');

let openid = null;
try { openid = require('openid'); } catch { console.warn('[steam] пакет "openid" не установлен — выполните: npm install'); }

const PORT = process.env.PORT || 3000;
// Адрес, по которому сайт открывают в браузере. Steam вернёт пользователя именно сюда.
// Для продакшена: BASE_URL=https://ваш-домен
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SESSION_TTL = 30 * 24 * 3600 * 1000;
// Каталог предметов (catalog/items.json собирается из catalog/source.csv командой `npm run items`).
// Шанс у предмета не хранится: он зависит от пары «ваш предмет → желаемый» и считается в odds.js.
const MIN_PRICE = cfg.minPrice;                       // предметы дешевле в каталоге не нужны
const RAW_ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog', 'items.json'), 'utf8')).filter(it => it.price >= MIN_PRICE).map(it => {
  if (!it.id || !it.name || !(it.price > 0)) throw new Error(`Неверный предмет в catalog/items.json: ${JSON.stringify(it)}`);
  return it;
});
// id -> цена предметов, убранных из каталога (нужна, чтобы вернуть их стоимость из инвентарей)
let REMOVED = {};
try { REMOVED = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog', 'removed.json'), 'utf8')); } catch { /* файла нет */ }

// иконки: готовые файлы из папки data/item-icons (ничего не скачиваем)
const icons = createIcons({ dir: process.env.ICONS_DIR || path.join(DATA_DIR, 'item-icons'), items: RAW_ITEMS, log: console.log });

// Фильтр по иконкам: предметы без иконки в каталог не попадают (размер иконки не важен — интерфейс подгоняет всё под один размер).
// Отключить: ICONS_FILTER=0. Список убранных — data/icons-report.txt.
let CATALOG = RAW_ITEMS;
if (process.env.ICONS_FILTER !== '0') {
  const r = icons.filterItems(RAW_ITEMS);
  if (r.skipped) console.warn(`[icons] фильтр не применён: ${r.skipped}`);
  else {
    CATALOG = r.keep;
    for (const d of r.dropped) REMOVED[d.item.id] = d.item.price;
    console.log(`[icons] фильтр: в каталоге ${r.keep.length} из ${RAW_ITEMS.length}, без иконки убрано ${r.dropped.length}`);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, 'icons-report.txt'), `В каталоге: ${r.keep.length} из ${RAW_ITEMS.length}\nУбрано (нет иконки): ${r.dropped.length}\n\n` +
        r.dropped.map(d => `${d.item.name}  [${d.item.id}]`).join('\n') + '\n');
    } catch { /* папка только для чтения — отчёт не обязателен */ }
  }
}
const ITEMS = CATALOG.map(it => {
  const t = TIERS[tierOf(it.price)];
  return { id: it.id, name: it.name, price: it.price, color: t.color, image: t.image };
});
const ITEM_BY_ID = new Map(ITEMS.map(i => [i.id, i]));
const ITEM_BY_NAME = new Map(ITEMS.map(i => [i.name, i]));
// каталог отдаём одним сжатым ответом (≈2000 предметов)
const ITEMS_JSON = Buffer.from(JSON.stringify(ITEMS.map(({ id, name, price }) => ({ id, name, price }))));
const ITEMS_GZ = zlib.gzipSync(ITEMS_JSON);

/* ───────────── хранилище (SQLite, data/db.sqlite; см. db.js) ───────────── */
const store = openStore(DATA_DIR);
const db = store.db;
db.users ||= []; db.sessions ||= []; db.feed ||= []; db.deposits ||= [];
// уникальный числовой ID профиля (1, 2, 3 …): старым пользователям выдаём по порядку регистрации
db.nextPid ||= 1;
for (const u of [...db.users].filter(u => !u.pid).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) u.pid = db.nextPid++;
db.sessions = db.sessions.filter(s => s.exp > Date.now());
// записи со старыми картинками (common/rare/…) больше не существуют в каталоге — убираем их
db.feed = db.feed.filter(f => ITEM_BY_ID.has(f.id));
for (const u of db.users) {                          // предмет убрали из каталога (дешевле $1 или нет иконки) → возвращаем его стоимость на баланс
  const gone = (u.inv || []).filter(e => !ITEM_BY_ID.has(e.itemId));
  if (gone.length) { u.balance = (u.balance || 0) + gone.reduce((a, e) => a + Math.round((REMOVED[e.itemId] || 0) * 100), 0); u.inv = u.inv.filter(e => ITEM_BY_ID.has(e.itemId)); }
}
for (const u of db.users) {
  u.balance = Math.max(0, Math.round(u.balance || 0)); u.inv ||= [];      // баланс хранится в центах
  if (u.history) u.history = u.history.filter(h => ITEM_BY_ID.has(h.id));
  if (u.stats && u.stats.byItem) for (const k of Object.keys(u.stats.byItem)) if (!ITEM_BY_ID.has(k)) delete u.stats.byItem[k];
}

function saveDb() { store.save(); }
if (db.migrate) {                                    // первый запуск после перехода с db.json
  delete db.migrate; saveDb();
  try { fs.renameSync(store.legacy, store.legacy + '.migrated'); console.log('[db] db.json перенесён в SQLite (' + store.file + ')'); } catch { /* нечего переименовывать */ }
} else saveDb();

/* ───────────── сессии ───────────── */
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(p => p[0]));
const profileLink = u => u.profileUrl || `https://steamcommunity.com/profiles/${u.steamId}`;
const statsOf = u => {
  const st = u.stats || {};
  const byItem = {};                       // только те предметы, которые игрок уже крутил
  for (const [id, b] of Object.entries(st.byItem || {})) {
    if (ITEM_BY_ID.has(id) && b.spins) byItem[id] = { spins: b.spins || 0, wins: b.wins || 0 };
  }
  return { spins: st.spins || 0, wins: st.wins || 0, byItem };
};
// то, что видит владелец аккаунта (/api/me)
const pub = u => (u ? {
  id: u.id, pid: u.pid, steamId: u.steamId, username: u.username,
  avatar: u.avatar || null, avatarFull: u.avatarFull || u.avatar || null,
  profileUrl: profileLink(u), createdAt: u.createdAt || null
} : null);
// то, что видят все (/api/users/:id): без внутренней сессионной привязки
const pubProfile = u => ({
  pid: u.pid, steamId: u.steamId, username: u.username,
  avatar: u.avatar || null, avatarFull: u.avatarFull || u.avatar || null,
  profileUrl: profileLink(u), createdAt: u.createdAt || null, lastSeen: u.lastSeen || null,
  stats: statsOf(u), history: (u.history || []).slice(0, 30)
});

function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' || BASE_URL.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`);
}
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions.push({ h: sha(token), uid: userId, exp: Date.now() + SESSION_TTL });
  saveDb();
  setSessionCookie(res, token, SESSION_TTL / 1000);
}
function currentUser(req) {
  const tok = parseCookies(req).sid;
  if (!tok) return null;
  const h = sha(tok), s = db.sessions.find(x => x.h === h && x.exp > Date.now());
  return s ? db.users.find(u => u.id === s.uid) || null : null;
}
function destroySession(req, res) {
  const tok = parseCookies(req).sid;
  if (tok) { db.sessions = db.sessions.filter(x => x.h !== sha(tok)); saveDb(); }
  setSessionCookie(res, '', 0);
}

// простейший лимит: 20 попыток входа за 5 минут с одного IP
const refreshAt = new Map();
const hits = new Map();
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();
function limited(req) {
  const ip = clientIp(req), now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 5 * 60 * 1000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 20;
}
const sameOrigin = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch { return false; } };

/* ───────────── мини anti-DDoS ─────────────
 *  1) Лимит запросов с одного IP (по группам: api / иконки / страницы) — лишнее получает 429.
 *  2) Проверка браузера: при первом заходе вместо сайта открывается страница загрузки (public/check.html).
 *     Она берёт у сервера подписанный «билет», ждёт не меньше SHIELD_MIN_MS и меняет его на cookie `shield`
 *     (12 часов). Потом перекидывает на главную. Простые боты без JS и cookie дальше этой страницы не идут.
 *  Это лёгкий фильтр, а не замена Cloudflare/nginx: настоящий DDoS режется на уровне хостинга.
 *  Отключить: SHIELD=off. За прокси (nginx, Cloudflare) включите TRUST_PROXY=1 — тогда IP берётся из X-Forwarded-For.
 */
const SHIELD_ON = process.env.SHIELD !== 'off';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const SHIELD_MIN_MS = 2600;                       // сколько минимум крутится анимация
const SHIELD_TICKET_TTL = 5 * 60 * 1000;          // билет живёт 5 минут
const SHIELD_COOKIE_TTL = 12 * 3600 * 1000;       // проверка действует 12 часов
const FLOOD = { api: [240, 60e3], icon: [1500, 60e3], web: [120, 60e3] };   // [запросов, окно мс] на IP

let SHIELD_KEY;
try {
  const kf = path.join(DATA_DIR, 'shield.key');
  try { SHIELD_KEY = fs.readFileSync(kf); } catch { SHIELD_KEY = crypto.randomBytes(32); fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(kf, SHIELD_KEY, { mode: 0o600 }); }
} catch { SHIELD_KEY = crypto.randomBytes(32); }   // не смогли сохранить — после рестарта все пройдут проверку заново

function clientIp(req) {
  if (TRUST_PROXY) { const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
  return req.socket.remoteAddress || '?';
}
const hmac = t => crypto.createHmac('sha256', SHIELD_KEY).update(t).digest('base64url');
const uaTag = req => sha(String(req.headers['user-agent'] || '')).slice(0, 16);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const flood = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of flood) if (v.reset < now) flood.delete(k); if (flood.size > 50000) flood.clear(); }, 60e3).unref();
function floodKind(pathname) {
  if (pathname.startsWith('/api/icon/')) return 'icon';
  return pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname.startsWith('/__shield/') ? 'api' : 'web';
}
// true — IP превысил лимит группы запросов
function overLimit(req, pathname) {
  const kind = floodKind(pathname), [max, win] = FLOOD[kind], key = kind + ':' + clientIp(req), now = Date.now();
  let e = flood.get(key);
  if (!e || e.reset < now) { e = { n: 0, reset: now + win }; flood.set(key, e); }
  return ++e.n > max;
}
function shieldPassed(req) {
  if (!SHIELD_ON) return true;
  const [exp, sig] = String(parseCookies(req).shield || '').split('.');
  return !!sig && +exp > Date.now() && safeEq(sig, hmac(`pass|${exp}|${uaTag(req)}`));
}
function shieldTicket(req) {
  const ts = Date.now(), rnd = crypto.randomBytes(9).toString('base64url');
  return `${ts}.${rnd}.${hmac(`ticket|${ts}|${rnd}|${uaTag(req)}`)}`;
}
// обмен билета на cookie: сообщение об ошибке или null
function shieldRedeem(req, res, ticket) {
  const [ts, rnd, sig] = String(ticket || '').split('.');
  if (!sig || !safeEq(sig, hmac(`ticket|${ts}|${rnd}|${uaTag(req)}`))) return 'Билет недействителен, обновите страницу';
  const age = Date.now() - +ts;
  if (age > SHIELD_TICKET_TTL) return 'Билет устарел, обновите страницу';
  if (age < SHIELD_MIN_MS - 300) return 'Слишком быстро';
  const exp = Date.now() + SHIELD_COOKIE_TTL, secure = process.env.COOKIE_SECURE === '1' || BASE_URL.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `shield=${exp}.${hmac(`pass|${exp}|${uaTag(req)}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SHIELD_COOKIE_TTL / 1000}${secure}`);
  return null;
}

/* ───────────── Steam OpenID 2.0 (без API-ключей) ───────────── */
const STEAM_PROVIDER = 'https://steamcommunity.com/openid';
const STEAM_OP_ENDPOINT = 'https://steamcommunity.com/openid/login';
const CLAIMED_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

// stateless-режим: подпись ответа проверяет сам Steam (check_authentication)
const relyingParty = openid ? new openid.RelyingParty(`${BASE_URL}/auth/steam/return`, BASE_URL, true, false, []) : null;

// Данные профиля (ник, аватар, ссылка) берём из публичной XML-страницы профиля — API-ключ не нужен.
// Если профиль закрыт или Steam недоступен, вернётся null: останутся прежние данные (или «Steam 1234»).
const unxml = v => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function xmlTag(xml, tag) {
  const m = new RegExp(`<${tag}>(?:<!\\[CDATA\\[(.*?)\\]\\]>|([^<]*))</${tag}>`, 's').exec(xml);
  if (!m) return null;
  return m[1] ?? unxml(m[2] || '');
}
function parsePersona(xml) {
  const name = (xmlTag(xml, 'steamID') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
  return name || null;
}
// аватарки принимаем только с CDN Steam (по https), чтобы в профиль нельзя было подсунуть чужой адрес
const AVATAR_RE = /^https:\/\/(?:[a-z0-9-]+\.)*(?:steamstatic\.com|akamaihd\.net)\/[\w\-./]+$/i;
const safeAvatar = v => (v && AVATAR_RE.test(v.trim()) ? v.trim() : null);
function parseProfile(xml) {
  const name = parsePersona(xml);
  if (!name) return null;
  const custom = (xmlTag(xml, 'customURL') || '').trim();
  return {
    username: name,
    avatar: safeAvatar(xmlTag(xml, 'avatarMedium') || xmlTag(xml, 'avatarIcon')),
    avatarFull: safeAvatar(xmlTag(xml, 'avatarFull')),
    customUrl: /^[\w\-]{2,64}$/.test(custom) ? custom : null
  };
}
async function fetchProfile(steamId) {
  try {
    const r = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? parseProfile(await r.text()) : null;
  } catch { return null; }
}
// Записывает свежие данные Steam в пользователя; возвращает true, если что-то изменилось.
function applyProfile(user, p) {
  if (!p) return false;
  const next = {
    username: p.username,
    avatar: p.avatar || user.avatar || null,
    avatarFull: p.avatarFull || p.avatar || user.avatarFull || null,
    profileUrl: p.customUrl ? `https://steamcommunity.com/id/${p.customUrl}` : `https://steamcommunity.com/profiles/${user.steamId}`
  };
  let changed = false;
  for (const k in next) if (user[k] !== next[k]) { user[k] = next[k]; changed = true; }
  return changed;
}

// запись результата спина в статистику и историю профиля
function recordSpin(user, item, plan, at = Date.now(), give = null) {
  const st = (user.stats ||= { spins: 0, wins: 0, byItem: {} });
  const b = (st.byItem[item.id] ||= { spins: 0, wins: 0 });
  st.spins++; b.spins++;
  if (plan.win) { st.wins++; b.wins++; }
  (user.history ||= []).unshift({ t: at, id: item.id, win: plan.win, chance: plan.chance, give: give ? give.name : undefined });
  user.history.length = Math.min(user.history.length, 30);
  user.lastSeen = at;
  // лента выпадений для бегущей строки: появляется, когда у игрока докрутится апгрейд
  if (plan.win) {
    db.feed.push({ t: at + plan.duration, pid: user.pid, id: item.id, chance: plan.chance });
    if (db.feed.length > 100) db.feed.splice(0, db.feed.length - 100);
  }
  saveDb();
}
const findUser = key => (/^\d{17}$/.test(key) ? db.users.find(x => x.steamId === key) : db.users.find(x => x.pid === +key));
const byPid = new Map();
function feedList(limit = 25) {
  byPid.clear(); for (const u of db.users) byPid.set(u.pid, u);
  const now = Date.now(), out = [];
  for (let i = db.feed.length - 1; i >= 0 && out.length < limit; i--) {
    const f = db.feed[i], u = byPid.get(f.pid), it = ITEM_BY_ID.get(f.id);
    if (f.t > now || !u || !it) continue;
    out.push({ t: f.t, pid: u.pid, username: u.username, avatar: u.avatar || null,
      item: { id: it.id, name: it.name, price: it.price, color: it.color, image: it.image, chance: f.chance ?? null } });
  }
  return out.sort((a, b) => b.t - a.t);
}
// список игроков: лидерборд по выпавшим, поиск по нику или числовому ID
function playersList(q, limit = 500) {
  q = String(q || '').trim().toLowerCase().replace(/^#/, '');
  let list = db.users;
  if (q) list = list.filter(u => String(u.pid) === q || u.username.toLowerCase().includes(q));
  return list.map(u => { const st = statsOf(u); return { pid: u.pid, username: u.username, avatar: u.avatar || null, spins: st.spins, wins: st.wins, createdAt: u.createdAt || null }; })
    .sort((a, b) => b.wins - a.wins || b.spins - a.spins || a.pid - b.pid).slice(0, limit);
}

/* ------------------------------------------------------------------ *
 *  Исход (выпало / мимо) определяется один раз по шансу картинки.
 *  Скорость и длительность вращения всегда стандартные, меняется только
 *  точка остановки. В части промахов (NEAR_MISS_SHARE) апгрейд не просто
 *  встаёт в случайное место «серой» зоны, а недокручивает до цветного
 *  поля на несколько градусов. Всё остальное: обычная остановка.
 * ------------------------------------------------------------------ */
const NEAR_MISS_SHARE = 0.25;    // доля промахов с «недокрутом»
const NEAR_MISS_DIST = [6, 14];  // на сколько градусов от края цветной дуги останавливаемся
const SPINS = 3;                 // полных оборотов до остановки
const DURATION = 7000;           // мс
const GAP = 0;

const rnd = () => crypto.randomInt(1_000_000) / 1_000_000;
const between = (a, b) => a + rnd() * (b - a);

// position — угол стрелки относительно центра цветной дуги (0 = середина дуги,
// 180 = напротив). Стрелка вращается по часовой, поэтому ОТРИЦАТЕЛЬНЫЙ position
// чуть дальше края дуги = стрелка «не дошла» до поля.
function makePlan(item) {                  // item.chance — шанс пары «ставка → цель» в процентах
  const p = item.chance, h = p * 1.8;
  const win = crypto.randomInt(10000) < Math.round(p * 100);      // точность 0.01%

  const center = win ? 0 : 180;
  const half = win ? h - GAP : 180 - h - GAP;
  let pattern = 'clean';
  let position = center + between(-1, 1) * half * 0.7;

  if (!win && p > 0 && p < 100 && rnd() < NEAR_MISS_SHARE) {
    const maxD = Math.min(NEAR_MISS_DIST[1], 2 * GAP + 2 * half * 0.6);
    if (maxD > NEAR_MISS_DIST[0]) {
      position = -((h - GAP) + between(NEAR_MISS_DIST[0], maxD));
      pattern = 'near-miss';
    }
  }
  return { win, pattern, chance: p, position: +position.toFixed(3), spins: SPINS, duration: DURATION };
}


/* ───────────── кошелёк: баланс, инвентарь сайта, пополнение ─────────────
 *  Баланс (в центах) и предметы хранятся на сайте. Предметы попадают в инвентарь сайта только после того,
 *  как бот получил трейд (см. bot.js): депозит зачисляется ровно один раз и только по реально полученным
 *  предметам. Предмет можно продать сайту за баланс (SELL_RATE от цены) или поставить на апгрейд.
 * ------------------------------------------------------------------ */
const SELL_RATE = cfg.sellRate;
const DEPOSIT_TTL = 15 * 60 * 1000, MAX_DEPOSIT_ITEMS = 20, MAX_INV = 5000;
const ACTIVE = new Set(['pending', 'sent', 'escrow']);
const TRADE_URL_RE = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d{1,10})&token=([\w-]{8})$/;
const STEAM64_BASE = 76561197960265728n;
const cents = usd => Math.round(usd * 100);
const usdFmt = n => '$' + n.toFixed(2);
const MIN_STAKE_CENTS = 100;                         // минимальная ставка: $1
const newUid = () => crypto.randomBytes(6).toString('hex');
const lastAction = new Map();                       // userId -> время последнего депозита/продажи (антиспам)
const tooFast = (u, ms = 3000) => { const t = Date.now(), last = lastAction.get(u.id) || 0; lastAction.set(u.id, t); return t - last < ms; };

function addItem(u, itemId) {
  if ((u.inv ||= []).length >= MAX_INV) return false;
  u.inv.push({ uid: newUid(), itemId, at: Date.now() }); return true;
}
const pubDeposit = d => ({ id: d.id, code: d.code, status: d.status, note: d.note || '', items: d.items, got: d.got || null,
  value: d.value ? d.value / 100 : null, createdAt: d.createdAt, offerId: d.offerId && !String(d.offerId).startsWith('mock-') ? d.offerId : null });
const walletPayload = u => ({
  balance: (u.balance || 0) / 100,
  inv: (u.inv || []).map(e => ({ uid: e.uid, itemId: e.itemId })),
  tradeUrl: u.tradeUrl || null,
  deposits: db.deposits.filter(d => d.uid === u.id).slice(-8).reverse().map(pubDeposit),
  bot: bot.info(), expiresInMin: DEPOSIT_TTL / 60000
});

// Проверка trade-ссылки: партнёр в ссылке обязан быть тем же аккаунтом, что вошёл через Steam
function parseTradeUrl(raw, steamId) {
  const m = TRADE_URL_RE.exec(String(raw || '').trim());
  if (!m) return { error: 'Это не похоже на trade-ссылку. Она выглядит так: https://steamcommunity.com/tradeoffer/new/?partner=…&token=…' };
  if (String(BigInt(m[1]) + STEAM64_BASE) !== steamId) return { error: 'Эта ссылка принадлежит другому аккаунту Steam. Нужна ссылка именно вашего аккаунта' };
  return { url: m[0] };
}

// Финал депозита. Идемпотентно: повторные сообщения от Steam ничего не начисляют второй раз.
function finishDeposit(dep, status, receivedNames = [], note = '') {
  if (!dep || dep.final) return;
  dep.updatedAt = Date.now();
  if (status === 'escrow') { dep.status = 'escrow'; dep.note = 'Steam удерживает обмен (trade hold). Предметы зачислятся, когда обмен завершится'; saveDb(); return; }
  dep.final = true; dep.status = status; dep.note = note;
  if (status === 'accepted') {
    const user = db.users.find(u => u.id === dep.uid);
    const got = [];
    for (const n of receivedNames) { const it = ITEM_BY_NAME.get(n); if (it && user && addItem(user, it.id)) got.push(it.id); }
    dep.got = got; dep.value = got.reduce((a, id) => a + cents(ITEM_BY_ID.get(id).price), 0);
    dep.note = got.length ? '' : 'Трейд принят, но предметов из каталога в нём не оказалось';
    console.log(`[deposit] ${user ? user.username : dep.uid}: принято ${got.length} шт. на $${(dep.value / 100).toFixed(2)}`);
  }
  saveDb();
}
const NOTES = { declined: 'Трейд отклонён', canceled: 'Трейд отменён', expired: 'Время на принятие трейда истекло', invalid: 'В трейде оказались недоступные предметы' };

const bot = createBot({
  sent(depId, offerId) { const d = db.deposits.find(x => x.id === depId); if (d && !d.final) { d.offerId = offerId; d.status = 'sent'; saveDb(); } },
  state(offerId, state, names) {
    const d = db.deposits.find(x => x.offerId === offerId);
    finishDeposit(d, state, names, NOTES[state] || '');
  },
  fail(depId, note) { finishDeposit(db.deposits.find(x => x.id === depId), 'failed', [], note); }
}, console.log);
const botHooksFail = (depId, note) => finishDeposit(db.deposits.find(x => x.id === depId), 'failed', [], note);

// заявки, которые никто не принял вовремя, закрываем (кроме обменов на удержании у Steam)
function expireDeposits() {
  for (const d of db.deposits) {
    if (d.final || d.status === 'escrow' || Date.now() - d.createdAt < DEPOSIT_TTL) continue;
    if (d.offerId) bot.cancel(d.offerId);
    finishDeposit(d, 'expired', [], NOTES.expired);
  }
  if (db.deposits.length > 600) db.deposits = [...db.deposits.filter(d => !d.final), ...db.deposits.filter(d => d.final).slice(-300)];
}

/* ───────────── HTTP ───────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon'
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.steamstatic.com https://*.akamaihd.net; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
const fail = (res, status, message) => sendJson(res, status, { message });
const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return fail(res, 400, 'bad url'); }
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) return fail(res, 403, 'forbidden');

  // страницы сайта (/, /players, /u/5 …) без пройденной проверки заменяем страницей загрузки
  const isPage = rel === '/index.html' || !path.extname(rel);
  if (isPage && !shieldPassed(req)) {
    return fs.readFile(path.join(PUBLIC, 'check.html'), (err, buf) => {
      if (err) return fail(res, 503, 'check page missing');
      buf = Buffer.from(buf.toString('utf8').replaceAll('%BRAND%', cfg.name));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  const send = (f, st) => {
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).pipe(res);
  };
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return send(file, st);
    if (path.extname(rel)) return fail(res, 404, 'not found');
    const index = path.join(PUBLIC, 'index.html');          // маршруты интерфейса (/profile, /u/…)
    fs.stat(index, (e2, st2) => (e2 ? fail(res, 404, 'not found') : send(index, st2)));
  });
}

async function readJson(req, res) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json') || !sameOrigin(req)) { fail(res, 400, 'Некорректный запрос'); return null; }
  try { return JSON.parse((await readBody(req)) || '{}'); } catch { fail(res, 400, 'Некорректный запрос'); return null; }
}

/* ───────────── админка для тестов (используется скриптом admin.js) ─────────────
 *  Выключена, пока не задана переменная ADMIN_TOKEN (минимум 12 символов): тогда /api/admin отвечает 404.
 *  Запросы принимаются только с этого же компьютера (loopback) и без заголовка X-Forwarded-For, то есть не через
 *  прокси; ADMIN_REMOTE=1 снимает это ограничение. Всегда нужен заголовок Authorization: Bearer <ADMIN_TOKEN>.
 *  Действия: list | give | set (суммы в долларах). Правит баланс в памяти и сразу сохраняет в базу, поэтому
 *  работает на запущенном сервере (прямая правка data/db.sqlite не годится: сервер перезапишет её своим состоянием).
 * ------------------------------------------------------------------ */
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '');
const ADMIN_ON = ADMIN_TOKEN.length >= 12;
if (process.env.ADMIN_TOKEN && !ADMIN_ON) console.warn('[admin] ADMIN_TOKEN короче 12 символов — админка выключена');
const MAX_BALANCE_CENTS = 1e10;                      // потолок баланса: $100 000 000
const isLoopback = a => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(String(a || ''));
function adminFind(key) {
  key = String(key ?? '').trim(); if (!key) return { err: 'Не указан игрок' };
  if (/^\d{17}$/.test(key) || /^\d{1,9}$/.test(key)) { const u = findUser(key); return u ? { u } : { err: `Игрок «${key}» не найден` }; }
  const q = key.toLowerCase(), exact = db.users.filter(x => String(x.username || '').toLowerCase() === q);
  const hit = exact.length ? exact : db.users.filter(x => String(x.username || '').toLowerCase().includes(q));
  if (hit.length === 1) return { u: hit[0] };
  return { err: hit.length ? `Под «${key}» подходит несколько игроков (${hit.slice(0, 5).map(x => `#${x.pid} ${x.username}`).join(', ')}) — укажите pid` : `Игрок «${key}» не найден` };
}
const adminRow = u => ({ pid: u.pid, steamId: u.steamId, username: u.username, balance: (u.balance || 0) / 100, items: (u.inv || []).length });
async function adminApi(req, res) {
  if (!ADMIN_ON) return fail(res, 404, 'not found');
  if (req.method !== 'POST') return fail(res, 405, 'Только POST');
  if (!process.env.ADMIN_REMOTE && (!isLoopback(req.socket.remoteAddress) || req.headers['x-forwarded-for'])) return fail(res, 403, 'Админка доступна только с этого компьютера');
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m || !safeEq(m[1], ADMIN_TOKEN)) return fail(res, 401, 'Неверный токен');
  let body; try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return fail(res, 400, 'Некорректный JSON'); }
  if (body.action === 'list') {
    const q = String(body.q || '').trim().toLowerCase();
    let list = db.users.filter(u => !q || String(u.pid) === q || u.steamId === q || String(u.username || '').toLowerCase().includes(q));
    list = list.sort((a, b) => a.pid - b.pid).slice(0, 200).map(adminRow);
    return sendJson(res, 200, { users: list, total: db.users.length });
  }
  if (body.action === 'give' || body.action === 'set') {
    const { u, err } = adminFind(body.user); if (err) return fail(res, 404, err);
    const raw = typeof body.amount === 'number' ? body.amount : String(body.amount ?? '').trim().replace(',', '.');
    const amount = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(amount) || Math.abs(amount) > MAX_BALANCE_CENTS / 100) return fail(res, 400, 'Некорректная сумма');
    const before = u.balance || 0, c = cents(amount);
    const next = body.action === 'give' ? before + c : c;
    if (next < 0) return fail(res, 400, `Баланс не может быть отрицательным (сейчас $${(before / 100).toFixed(2)})`);
    if (next > MAX_BALANCE_CENTS) return fail(res, 400, 'Слишком большой баланс');
    u.balance = next; saveDb();
    console.log(`[admin] #${u.pid} ${u.username}: $${(before / 100).toFixed(2)} → $${(next / 100).toFixed(2)} (${body.action} ${amount})`);
    return sendJson(res, 200, { user: adminRow(u), before: before / 100 });
  }
  return fail(res, 400, 'Неизвестное действие');
}

const server = http.createServer(async (req, res) => {
  for (const k in SECURITY) res.setHeader(k, SECURITY[k]);
  const { pathname } = new URL(req.url, 'http://localhost');

  if (SHIELD_ON && overLimit(req, pathname)) {
    res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'no-store' });
    return res.end('Слишком много запросов. Подождите немного.');
  }

  try {
    /* — проверка браузера (anti-DDoS) — */
    if (pathname === '/__shield/ticket' && req.method === 'GET') return sendJson(res, 200, { ticket: shieldTicket(req), wait: SHIELD_MIN_MS });
    if (pathname === '/__shield/pass' && req.method === 'POST') {
      const body = await readJson(req, res); if (!body) return;
      const err = shieldRedeem(req, res, body.ticket);
      return err ? fail(res, 400, err) : sendJson(res, 200, { ok: true });
    }
    /* — вход через Steam — */
    if (pathname === '/auth/steam' && req.method === 'GET') {
      if (limited(req)) return redirect(res, '/?error=rate');
      if (!relyingParty) return redirect(res, '/?error=setup');
      return relyingParty.authenticate(STEAM_PROVIDER, false, (err, url) => (err || !url ? redirect(res, '/?error=steam') : redirect(res, url)));
    }
    if (pathname === '/auth/steam/return' && req.method === 'GET') {
      if (!relyingParty) return redirect(res, '/?error=setup');
      const q = new URL(req.url, 'http://localhost').searchParams;
      if (q.get('openid.op_endpoint') !== STEAM_OP_ENDPOINT) return redirect(res, '/?error=steam');
      return relyingParty.verifyAssertion(req, async (err, result) => {
        try {
          const m = !err && result && result.authenticated && CLAIMED_RE.exec(String(result.claimedIdentifier || ''));
          if (!m) return redirect(res, '/?error=steam');
          const steamId = m[1];
          const profile = await fetchProfile(steamId);
          let user = db.users.find(u => u.steamId === steamId);
          if (!user) {
            user = { id: crypto.randomUUID(), pid: db.nextPid++, steamId, username: `Steam ${steamId.slice(-4)}`, createdAt: Date.now() };
            db.users.push(user);
            console.log(`[auth] новый пользователь ${profile?.username || user.username} (${steamId})`);
          }
          applyProfile(user, profile);                  // ник, аватарка и ссылка обновляются при каждом входе
          user.lastSeen = Date.now();
          createSession(res, user.id);                  // saveDb внутри
          redirect(res, '/');
        } catch (e) { console.error(e); redirect(res, '/?error=steam'); }
      });
    }

    if (pathname === '/api/admin') return adminApi(req, res);

    /* — API — */
    if (pathname === '/api/me' && req.method === 'GET') return sendJson(res, 200, { user: pub(currentUser(req)) });
    if (pathname === '/api/items' && req.method === 'GET') {
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', Vary: 'Accept-Encoding', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
      return res.end(gz ? ITEMS_GZ : ITEMS_JSON);
    }
    // иконка предмета: файл из data/item-icons; нет файла → 404, интерфейс покажет значок по цене
    const im = /^\/api\/icon\/([0-9a-f]{10})$/.exec(pathname);
    if (im && req.method === 'GET') {
      const f = icons.file(im[1]);
      if (!f) { res.writeHead(404, { 'Cache-Control': 'public, max-age=120' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': icons.mime(f), 'Cache-Control': 'public, max-age=86400' });
      const st = fs.createReadStream(f); st.on('error', () => res.destroy()); return st.pipe(res);
    }

    /* — кошелёк — */
    if (pathname === '/api/wallet' && req.method === 'GET') {
      const user = currentUser(req);
      return user ? sendJson(res, 200, walletPayload(user)) : fail(res, 401, 'Войдите через Steam');
    }
    // сохранить trade-ссылку (пустая строка — удалить)
    if (pathname === '/api/trade-url' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      const body = await readJson(req, res); if (!body) return;
      if (db.deposits.some(d => d.uid === user.id && ACTIVE.has(d.status))) return fail(res, 409, 'Дождитесь завершения текущего пополнения');
      if (!String(body.url || '').trim()) { delete user.tradeUrl; saveDb(); return sendJson(res, 200, walletPayload(user)); }
      const r = parseTradeUrl(body.url, user.steamId);
      if (r.error) return fail(res, 400, r.error);
      user.tradeUrl = r.url; saveDb();
      return sendJson(res, 200, walletPayload(user));
    }
    // создать заявку на пополнение: игрок называет, какие предметы отдаст; бот пришлёт трейд на его ссылку
    if (pathname === '/api/deposit' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      const body = await readJson(req, res); if (!body) return;
      if (bot.mode === 'off') return fail(res, 503, 'Пополнение временно недоступно');
      if (!user.tradeUrl) return fail(res, 400, 'Сначала сохраните trade-ссылку');
      const ids = Array.isArray(body.items) ? body.items.map(String) : [];
      if (!ids.length || ids.length > MAX_DEPOSIT_ITEMS || !ids.every(id => ITEM_BY_ID.has(id))) return fail(res, 400, `Выберите от 1 до ${MAX_DEPOSIT_ITEMS} предметов из каталога`);
      if (db.deposits.some(d => d.uid === user.id && ACTIVE.has(d.status))) return fail(res, 409, 'У вас уже есть активное пополнение');
      if (tooFast(user)) return fail(res, 429, 'Слишком часто. Подождите пару секунд');
      const dep = { id: crypto.randomBytes(8).toString('hex'), uid: user.id, items: ids, status: 'pending', code: crypto.randomBytes(3).toString('hex').toUpperCase(), createdAt: Date.now() };
      db.deposits.push(dep); saveDb();
      bot.request({ deposit: dep, tradeUrl: user.tradeUrl, steamId: user.steamId, names: ids.map(id => ITEM_BY_ID.get(id).name) })
        .catch(e => botHooksFail(dep.id, e.userMessage || 'Не удалось создать трейд, попробуйте позже'));
      return sendJson(res, 200, walletPayload(user));
    }
    if (pathname === '/api/deposit/cancel' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      const body = await readJson(req, res); if (!body) return;
      const dep = db.deposits.find(d => d.id === String(body.id) && d.uid === user.id && (d.status === 'pending' || d.status === 'sent'));
      if (!dep) return fail(res, 404, 'Заявка не найдена или уже завершена');
      if (dep.offerId) bot.cancel(dep.offerId);
      finishDeposit(dep, 'canceled', [], NOTES.canceled);
      return sendJson(res, 200, walletPayload(user));
    }
    // продать предмет из инвентаря сайта за баланс
    if (pathname === '/api/sell' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      const body = await readJson(req, res); if (!body) return;
      const k = (user.inv || []).findIndex(e => e.uid === String(body.uid));
      if (k < 0) return fail(res, 404, 'Предмет не найден');
      const it = ITEM_BY_ID.get(user.inv[k].itemId);
      user.inv.splice(k, 1);
      user.balance = (user.balance || 0) + cents(it.price * SELL_RATE);
      saveDb();
      return sendJson(res, 200, walletPayload(user));
    }

    // профиль текущего пользователя: данные Steam + статистика + история
    if (pathname === '/api/profile' && req.method === 'GET') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      return sendJson(res, 200, pubProfile(user));
    }
    // ручное обновление ника и аватарки из Steam (не чаще раза в 30 секунд)
    if (pathname === '/api/profile/refresh' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam');
      if (!sameOrigin(req)) return fail(res, 400, 'Некорректный запрос');
      const last = refreshAt.get(user.id) || 0;
      if (Date.now() - last < 30000) return fail(res, 429, 'Подождите немного перед следующим обновлением');
      refreshAt.set(user.id, Date.now());
      const profile = await fetchProfile(user.steamId);
      if (!profile) return fail(res, 502, 'Не удалось получить данные из Steam. Профиль закрыт или Steam недоступен');
      if (applyProfile(user, profile)) saveDb();
      return sendJson(res, 200, pubProfile(user));
    }
    // публичный профиль любого игрока по SteamID
    if (pathname === '/api/users' && req.method === 'GET') {
      const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
      return sendJson(res, 200, playersList(q.slice(0, 40)));
    }
    // публичный профиль по числовому ID (или по SteamID — так работали старые ссылки)
    const pm = /^\/api\/users\/(\d{1,17})$/.exec(pathname);
    if (pm && req.method === 'GET') {
      const u = findUser(pm[1]);
      return u ? sendJson(res, 200, pubProfile(u)) : fail(res, 404, 'Игрок не найден');
    }
    // бегущая строка: последние выпадения всех игроков
    if (pathname === '/api/feed' && req.method === 'GET') return sendJson(res, 200, feedList());

    if (pathname === '/api/logout' && req.method === 'POST') {
      if (!sameOrigin(req)) return fail(res, 400, 'Некорректный запрос');
      destroySession(req, res);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/spin' && req.method === 'POST') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Войдите через Steam, чтобы сделать апгрейд');
      const body = await readJson(req, res); if (!body) return;
      // ставка — только сумма с баланса (amount), минимум MIN_STAKE; предметами ставить нельзя; цену считает сервер
      const target = ITEM_BY_ID.get(String(body.target));
      if (!target) return fail(res, 400, 'Неизвестный предмет');
      if (body.uid != null) return fail(res, 400, 'Ставить предметы нельзя — ставка только с баланса');
      const amountNum = typeof body.amount === 'number' ? body.amount : Number(String(body.amount ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(amountNum) || amountNum <= 0) return fail(res, 400, 'Укажите сумму ставки');
      const stakeCents = cents(amountNum);
      if (stakeCents < MIN_STAKE_CENTS) return fail(res, 400, `Минимальная ставка — ${usdFmt(MIN_STAKE_CENTS / 100)}`);
      if (stakeCents > (user.balance || 0)) return fail(res, 400, 'Недостаточно средств на балансе');
      const stake = { name: `Баланс $${(stakeCents / 100).toFixed(2)}`, price: stakeCents / 100 };

      // ставка не может быть дороже желаемого предмета (сравниваем в центах, чтобы не спотыкаться о копейки)
      if (cents(stake.price) > cents(target.price)) return fail(res, 400, `Ставка не может быть дороже желаемого предмета (${usdFmt(target.price)})`);
      const chance = chanceFor(stake.price, target.price);
      const plan = makePlan({ chance });
      // списываем ставку сразу (до анимации), выигрыш зачисляем тут же: так нельзя отменить спин, перезагрузив страницу
      user.balance -= stakeCents;
      if (plan.win) addItem(user, target.id);
      recordSpin(user, target, plan, Date.now(), stake);
      console.log(`[spin] ${user.username}: ${stake.name} ($${stake.price}) -> ${target.name} ($${target.price}) · ${chance}% · ${plan.win ? 'WIN ' : 'miss'} · ${plan.pattern}`);
      return sendJson(res, 200, { id: target.id, ...plan });
    }

    if (pathname.startsWith('/api/')) return fail(res, 404, 'Не найдено');
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    fail(res, 405, 'method not allowed');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Ошибка сервера');
  }
});

if (require.main === module) {
  setInterval(expireDeposits, 30 * 1000).unref();
  server.headersTimeout = 15000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 60;
  server.listen(PORT, () => console.log(`Сервер запущен: ${BASE_URL}${SHIELD_ON ? '' : ' (проверка браузера и лимиты отключены)'}`));
}
module.exports = { feedList, playersList, makePlan, parsePersona, parseProfile, parseTradeUrl, finishDeposit, ITEMS };
