import { useEffect, useState } from 'react';

// Аватарка из Steam. Если картинки нет или она не загрузилась — круг с первой буквой ника.
export default function Avatar({ src, name = '?', size = 'md' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const letter = ([...String(name).trim()][0] || '?').toUpperCase();
  return (
    <span className={`avatar avatar-${size}`}>
      {src && !broken
        ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        : <span className="avatar-fallback" aria-hidden="true">{letter}</span>}
    </span>
  );
}
