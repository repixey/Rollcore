// Страница проверки браузера: берёт у сервера билет, ждёт (с анимацией) и меняет его на cookie, затем — на главную.
(() => {
  const $ = id => document.getElementById(id);
  const box = document.querySelector('.chk'), bar = $('bar'), msg = $('msg'), title = $('title'), note = $('note'), retry = $('retry'), art = $('art');
  const track = bar.parentNode;
  const LINES = ['Ставим варды на входе…', 'Забираем руну богатства…', 'Тащим Аегис…'];

  // Своя гифка: положите её в public/img/loader.gif — она подхватится сама и заменит анимацию-заставку
  const gif = new Image();
  gif.onload = () => { art.src = gif.src; };
  gif.src = '/img/loader.gif';

  retry.addEventListener('click', () => location.reload());

  function fail(text) {
    box.classList.add('fail');
    title.textContent = 'Не получилось';
    msg.textContent = text; msg.style.color = '';
    note.hidden = true; retry.hidden = false;
  }
  function setProgress(p) {
    bar.style.width = Math.round(p * 100) + '%';
    track.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  // защита от бесконечного цикла, если браузер не сохраняет cookie
  const KEY = 'dr_check', now = Date.now();
  let tries = [];
  try { tries = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(t => now - t < 60000); } catch { /* sessionStorage недоступен */ }
  tries.push(now);
  try { sessionStorage.setItem(KEY, JSON.stringify(tries)); } catch { /* ничего */ }
  if (tries.length > 4) return fail('Браузер не сохраняет cookie. Разрешите cookie для этого сайта и повторите.');

  async function run() {
    let ticket, wait;
    try {
      const r = await fetch('/__shield/ticket', { cache: 'no-store' });
      if (r.status === 429) return fail('Слишком много запросов. Подождите минуту и повторите.');
      if (!r.ok) throw new Error();
      ({ ticket, wait } = await r.json());
    } catch { return fail('Не удалось связаться с сервером.'); }

    // анимация: прогресс идёт, пока не пройдёт минимальное время ожидания
    const start = performance.now(), dur = wait + 300;
    await new Promise(done => {
      let last = -1;
      (function frame(t) {
        const p = Math.min(1, (t - start) / dur);
        setProgress(p * 0.95);
        const i = Math.min(LINES.length - 1, Math.floor(p * LINES.length));
        if (i !== last) { last = i; msg.textContent = LINES[i]; }
        if (p < 1) requestAnimationFrame(frame); else done();
      })(start);
    });

    try {
      const r = await fetch('/__shield/pass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) });
      if (r.status === 429) return fail('Слишком много запросов. Подождите минуту и повторите.');
      if (!r.ok) throw new Error();
    } catch { return fail('Проверка не пройдена. Попробуйте ещё раз.'); }

    box.classList.add('done');
    setProgress(1);
    title.textContent = 'Готово!';
    msg.textContent = 'Переходим на главную…';
    try { sessionStorage.removeItem(KEY); } catch { /* ничего */ }
    setTimeout(() => location.replace('/'), 450);
  }
  run();
})();
