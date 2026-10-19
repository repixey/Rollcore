import { SiSteam } from 'react-icons/si';
import AuthLayout from '../components/AuthLayout.jsx';
import { Link } from '../router.jsx';

const MESSAGES = {
  steam: 'Не удалось войти через Steam. Попробуйте ещё раз.',
  rate: 'Слишком много попыток. Попробуйте чуть позже.',
  setup: 'Вход через Steam не настроен на сервере: выполните npm install и перезапустите его.'
};

export default function Login() {
  const code = new URLSearchParams(location.search).get('error');
  return (
    <AuthLayout title="Вход и регистрация" subtitle="Аккаунт создаётся автоматически при первом входе через Steam"
      footer={<Link to="/">← К колесу</Link>}>
      {/* обычная ссылка: это переход на сервер и затем на steamcommunity.com, а не маршрут интерфейса */}
      <a className="btn" href="/auth/steam"><SiSteam />Войти через Steam</a>
      {code && <p className="form-error" role="alert">{MESSAGES[code] || MESSAGES.steam}</p>}
      <p className="note">Пароль от Steam вводится только на сайте steamcommunity.com. Мы получаем лишь ваш публичный SteamID.</p>
    </AuthLayout>
  );
}
