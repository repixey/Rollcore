import { SiTelegram } from 'react-icons/si';
import { Link } from '../router.jsx';
import { BRAND, TELEGRAM_URL } from '../config.js';

export default function Footer() {
  return (
    <footer className="foot">
      <div className="foot-in">
        <span className="foot-copy">© {new Date().getFullYear()} {BRAND}</span>
        <nav className="foot-links" aria-label="Ссылки">
          <Link to="/privacy">Политика конфиденциальности</Link>
          <a className="foot-btn" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer"><SiTelegram />Партнёрство</a>
        </nav>
      </div>
    </footer>
  );
}
