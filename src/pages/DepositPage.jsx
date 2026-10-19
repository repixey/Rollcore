import { useMemo, useState } from 'react';
import { LuSearch, LuX, LuExternalLink, LuCheck, LuTriangleAlert } from 'react-icons/lu';
import ItemImg from '../components/ItemImg.jsx';
import { useEffect } from 'react';
import { api } from '../api.js';
import { BRAND, GAME } from '../config.js';
import { useWallet } from '../wallet.jsx';
import { usd, decorate } from '../lib.js';

const MAX = 20;
const STATUS = {
  pending: ['Создаём трейд…', 'wait'], sent: ['Ждёт принятия в Steam', 'wait'], escrow: ['Steam удерживает обмен', 'wait'],
  accepted: ['Зачислено', 'ok'], declined: ['Отклонено', 'bad'], canceled: ['Отменено', 'bad'], expired: ['Время вышло', 'bad'],
  failed: ['Не удалось', 'bad'], invalid: ['Недоступные предметы', 'bad']
};
const ago = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function DepositPage() {
  const { wallet, act } = useWallet();
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState('');
  const [editUrl, setEditUrl] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);                // id предметов (с повторами)
  const [err, setErr] = useState({ url: '', dep: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/items').then(d => setItems(d.map(decorate))).catch(() => {}); document.title = `Пополнение — ${BRAND}`; }, []);
  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? items.filter(i => i.name.toLowerCase().includes(s)) : items).slice(0, 60);
  }, [items, q]);

  if (!wallet) return <main className="page"><p className="muted">Загрузка…</p></main>;
  const active = wallet.deposits.find(d => ['pending', 'sent', 'escrow'].includes(d.status));
  const total = picked.reduce((a, id) => a + (byId.get(id)?.price || 0), 0);
  const showUrlForm = !wallet.tradeUrl || editUrl;
  const off = wallet.bot.mode === 'off';

  async function saveUrl(e) {
    e.preventDefault(); setBusy(true); setErr(s => ({ ...s, url: '' }));
    try { await act('/trade-url', { url }); setUrl(''); setEditUrl(false); } catch (x) { setErr(s => ({ ...s, url: x.message })); }
    setBusy(false);
  }
  async function createDeposit() {
    setBusy(true); setErr(s => ({ ...s, dep: '' }));
    try { await act('/deposit', { items: picked }); setPicked([]); } catch (x) { setErr(s => ({ ...s, dep: x.message })); }
    setBusy(false);
  }
  async function cancel(id) { try { await act('/deposit/cancel', { id }); } catch (x) { setErr(s => ({ ...s, dep: x.message })); } }

  return (
    <main className="page dep">
      <h1 className="page-title">Пополнение</h1>
      <p className="muted">Вы отдаёте предметы {GAME.name} боту через обычный трейд Steam, а когда обмен принят, они появляются в инвентаре сайта.</p>
      {wallet.bot.mode === 'mock' && <p className="notice"><LuTriangleAlert />Тестовый режим: трейды «принимаются» автоматически, предметы в Steam не передаются.</p>}
      {off && <p className="notice"><LuTriangleAlert />Пополнение временно недоступно: бот не подключён.</p>}

      <section className="card">
        <h2><span className="step">1</span>Ссылка на обмен (Trade URL)</h2>
        {!showUrlForm ? (
          <div className="url-ok">
            <LuCheck /><code>{wallet.tradeUrl.replace(/token=.+$/, 'token=••••••••')}</code>
            <button className="link-btn" onClick={() => setEditUrl(true)} disabled={!!active}>Изменить</button>
          </div>
        ) : (
          <form onSubmit={saveUrl} className="url-form">
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…" aria-label="Trade URL" autoComplete="off" spellCheck="false" />
            <button className="btn btn-inline" disabled={busy || !url.trim()}>Сохранить</button>
            {wallet.tradeUrl && <button type="button" className="btn-ghost" onClick={() => { setEditUrl(false); setErr(s => ({ ...s, url: '' })); }}>Отмена</button>}
          </form>
        )}
        {err.url && <p className="form-error" role="alert">{err.url}</p>}

        <details className="how" open={!wallet.tradeUrl}>
          <summary>Где взять ссылку на обмен</summary>
          <ol>
            <li>Откройте <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener noreferrer">страницу в Steam<LuExternalLink className="ext" /></a>. Либо: Steam → «Инвентарь» → «Предложения обмена» → справа «Кто может отправлять мне предложения обмена?».</li>
            <li>Внизу страницы, в блоке «Сторонние сайты» (Third-Party Sites), найдите поле «Ссылка для обмена» (Trade URL).</li>
            <li>Скопируйте ссылку целиком и вставьте её выше. Она выглядит как <code>…/tradeoffer/new/?partner=123456&amp;token=AbCd1234</code>.</li>
          </ol>
          <ul className="tips">
            <li>Ссылка должна быть от того же аккаунта Steam, с которым вы вошли на сайт.</li>
            <li>По ссылке можно только отправить вам предложение обмена, забрать предметы она не позволяет. Но не публикуйте её без нужды.</li>
            <li>Нужен включённый Steam Guard на телефоне. Если он включён меньше 7 дней, Steam удержит обмен (trade hold) до 15 дней.</li>
            <li>Принимайте трейд только от аккаунта бота{wallet.bot.steamId ? <> (<a href={`https://steamcommunity.com/profiles/${wallet.bot.steamId}`} target="_blank" rel="noopener noreferrer">профиль бота<LuExternalLink className="ext" /></a>)</> : ''}, в сообщении к нему будет код заявки с этой страницы.</li>
          </ul>
        </details>
      </section>

      <section className="card">
        <h2><span className="step">2</span>Какие предметы вы отдаёте</h2>
        <p className="muted small">Выберите предметы, которые лежат в вашем инвентаре Steam (до {MAX}). Название должно совпадать точно: Genuine, Inscribed и другие качества считаются разными предметами. Зачисляется то, что бот реально получил.</p>
        {picked.length > 0 && (
          <ul className="chips">
            {picked.map((id, i) => { const it = byId.get(id); return it && (
              <li key={i}><ItemImg item={it} /><span>{it.name}</span><small>{usd(it.price)}</small>
                <button aria-label="Убрать" onClick={() => setPicked(p => p.filter((_, k) => k !== i))}><LuX /></button></li>
            ); })}
          </ul>
        )}
        <label className="search search-sm">
          <LuSearch aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Поиск среди ${items.length} предметов`} aria-label="Поиск предмета" />
        </label>
        <ul className="rows-list pick-list">
          {found.map(it => (
            <li key={it.id}>
              <button className="row" disabled={picked.length >= MAX || !!active} onClick={() => setPicked(p => [...p, it.id])} style={{ '--rc': it.color }}>
                <ItemImg item={it} />
                <span className="row-main"><b>{it.name}</b><small>{usd(it.price)}</small></span>
                <span className="row-chance">+</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="dep-foot">
          <span>Выбрано: <b>{picked.length}</b> · на сумму <b>{usd(total)}</b></span>
          <button className="btn btn-inline" onClick={createDeposit} disabled={busy || off || !wallet.tradeUrl || !picked.length || !!active}>Создать трейд</button>
        </div>
        {!wallet.tradeUrl && <p className="muted small">Сначала сохраните ссылку на обмен.</p>}
        {active && <p className="muted small">Дождитесь завершения текущей заявки (или отмените её ниже).</p>}
        {err.dep && <p className="form-error" role="alert">{err.dep}</p>}
      </section>

      <section className="card">
        <h2><span className="step">3</span>Заявки</h2>
        {!wallet.deposits.length ? <p className="muted">Заявок пока нет.</p> : (
          <ul className="rows deps">
            {wallet.deposits.map(d => {
              const [label, kind] = STATUS[d.status] || [d.status, 'wait'];
              const names = (d.got || d.items).map(id => byId.get(id)?.name).filter(Boolean);
              return (
                <li key={d.id}>
                  <span className="grow">
                    <b>{names.slice(0, 2).join(', ')}{names.length > 2 ? ` и ещё ${names.length - 2}` : ''}</b>
                    <small>{ago(d.createdAt)} · код {d.code}{d.value != null ? ` · +${usd(d.value)}` : ''}</small>
                    {d.note && <small className="note">{d.note}</small>}
                  </span>
                  <span className={'pill ' + kind}>{label}</span>
                  {(d.status === 'pending' || d.status === 'sent') && <button className="btn-ghost" onClick={() => cancel(d.id)}>Отменить</button>}
                </li>
              );
            })}
          </ul>
        )}
        {active && <p className="muted small">В Steam придёт предложение обмена. Примите его в течение {wallet.expiresInMin} минут: статус обновится автоматически.</p>}
      </section>
    </main>
  );
}
