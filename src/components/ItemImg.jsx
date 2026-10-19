import { useState } from 'react';

// Иконка предмета. Сервер перенаправляет /api/icon/<id> на CDN Steam (картинки у нас не лежат).
// Пока иконка неизвестна или не загрузилась — показываем значок по цене предмета.
export default function ItemImg({ item, className }) {
  const [badId, setBadId] = useState(null);
  const bad = badId === item.id;
  return <img className={className} src={bad ? item.image : `/api/icon/${item.id}`} alt="" loading="lazy" onError={() => setBadId(item.id)} />;
}
