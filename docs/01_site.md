# 01. Site / process

Public HTTPS (or local `http`) account origin. **PHP**. Same-origin `/v1/*` is **proxied** to the Node game process. The browser never talks MySQL.

## Do not

- Node `http.createServer` in this folder.
- Game tick, occupancy, combat, loot rolls. Player path and AoE-center ranking stay in the tab (`MOVE_PATH` dirs / CAST tile).
- IndexedDB `characters` store. Client 10 s save.
- Token in the URL. Passwords on the game socket.
- Proxy WebSocket `/v1/ws`.
- Put `mysql` in `client-config.json`.
- Directory listing. Path `..` static escape.
- Serve `content/maps/**/map.json`, creature kits, or whole-floor `sub_*.u16.gz`. Visual is a **window** (max **64×64**).

## Pins

| Knob | Value |
| :--- | :--- |
| `httpPort` | **8080** (`php -S`). Apache: **`www.example.com:80`** |
| `gameOrigin` | **`http://127.0.0.1:8081`** |
| `proxyApi` | **true** |
| `contentPath` | **`../content`** |
| Visual window | max **64×64** tiles (`GET /visual`) |
| HTTP / IP / min | **60** (`/health` `/ready` `/sprites/` exempt) |
| Proxy timeout | **15000** ms |

Apache (or a reverse proxy) owns sockets-per-IP. php -S is single-process.

## Settings merge

1. `config/settings.json` (committed).
2. `config/settings.local.json` if present — deep-merge (objects merge, arrays replace).
3. `FRONTEND_*` env. Env wins.

| Committed | Local overlay | Env |
| :--- | :--- | :--- |
| vocations, limits, `proxyApi`, `contentPath` | bind, log level | `FRONTEND_GAME_ORIGIN` |
| `siteName` | `httpPort`, `gameOrigin` | `FRONTEND_BIND`, `FRONTEND_HTTP_PORT`, `FRONTEND_LOG_LEVEL`, `FRONTEND_GAME_WS_URL`, `FRONTEND_CONTENT_PATH` |

Boot fails if `proxyApi` and `gameOrigin` is not `http://` or `https://`.

## Routes (this process)

| Method | Path | Role |
| :--- | :--- | :--- |
| GET | `/health` | frontend up |
| GET | `/ready` | frontend + game `/ready` |
| GET | `/client-config.json` | public api/ws/vocation/`mapId` pins — **no secrets** |
| GET | `/` `/login` `/register` `/account` `/play` `/wiki` | HTML |
| GET | `/visual` | floor **window** of hybrid visual subs (palette + cropped `sub_*`, no spawns) |
| GET | `/sprites/<genre>/<kind>/<variant>/<Stem>.png` | pack sprite PNG (`content/sprites`) |
| * | `/v1/*` except `/v1/ws` | proxy to `gameOrigin` (Cookie / Set-Cookie forwarded) |
| GET | `/v1/ws` | **404** — client opens `wsUrl` on the game origin |

## Key files

| Path | Role |
| :--- | :--- |
| `index.php` | Apache / `php -S` front controller |
| `bin/serve.php` | load settings, `php -S bind:port` |
| `php/Settings.php` | merge + env |
| `php/Proxy.php` | `/v1` reverse proxy (curl) |
| `php/Http.php` | JSON + files under `static/` only |
| `php/Visual.php` | `/visual` window + `/sprites` PNG from `content/` |
| `.htaccess` | deny `config/` `php/`; fallback to `index.php` |

## Play trade

`/play` trades one item, or one container and its contents, with another player. **Trade with …** is on a filled backpack slot, a filled equipment slot, an open bag slot, a ground item, and a Browse Field row, after the existing item actions. It is absent on an empty slot. Corpses, world pins, and fields do not get the entry.

Choosing it arms the same crosshair idea as **Use with …**. A map click on a player, a monster, an NPC, or an empty tile chooses that partner. A left click on a battle-list row does the same and does not attack. A corpse, a world pin, a ground item, or a click that is not the map or a battle-list row clears the aim and sends nothing. The battle-list menu stays Attack, Look, and Chase.

A player farther than Chebyshev 2 on this floor, or a ground or Browse Field item farther than Chebyshev 1, walks with the existing click-to-walk. `TRADE_OFFER` **48** is sent when that walk arrives. Another floor shows **First go upstairs.** or **First go downstairs.** and does not send. No path shows **There is no way.** A monster, an NPC, or an empty tile still sends at once. The server still refuses an offer that arrives out of range.

The **Trade** window is a floating bag panel. The left column is your offer. The right column is the partner. Names label the columns. Each sprite shows its count. **Accept** stays disabled until the counter snapshot arrives (`TRADE` **139**, side 1). Pressing it sends `TRADE_ACCEPT` **49** once and disables the button. **Reject** and the close button send `TRADE_CANCEL` **50**. `TRADE_CLOSE` **140** closes the window. A row click uses the existing item popover. Rows are not a drag source and not a drop target. The invited player has no window until their own offer. Server sentences stay the normal system `SAY`.

## Remaining

Play is `http://www.example.com/play` (same-origin sessionStorage). Visual hybrid + sprites are this origin (`/visual`, `/sprites`). Action bars: [03](./03_action_bars.md). Do not extract a play vhost until asked. **Later Symfony** on www — do not start until asked. Do not add a wiki loot table.
