#!/usr/bin/env node
// Админ-панель для тестов: выдаёт и меняет баланс игрокам на ЗАПУЩЕННОМ сервере.
// Нужен Node ≥ 18 (npm-пакеты не нужны). Работает через /api/admin, который включается переменной ADMIN_TOKEN.
//
//   1) запустите сервер с токеном (любой, минимум 12 символов):
//        ADMIN_TOKEN=мой-секретный-токен node server.js
//   2) в другом окне терминала запустите панель с тем же токеном:
//        ADMIN_TOKEN=мой-секретный-токен node admin.js            ← интерактивное меню
//        ADMIN_TOKEN=... node admin.js list [поиск]               ← список игроков и балансы
//        ADMIN_TOKEN=... node admin.js give <игрок> <сумма>       ← прибавить (можно отрицательную — списать)
//        ADMIN_TOKEN=... node admin.js set  <игрок> <сумма>       ← установить баланс
//      <игрок> — pid (число из профиля, например 1), SteamID64 или ник (целиком либо часть, если он один такой).
//      Суммы в долларах: 100, 49.99. Адрес сервера: ADMIN_URL (по умолчанию http://localhost:$PORT или :3000).
//   Токен и адрес можно передать и флагами --token=... --url=...  Игрок увидит новый баланс после обновления страницы.
//
// Админка принимает запросы только с этого же компьютера; на удалённом сервере зайдите по SSH и запустите там
// (или поднимите туннель: ssh -L 3000:localhost:3000 сервер).
const readline = require('readline');

const args = process.argv.slice(2);
const flag = n => { const i = args.findIndex(a => a.startsWith('--' + n + '=')); return i < 0 ? null : args.splice(i, 1)[0].slice(n.length + 3); };   // --token=...  --url=...
const TOKEN = flag('token') || process.env.ADMIN_TOKEN || '';
const URL_BASE = (flag('url') || process.env.ADMIN_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

const usd = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function call(body) {
  let r;
  try {
    r = await fetch(URL_BASE + '/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body) });
  } catch (e) { throw new Error(`Не удалось подключиться к ${URL_BASE} — сервер запущен? (${e.cause?.code || e.message})`); }
  let data = {}; try { data = await r.json(); } catch { /* не JSON */ }
  if (r.status === 404 && !data.message?.includes('Игрок')) throw new Error('Админка выключена: запустите сервер с ADMIN_TOKEN=... (минимум 12 символов)');
  if (!r.ok) throw new Error(data.message || `Ошибка ${r.status}`);
  return data;
}

function printUsers(users, total) {
  if (!users.length) return console.log('Никого не найдено.');
  const w = Math.max(4, ...users.map(u => String(u.username || '').length));
  console.log(`${'pid'.padEnd(5)} ${'ник'.padEnd(w)}  ${'баланс'.padStart(14)}  предметов  SteamID`);
  for (const u of users) console.log(`${String(u.pid).padEnd(5)} ${String(u.username || '').padEnd(w)}  ${usd(u.balance).padStart(14)}  ${String(u.items).padStart(9)}  ${u.steamId || ''}`);
  if (total > users.length) console.log(`… показано ${users.length} из ${total}, уточните поиск`);
}
const list = async q => { const d = await call({ action: 'list', q }); printUsers(d.users, d.total); };
async function change(action, user, amount) {
  const d = await call({ action, user, amount });
  console.log(`#${d.user.pid} ${d.user.username}: ${usd(d.before)} → ${usd(d.user.balance)}`);
}

async function panel() {
  // строки ввода складываем в очередь, чтобы меню работало и в терминале, и при подаче ввода через pipe
  const rl = readline.createInterface({ input: process.stdin });
  const queue = [], waiters = []; let closed = false;
  rl.on('line', l => (waiters.length ? waiters.shift()(l.trim()) : queue.push(l.trim())));
  rl.on('close', () => { closed = true; while (waiters.length) waiters.shift()(null); });
  const ask = q => { process.stdout.write(q); return queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise(res => waiters.push(res)); };
  console.log(`\nАдмин-панель  ·  сервер ${URL_BASE}\n`);
  for (;;) {
    console.log('\n 1) список игроков   2) выдать баланс (+)   3) установить баланс   4) списать (−)   0) выход');
    const c = await ask('> ');
    try {
      if (c === null || c === '0' || c.toLowerCase() === 'q') break;
      if (c === '1') await list((await ask('Поиск (Enter — все): ')) || '');
      else if (c === '2' || c === '3' || c === '4') {
        const u = await ask('Игрок (pid / SteamID / ник): '); if (!u) continue;
        const a = await ask(c === '3' ? 'Новый баланс, $: ' : c === '4' ? 'Сколько списать, $: ' : 'Сколько выдать, $: '); if (!a) continue;
        const n = Number(a.replace(',', '.'));
        if (!Number.isFinite(n)) { console.log('Ошибка: некорректная сумма'); continue; }
        await change(c === '3' ? 'set' : 'give', u, c === '4' ? -Math.abs(n) : n);
      }
    } catch (e) { console.log('Ошибка:', e.message); }
  }
  rl.close();
}

(async () => {
  if (TOKEN.length < 12) { console.error('Укажите токен (минимум 12 символов): ADMIN_TOKEN=... node admin.js   — тот же, с которым запущен сервер.'); process.exit(1); }
  const [cmd, a1, a2] = args;
  try {
    if (!cmd) return await panel();
    if (cmd === 'list') return await list(args.slice(1).join(' '));
    if ((cmd === 'give' || cmd === 'set') && a1 && a2 !== undefined) {
      const n = Number(String(a2).replace(',', '.'));
      if (!Number.isFinite(n)) { console.error('Ошибка: некорректная сумма «' + a2 + '»'); process.exit(1); }
      return await change(cmd, a1, n);
    }
    console.error('Использование:\n  node admin.js                     интерактивное меню\n  node admin.js list [поиск]\n  node admin.js give <игрок> <сумма>\n  node admin.js set  <игрок> <сумма>');
    process.exit(1);
  } catch (e) { console.error('Ошибка:', e.message); process.exit(1); }
})();
