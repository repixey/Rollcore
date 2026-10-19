// Общая математика шансов: её используют и сервер (решает исход), и интерфейс (показывает шанс).
//
// Модель «контракта»: вы ставите предмет ценой G и хотите получить предмет ценой T.
// Справедливый шанс — такой, при котором ожидаемая выгода равна ставке:  p · T = G  →  p = G / T.
// Из него вычитается комиссия площадки EDGE (rollcore.config.js), поэтому реальный шанс  p = G / T · (1 − EDGE).
// Среднее ожидание игрока ≈ (1 − EDGE) от ставки (пока шанс не упирается в потолок MAX), остальное — преимущество «дома».
// Показанный в интерфейсе шанс и шанс, по которому сервер решает исход, — одно и то же число.
//   • потолок MAX: даже ставя предмет дороже желаемого, 100% гарантии нет;
//   • пол MIN: исход решается с точностью 0.01% (1 из 10 000), меньше шанс не бывает.
const cfg = require('./rollcore.config');
const EDGE = cfg.edge;
const MIN = cfg.minChance;
const MAX = cfg.maxChance;

const TIERS = {
  common:    { name: 'Обычный',     color: '#5fbfa9', image: '/img/common.svg' },
  rare:      { name: 'Редкий',      color: '#6aa6e8', image: '/img/rare.svg' },
  epic:      { name: 'Эпический',   color: '#a095d4', image: '/img/epic.svg' },
  legendary: { name: 'Легендарный', color: '#e0a94f', image: '/img/legendary.svg' }
};
// «Редкость» для оформления выводится из цены (в CSV её нет)
const T = cfg.tierThresholds;
const tierOf = price => (price >= T.legendary ? 'legendary' : price >= T.epic ? 'epic' : price >= T.rare ? 'rare' : 'common');

// шанс в процентах (0.01 … 95) или null, если цены неизвестны
function chanceFor(give, target) {
  if (!(give > 0) || !(target > 0)) return null;
  const p = (give / target) * (1 - EDGE) * 100;
  return +Math.min(MAX, Math.max(MIN, p)).toFixed(2);
}

function oddsInfo(give, target) {
  const chance = chanceFor(give, target);
  if (chance === null) return null;
  return {
    chance,                                          // итоговый шанс, %
    fair: +Math.min(100, (give / target) * 100).toFixed(2), // шанс без комиссии, %
    multiplier: +(target / give).toFixed(2),         // во сколько раз желаемый предмет дороже ставки
    expected: +((chance / 100) * target).toFixed(2)  // средний выигрыш в $ (ожидание)
  };
}

module.exports = { EDGE, MIN, MAX, TIERS, tierOf, chanceFor, oddsInfo };
