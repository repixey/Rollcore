// Бот-приёмщик депозитов. Сам сайт Steam-трейды выполнять не умеет: нужен отдельный Steam-аккаунт («бот»),
// который отправляет игроку трейд-оффер на его trade-ссылку и сообщает сайту, когда оффер принят.
//
// Режимы (выбираются переменными окружения):
//   off   — по умолчанию: пополнение выключено;
//   mock  — DEPOSIT_MODE=mock: ТЕСТОВЫЙ режим без Steam, «принимает» трейд сам через MOCK_DELAY мс. Только для разработки!
//   steam — задан BOT_USERNAME: настоящий бот на steam-user + steam-tradeoffer-manager (ставятся отдельно).
//
// Контракт с сервером:
//   bot.request({ deposit: { id, code }, tradeUrl, steamId, names }) -> Promise
//        после отправки оффера вызывает hooks.sent(depositId, offerId); при ошибке бросает Error с .userMessage
//   hooks.state(offerId, state, receivedNames)  state: accepted | escrow | declined | canceled | expired | invalid
//   bot.cancel(offerId)
const cfg = require('./rollcore.config');
const GAME = cfg.game.appid, CONTEXT = String(cfg.game.contextid);
const userError = (msg, e) => Object.assign(e || new Error(msg), { userMessage: msg });

function createBot(hooks, log = console.log) {
  const mode = process.env.DEPOSIT_MODE === 'mock' ? 'mock' : process.env.BOT_USERNAME ? 'steam' : 'off';
  if (mode === 'mock') return mockBot(hooks, log);
  if (mode === 'steam') return steamBot(hooks, log);
  return { mode: 'off', info: () => ({ mode: 'off' }), async request() { throw userError('Пополнение временно недоступно'); }, cancel() {} };
}

function mockBot(hooks, log) {
  const delay = +process.env.MOCK_DELAY || 8000, timers = new Map();
  log('[bot] ТЕСТОВЫЙ режим: депозиты принимаются автоматически, предметы в Steam не передаются');
  return {
    mode: 'mock', info: () => ({ mode: 'mock' }),
    async request({ deposit, names }) {
      const offerId = 'mock-' + deposit.id;
      setTimeout(() => hooks.sent(deposit.id, offerId), 300);
      timers.set(offerId, setTimeout(() => { timers.delete(offerId); hooks.state(offerId, 'accepted', names); }, delay));
    },
    cancel(offerId) { clearTimeout(timers.get(offerId)); timers.delete(offerId); }
  };
}

function steamBot(hooks, log) {
  let SteamUser, SteamCommunity, SteamTotp, TradeOfferManager;
  try {
    SteamUser = require('steam-user'); SteamCommunity = require('steamcommunity');
    SteamTotp = require('steam-totp'); TradeOfferManager = require('steam-tradeoffer-manager');
  } catch { throw new Error('Для режима бота выполните: npm i steam-user steamcommunity steam-totp steam-tradeoffer-manager'); }

  const E = TradeOfferManager.ETradeOfferState;
  const client = new SteamUser(), community = new SteamCommunity();
  const manager = new TradeOfferManager({ steam: client, community, language: 'en', pollInterval: 10000 });
  let ready = false;

  const logon = () => client.logOn({
    accountName: process.env.BOT_USERNAME, password: process.env.BOT_PASSWORD,
    twoFactorCode: process.env.BOT_SHARED_SECRET ? SteamTotp.generateAuthCode(process.env.BOT_SHARED_SECRET) : undefined
  });
  client.on('loggedOn', () => { log('[bot] вошёл в Steam'); client.setPersona(SteamUser.EPersonaState.Online); });
  client.on('webSession', (sid, cookies) => {
    manager.setCookies(cookies, err => { if (err) return log('[bot] cookies: ' + err.message); ready = true; log('[bot] готов принимать трейды'); });
    community.setCookies(cookies);
  });
  client.on('error', e => { ready = false; log('[bot] ошибка Steam: ' + e.message); setTimeout(logon, 60000).unref(); });
  community.on('sessionExpired', () => { ready = false; client.webLogOn(); });
  logon();

  const MAP = { [E.Accepted]: 'accepted', [E.InEscrow]: 'escrow', [E.Declined]: 'declined', [E.Canceled]: 'canceled',
    [E.CanceledBySecondFactor]: 'canceled', [E.Expired]: 'expired', [E.InvalidItems]: 'invalid', [E.Countered]: 'declined' };
  manager.on('sentOfferChanged', offer => {
    const st = MAP[offer.state]; if (!st) return;
    // что реально получено — берём из самого оффера, а не из заявки пользователя
    hooks.state(String(offer.id), st, (offer.itemsToReceive || []).map(i => i.market_hash_name));
  });

  return {
    mode: 'steam',
    info: () => ({ mode: 'steam', steamId: process.env.BOT_STEAMID || (client.steamID ? client.steamID.getSteamID64() : null) }),
    request({ deposit, tradeUrl, names }) {
      return new Promise((resolve, reject) => {
        if (!ready) return reject(userError('Бот сейчас не в сети, попробуйте через минуту'));
        const offer = manager.createOffer(tradeUrl);
        // инвентарь игрока читаем по trade-токену из ссылки — он может быть и закрытым
        offer.getPartnerInventoryContents(GAME, CONTEXT, (err, inv) => {
          if (err) return reject(userError('Не удалось прочитать ваш инвентарь по trade-ссылке. Проверьте ссылку', err));
          const pool = inv.filter(i => i.tradable), picked = [], missing = [];
          for (const n of names) {
            const k = pool.findIndex(i => i.market_hash_name === n);
            if (k < 0) missing.push(n); else picked.push(pool.splice(k, 1)[0]);
          }
          if (missing.length) return reject(userError(`В инвентаре нет (или нельзя обменять): ${[...new Set(missing)].slice(0, 3).join(', ')}`));
          offer.addTheirItems(picked.map(i => ({ appid: GAME, contextid: CONTEXT, assetid: i.assetid })));
          offer.setMessage(`${cfg.name} · код ${deposit.code}`);
          offer.send(e2 => {
            if (e2) return reject(userError('Steam не принял трейд: ' + (e2.message || 'ошибка'), e2));
            hooks.sent(deposit.id, String(offer.id)); resolve();
          });
        });
      });
    },
    cancel(offerId) { manager.getOffer(offerId, (e, o) => { if (!e && o && o.state === E.Active) o.cancel(() => {}); }); }
  };
}

module.exports = { createBot };
