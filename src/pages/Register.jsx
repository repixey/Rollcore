import { useState } from 'react';
import AuthLayout, { Field } from '../components/AuthLayout.jsx';
import { Link } from '../router.jsx';
import { useAuth } from '../auth.jsx';

const NAME_RE = /^[\p{L}\p{N}_]{3,24}$/u;

export default function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({ username: '', password: '', repeat: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const name = f.username.trim();
    if (!NAME_RE.test(name)) return setError('Логин: 3–24 символа, буквы, цифры и «_»');
    if (f.password.length < 8) return setError('Пароль должен быть не короче 8 символов');
    if (f.password !== f.repeat) return setError('Пароли не совпадают');
    setError(''); setBusy(true);
    try { await register(name, f.password); }
    catch (x) { setError(x.message); setBusy(false); }
  }

  return (
    <AuthLayout title="Регистрация" subtitle="Создайте аккаунт — это займёт меньше минуты"
      footer={<>Уже есть аккаунт? <Link to="/login">Войти</Link></>}>
      <form onSubmit={submit} noValidate>
        <Field label="Логин" value={f.username} onChange={set('username')} autoComplete="username" autoFocus required />
        <Field label="Пароль" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required />
        <Field label="Повторите пароль" type="password" value={f.repeat} onChange={set('repeat')} autoComplete="new-password" required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Создаём…' : 'Создать аккаунт'}</button>
      </form>
    </AuthLayout>
  );
}
