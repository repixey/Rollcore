import { arc, pct } from '../lib.js';

// chance — шанс выбранной пары (null, пока пара не выбрана); caption — подпись под числом
export default function Wheel({ chance, color, caption, phase, result, needleRef }) {
  const h = Math.min(Math.max((chance || 0) * 1.8, 0.05), 179.95);
  const win = result?.win;
  return (
    <div className="wheel" style={{ '--c': color || 'var(--accent)' }}>
      <svg className="wheel-static" viewBox="0 0 400 400" aria-hidden="true">
        <circle cx="200" cy="200" r="190" className="w-outer" />
        <circle cx="200" cy="200" r="150" className="w-track" />
        {chance != null && <path d={arc(180 - h, 180 + h)} className="w-arc" />}
        <circle cx="200" cy="200" r="124" className="w-disc" />
        <image href="/img/logo.svg" x="116" y="118" width="168" height="178" className="w-logo" preserveAspectRatio="xMidYMid meet" />
      </svg>
      <div className="needle" ref={needleRef}>
        <svg viewBox="0 0 400 400" aria-hidden="true"><path d="M200 27 L191 9 L209 9 Z" /></svg>
      </div>
      <div className="wheel-center" aria-live="polite">
        {result ? (<>
          <div className={'c-big ' + (win ? 'win' : 'lose')}>{win ? 'Выпало' : 'Мимо'}</div>
          <div className="c-cap">{result.name} · {pct(result.chance)}</div>
        </>) : (<>
          <div className={'c-big' + (phase === 'spin' ? ' dim' : '')}>{chance == null ? '—' : pct(chance)}</div>
          <div className="c-cap">{caption}</div>
        </>)}
      </div>
    </div>
  );
}
