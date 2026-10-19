import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronDown } from 'react-icons/lu';

// Выпадающий список в стиле сайта (обычный <select> нельзя оформить: список рисует браузер).
// options: [{ value, label }]
export default function Select({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const root = useRef(null);
  const idx = Math.max(0, options.findIndex(o => o.value === value));

  useEffect(() => {
    if (!open) return;
    const away = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const pick = o => { setOpen(false); if (o.value !== value) onChange(o.value); };
  const onKey = e => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setCur(idx); setOpen(true); return; }
      setCur(c => (c + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); pick(options[cur]); }
  };

  return (
    <div className="sel" ref={root} onKeyDown={onKey}>
      <button type="button" className="sel-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => { setCur(idx); setOpen(o => !o); }}>
        <span>{options[idx].label}</span><LuChevronDown className={'sel-arrow' + (open ? ' up' : '')} aria-hidden="true" />
      </button>
      {open && (
        <ul className="sel-list" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={i === cur ? 'cur' : ''}
              onMouseEnter={() => setCur(i)} onClick={() => pick(o)}>
              <span>{o.label}</span>{o.value === value && <LuCheck aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
