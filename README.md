# Rollcore

[English](README.md) | [Русский](README.ru.md)

A universal engine for item upgrade wheel sites. The player stakes value from their balance, picks a more expensive item from the catalog and spins the wheel. The engine is not tied to any game: catalog, site name, currency, house edge and the game used for deposits are set in one file, `rollcore.config.js`. A sample Dota 2 catalog is included. The server is plain Node.js with no framework, the interface is React. Sign-in is Steam only (OpenID 2.0), no API key needed.

The database is the built-in `node:sqlite`, so you need Node.js 22.13 or newer. Apart from a few npm packages, nothing else has to be installed.

## Quick start

```sh
git clone https://github.com/repixey/Rollcore.git
cd Rollcore
npm install
npm run build
node server.js
```

The site opens at `http://localhost:3000`. The `data/` folder with the database is created on first run.

The interface is built from `src/` into `public/assets/`. While developing, `npm run watch` is more convenient.

## Configuration

Everything is set through environment variables.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | 3000 | server port |
| `BASE_URL` | `http://localhost:PORT` | the site's address in the browser, Steam sends users back to it after sign-in. With https the cookie automatically gets the Secure flag |
| `DATA_DIR` | `./data` | `db.sqlite`, the shield key, caches |
| `TRUST_PROXY` | off | set `1` behind nginx or Cloudflare, otherwise all users look like one IP |
| `SHIELD` | on | `off` disables the check page and rate limits |
| `ICONS_DIR` | `data/item-icons` | folder with item icons |
| `ICONS_FILTER` | on | `0` keeps items without an icon in the catalog |
| `DEPOSIT_MODE` | off | `mock` for test deposits, a real bot is enabled through `BOT_*` |
| `ADMIN_TOKEN` | off | enables the admin API, see below |

## Adapting to your game

Everything that differs between two sites lives in `rollcore.config.js`. Run `npm run build` after editing it.

| Option | What it does |
|---|---|
| `name` | site name: header, tab titles, footer, trade message |
| `game` | game used for deposits: `name`, `appid`, `contextid` (Dota 2: 570 and `'2'`) |
| `telegramUrl` | link for the "Partnership" button |
| `edge`, `minChance`, `maxChance` | house edge and chance limits |
| `minPrice`, `sellRate` | catalog price cutoff and the share of the price paid when selling an item to the site |
| `tierThresholds` | price thresholds for rarity tiers |

To change the catalog, put your CSV into `catalog/source.csv` (rows like `"Game","Item name",price`), run `npm run items` and put icons into `data/item-icons`.

## How it works

**Catalog.** Items above $1 live in `catalog/items.json`. The file is generated from `catalog/source.csv` with `npm run items`. The cutoff is `minPrice` in `rollcore.config.js`. If an item drops out of the catalog while sitting in someone's inventory, its value goes back to the owner's balance at startup.

**Odds.** The formula is in `odds.js`, used by both the server and the browser:

```
chance = stake price / target price × (1 − 24%)
```

The result is clamped to between 0.01% and 70%. The 24% is the house edge, the `edge` option in `rollcore.config.js` (the chance limits `minChance` and `maxChance` live there too). The chance shown in the UI is the same number that decides the outcome.

**Stakes.** Money from the balance only, $1 minimum. A stake can't cost more than the target item, the server answers 400. A won item goes to the site inventory, where you can sell it back for balance (`sellRate` in the config, currently 100% of the price) or keep it. A lost stake is gone.

**Profiles.** Name and avatar come from the public Steam profile on every sign-in. Each player gets a numeric ID in order of registration. Pages: `/profile` and `/u/<ID>` for profiles, `/players` for a searchable player list. Above the header there's a ticker with the latest drops of real players, refreshed every 8 seconds.

**Icons.** The server downloads nothing. Drop images into `data/item-icons` and it matches them by item name, case and punctuation don't matter (`Mace of Aeons.png`, `mace_of_aeons.png`). Formats: png, jpg, webp, gif, svg. New files are picked up without a restart. At startup, items without an icon are removed from the catalog and the list goes to `data/icons-report.txt`. If the folder has no images at all, the filter does nothing. The repository ships no icons.

**Bot protection.** On the first visit a short animation page, `public/check.html`, is shown, then the server issues a 12-hour cookie. There are also per-IP rate limits per minute: 240 for `/api` and `/auth`, 120 for pages, 1500 for icons. This is a light filter, real DDoS has to be handled at the hosting level. You can put your own animation in `public/img/loader.gif`.

## Trade deposits

A player saves their trade URL on `/deposit`, picks items from the catalog and creates a request. The bot sends them a trade offer, and once it's accepted the site inventory is credited with the items the bot actually received, not what was claimed. A request with no answer is closed after 15 minutes. Withdrawing items back is not implemented yet.

Modes:

With no settings, deposits are off. `DEPOSIT_MODE=mock` is a test mode: the trade accepts itself after 8 seconds and nothing is sent to Steam. The real bot runs on `steam-user` and `steam-tradeoffer-manager` and needs `BOT_USERNAME`, `BOT_PASSWORD`, `BOT_SHARED_SECRET` and optionally `BOT_STEAMID`.

The real mode was written from the libraries' documentation and **has never been run against a live account**. Test it on a separate throwaway bot before accepting anyone's items.

## Admin

`admin.js` gives out and changes balances on a running server. It needs an `ADMIN_TOKEN` of at least 12 characters, without it the admin API answers 404.

```sh
ADMIN_TOKEN=a-long-token node server.js
ADMIN_TOKEN=a-long-token node admin.js list
ADMIN_TOKEN=a-long-token node admin.js give <player> 100
ADMIN_TOKEN=a-long-token node admin.js set <player> 49.99
```

`<player>` is a profile ID, a SteamID64 or part of a name. Requests are only accepted from the same machine and not through a proxy. On a production server it's best not to set `ADMIN_TOKEN` at all.

Don't edit `data/db.sqlite` by hand while the server is running, it keeps data in memory and will overwrite your changes.

## Layout

```
server.js           HTTP server, API, spin and wallet logic
rollcore.config.js  single engine config
odds.js             odds formula shared by server and browser
db.js               SQLite access
bot.js              Steam bot for deposits
icons.js            icon lookup and catalog filter
admin.js            console admin
build.js            interface build with esbuild
catalog/             catalog: items.json, source.csv
src/                React interface
public/             static files, check page, images
tools/              catalog build from csv
deploy/             systemd unit and example settings
scripts/deploy.sh   server update
```

## Deploying on Linux

You need Node.js 22.13+, git and, preferably, nginx with https in front.

```sh
sudo useradd --system --home /opt/rollcore rollcore
sudo git clone https://github.com/repixey/Rollcore.git /opt/rollcore
sudo chown -R rollcore: /opt/rollcore
cd /opt/rollcore
sudo -u rollcore npm ci
sudo -u rollcore npm run build

sudo cp deploy/rollcore.env.example /etc/rollcore.env
sudo nano /etc/rollcore.env
sudo cp deploy/rollcore.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rollcore
```

Make sure to fix `BASE_URL` in `/etc/rollcore.env`. After that, updates are one command:

```sh
sudo -u rollcore ./scripts/deploy.sh
```

The script pulls changes, installs dependencies, rebuilds the interface and restarts the service. For the `sudo systemctl` calls inside it, the `rollcore` user needs a sudoers rule, or you can run the script as your own user with sudo.

## Before running it for real

This is a site with real stakes, so check a few things before launch. The legality of such a service depends on your country, and Steam and Valve have their own rules for bots and trades. The privacy policy text in `src/pages/PrivacyPage.jsx` describes what the site stores today, review it for your own setup. The Telegram link is changed in `src/config.js`, then run `npm run build`. And remember the bot note above: don't point it at live items without testing.

## API

`GET /api/items`, `GET /api/icon/:id`, `GET /api/me`, `GET /api/feed`, `GET /api/users?q=`, `GET /api/users/:id`, `GET /api/profile`, `POST /api/profile/refresh`, `GET /api/wallet`, `POST /api/trade-url`, `POST /api/deposit`, `POST /api/deposit/cancel`, `POST /api/sell`, `POST /api/spin` with body `{amount, target}`.
