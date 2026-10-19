import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Wheel from '../components/Wheel.jsx';
import InventoryPanel from '../components/InventoryPanel.jsx';
import CatalogPanel from '../components/CatalogPanel.jsx';
import ItemImg from '../components/ItemImg.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useWallet } from '../wallet.jsx';
import { norm, pct, usd, reduce, oddsInfo, decorate, EDGE } from '../lib.js';

const MIN_STAKE = 1;                                       // минимальная ставка, $ (то же на сервере)

export default function WheelPage() {
  const { user, expire } = useAuth();
  const { wallet, reload, act } = useWallet();
  const [items, setItems] = useState(null);
  const [mode, setMode] = useState('balance');             // вкладка слева: balance (ставка) | item (инвентарь: просмотр и продажа)
  const [giveId, setGiveId] = useState(null);              // выбранный предмет инвентаря (id каталога)
  const [amount, setAmount] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [phase, setPhase] = useState('idle');              // idle | fetch | spin
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const needleRef = useRef(null), angle = useRef(0);
  const busy = phase !== 'idle';

  useEffect(() => { api('/items').then(d => setItems(d.map(decorate))).catch(e => setError(e.message)); }, []);

  const byId = useMemo(() => new Map((items || []).map(i => [i.id, i])), [items]);
  // инвентарь сайта, сложенный в стопки одинаковых предметов
  const stacks = useMemo(() => {
    const m = new Map();
    for (const e of wallet?.inv || []) {
      const it = byId.get(e.itemId); if (!it) continue;
      const s = m.get(it.id) || m.set(it.id, { ...it, count: 0, uids: [] }).get(it.id);
      s.count++; s.uids.push(e.uid);
    }
    return [...m.values()].sort((a, b) => b.price - a.price);
  }, [wallet, byId]);

  useEffect(() => { if (giveId && !stacks.some(s => s.id === giveId)) setGiveId(null); }, [stacks, giveId]);

  // ставить можно только деньгами с баланса (минимум $1); предметы инвентаря можно лишь продать
  const amt = Math.round(parseFloat(amount) * 100) / 100;
  const tooSmall = amt > 0 && amt < MIN_STAKE;
  const balAmount = amt >= MIN_STAKE && wallet && amt <= wallet.balance ? amt : null;
  const givePrice = balAmount;
  const target = byId.get(targetId) || null;
  // ставка не может быть дороже желаемого предмета (то же правило проверяет сервер)
  const over = !!(givePrice && target && Math.round(givePrice * 100) > Math.round(target.price * 100));
  const odds = givePrice && target && !over ? oddsInfo(givePrice, target.price) : null;
  const reset = () => { setResult(null); setError(''); };

  const spin = useCallback(async () => {
    const el = needleRef.current;
    if (busy || !el) return;
    if (!user) { location.href = '/auth/steam'; return; }   // без входа крутить нельзя — отправляем в Steam
    if (!odds || !target) return;
    setError(''); setResult(null); setPhase('fetch');
    const body = { amount: balAmount, target: target.id };
    let plan;
    try { plan = await api('/spin', body); }               // исход и точку остановки решает сервер
    catch (e) {
      if (e.status === 401) { expire(); location.href = '/auth/steam'; return; }
      setError(e.message); setPhase('idle'); reload(); return;
    }
    setPhase('spin');
    const from = angle.current;
    const to = from + 360 * (reduce ? 1 : plan.spins) + norm(180 + plan.position - from);
    const anim = el.animate(
      [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }],
      { duration: reduce ? 1500 : plan.duration, easing: 'cubic-bezier(.33,.12,.1,1)', fill: 'forwards' }
    );
    try { await anim.finished; } catch { /* отменена */ }
    angle.current = norm(to);
    el.style.transform = `rotate(${angle.current}deg)`;
    anim.cancel();
    setResult({ win: plan.win, chance: plan.chance, name: target.name });
    setPhase('idle');
    reload();                                              // баланс и инвентарь обновляются, когда апгрейд завершился
  }, [busy, odds, target, balAmount, user, expire, reload]);

  useEffect(() => {
    const k = e => { if (e.code === 'Space' && !/INPUT|BUTTON|A|SELECT/.test(e.target.tagName)) { e.preventDefault(); spin(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [spin]);

  async function sell(stack) {
    setError('');
    try { await act('/sell', { uid: stack.uids[0] }); } catch (e) { setError(e.message); }
  }

  if (!items) return <main className="deck">{error ? <p className="form-error">{error}</p> : null}</main>;

  const need = wallet && wallet.balance < MIN_STAKE ? 'Нужно минимум $1 на балансе' : tooSmall ? 'Минимальная ставка — $1' : amt > (wallet?.balance || 0) ? 'Недостаточно средств' : 'Введите сумму ставки (от $1)';
  const label = busy ? 'Крутится…' : !user ? 'Войти через Steam и крутить' : !givePrice ? need : !target ? 'Выберите желаемый предмет' : over ? 'Ставка дороже желаемого' : 'Крутить';
  const caption = !user ? 'Войдите через Steam' : !givePrice ? 'Выберите ставку' : !target ? 'Выберите желаемый' : `${usd(balAmount)} → ${target.name}`;

  return (
    <main className="deck">
      <InventoryPanel user={user} wallet={wallet} stacks={stacks} mode={mode} setMode={m => { setMode(m); reset(); }}
        selected={giveId} onSelect={id => { setGiveId(id); reset(); }} amount={amount} setAmount={a => { setAmount(a); reset(); }} onSell={sell} disabled={busy} />

      <section className="center">
        <Wheel chance={odds?.chance ?? null} color={target?.color} caption={caption} phase={phase} result={result} needleRef={needleRef} />

        <div className="deal" aria-label="Выбранная пара">
          <div className="deal-side">
            <span className="tile-ph" />
            <b>{balAmount ? 'Ставка с баланса' : 'Ваша ставка'}</b><small>{givePrice ? usd(givePrice) : 'слева'}</small>
          </div>
          <span className="deal-arrow" aria-hidden="true">→</span>
          <div className="deal-side">
            {target ? <ItemImg item={target} /> : <span className="tile-ph" />}
            <b>{target ? target.name : 'Желаемый предмет'}</b><small>{target ? usd(target.price) : 'справа'}</small>
          </div>
        </div>

        {odds && (
          <dl className="odds">
            <div><dt>Шанс</dt><dd>{pct(odds.chance)}</dd></div>
            <div><dt>Множитель</dt><dd>×{odds.multiplier}</dd></div>
            <div><dt>Без комиссии</dt><dd>{pct(odds.fair)}</dd></div>
          </dl>
        )}
        {odds && <p className="odds-note">Шанс = цена ставки ÷ цена желаемого, минус комиссия {EDGE * 100}%. Среднее ожидание — {usd(odds.expected)} за ставку {usd(givePrice)}. Выигрыш попадает в инвентарь сайта, проигранная ставка сгорает.</p>}

        {over && <p className="form-error center" role="alert">Ставка не может быть дороже желаемого предмета: выберите предмет подороже или уменьшите ставку.</p>}

        <button className="btn" onClick={spin} disabled={busy || (!!user && !odds)}>{label}</button>
        {error && <p className="form-error center" role="alert">{error}</p>}
      </section>

      <CatalogPanel items={items} selected={targetId} givePrice={givePrice || null} onSelect={id => { setTargetId(id); reset(); }} disabled={busy} />
    </main>
  );
}
