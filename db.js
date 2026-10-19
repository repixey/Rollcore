// Хранилище на SQLite (встроенный модуль node:sqlite, Node ≥ 22.13; npm-пакеты не нужны).
// Остальной код работает с обычным объектом db = { users, sessions, feed, deposits, nextPid } в памяти,
// а saveDb() записывает в базу только изменившиеся строки (одной транзакцией).
// Файл базы: data/db.sqlite. Если рядом лежит старый data/db.json, при первом запуске он переносится
// в SQLite и переименовывается в db.json.migrated.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// для каждой коллекции: ключ строки и индексируемые колонки (остальное лежит в data как JSON)
const TABLES = {
  users:    { key: u => u.id,  cols: { pid: u => u.pid ?? null, steam_id: u => u.steamId ?? null }, order: 'pid' },
  sessions: { key: s => s.h,   cols: { uid: s => s.uid ?? null, exp: s => s.exp ?? null }, order: 'rowid' },
  feed:     { key: f => `${f.t}:${f.pid}:${f.id}`, cols: { t: f => f.t ?? null, pid: f => f.pid ?? null }, order: 't, rowid' },
  deposits: { key: d => d.id,  cols: { uid: d => d.uid ?? null, status: d => d.status ?? null }, order: 'rowid' }
};

function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, 'db.sqlite'), legacy = path.join(dataDir, 'db.json');
  const sql = new DatabaseSync(dbFile);
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  for (const [name, t] of Object.entries(TABLES)) {
    const cols = Object.keys(t.cols).map(c => `${c} ${c === 'pid' || c === 't' || c === 'exp' ? 'INTEGER' : 'TEXT'}`).join(', ');
    sql.exec(`CREATE TABLE IF NOT EXISTS ${name} (k TEXT PRIMARY KEY, ${cols}, data TEXT NOT NULL)`);
  }
  sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_pid ON users(pid); CREATE INDEX IF NOT EXISTS users_steam ON users(steam_id); CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid); CREATE INDEX IF NOT EXISTS feed_t ON feed(t); CREATE INDEX IF NOT EXISTS deposits_uid ON deposits(uid)');

  const snap = {};                                   // table -> Map(key -> json): что уже записано
  const db = { users: [], sessions: [], feed: [], deposits: [], nextPid: 1 };

  const hasData = sql.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasData) {
    for (const [name, t] of Object.entries(TABLES)) {
      snap[name] = new Map();
      for (const r of sql.prepare(`SELECT k, data FROM ${name} ORDER BY ${t.order}`).all()) { snap[name].set(r.k, r.data); db[name].push(JSON.parse(r.data)); }
    }
    const m = sql.prepare("SELECT v FROM meta WHERE k = 'nextPid'").get(); if (m) db.nextPid = +m.v || 1;
  } else {
    for (const name of Object.keys(TABLES)) snap[name] = new Map();
    if (fs.existsSync(legacy)) {                     // перенос из старого JSON
      try { Object.assign(db, JSON.parse(fs.readFileSync(legacy, 'utf8'))); db.migrate = true; } catch (e) { console.warn('[db] не удалось прочитать db.json:', e.message); }
    }
  }

  const upsert = {}, del = {};
  for (const [name, t] of Object.entries(TABLES)) {
    const c = Object.keys(t.cols);
    upsert[name] = sql.prepare(`INSERT INTO ${name} (k, ${c.join(', ')}, data) VALUES (?, ${c.map(() => '?').join(', ')}, ?) ON CONFLICT(k) DO UPDATE SET ${[...c, 'data'].map(x => `${x} = excluded.${x}`).join(', ')}`);
    del[name] = sql.prepare(`DELETE FROM ${name} WHERE k = ?`);
  }
  const setMeta = sql.prepare("INSERT INTO meta (k, v) VALUES ('nextPid', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
  let lastPid = null;

  function save() {
    sql.exec('BEGIN');
    try {
      for (const [name, t] of Object.entries(TABLES)) {
        const old = snap[name], cur = new Map();
        for (const row of db[name]) cur.set(t.key(row), row);
        for (const [k, row] of cur) {
          const json = JSON.stringify(row);
          if (old.get(k) !== json) { upsert[name].run(k, ...Object.values(t.cols).map(f => f(row)), json); old.set(k, json); }
        }
        for (const k of [...old.keys()]) if (!cur.has(k)) { del[name].run(k); old.delete(k); }
      }
      if (lastPid !== db.nextPid) { setMeta.run(String(db.nextPid)); lastPid = db.nextPid; }
      sql.exec('COMMIT');
    } catch (e) { try { sql.exec('ROLLBACK'); } catch { /* уже откатилось */ } throw e; }
  }

  return { db, save, file: dbFile, legacy, sql };
}

module.exports = { openStore };
