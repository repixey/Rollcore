// Тонкая обёртка над fetch: JSON, понятные ошибки, status для обработки 401
export async function api(path, body) {
  let res;
  try {
    res = await fetch('/api' + path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch { throw Object.assign(new Error('Сервер недоступен'), { status: 0 }); }
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) throw Object.assign(new Error(data?.message || 'Ошибка сервера'), { status: res.status });
  return data;
}
