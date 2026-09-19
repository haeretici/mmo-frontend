# 02. Account UI / play handoff

Register, login, character list, one-shot play token, tiny wiki. Characters persist on the **game server**.

## Do not

- `indexedDB.open('HuntDLClientDB')` or any `characters` object store.
- `localStorage` character blobs (bag, pos, hp, quest flags).
- Autosave from the tab.
- Play token in query string / `window.name` / cookie.
- Reveal whether an email exists (`invalid_credentials` from the game API).
- Spawn locations or loot % on the wiki.

## Browser storage

| Key | Where | What |
| :--- | :--- | :--- |
| `engine.lastEmail` | localStorage | last login email, not password |
| `engine.playHandoff` | sessionStorage | `{ token, expiresAt, characterId }` for the tab hop to `/play`. Removed as soon as `/play` reads it |
| `engine.mouseControls` | localStorage | play mouse mode (default Classic `1`), loot mode, talk-on-RMB. Not character data |
| `engine.autoChase` / `engine.combatSort` | localStorage | play chrome prefs only |
| `engine.prefs` / `actionBars` | IndexedDB | per-character action-bar JSON. Not bag/pos/hp. See [03](./03_action_bars.md) |
| `HuntDLClientDB` | IndexedDB | **deleted** on boot if present (leftover lab origin). Never recreated |

After `/play` reads the handoff, the token lives in RAM until ENTER. TTL is the game `playTokenTtlSec` (**45**). Refresh without a new POST `/v1/play` → back to `/account`.

## Pages

| Path | Need session | Notes |
| :--- | :--- | :--- |
| `/` | no | CTA; `/v1/me` ok → continue to `/account` |
| `/register` | no | email + password 10–128. Confirm field is UI-only |
| `/login` | no | generic errors |
| `/account` | cookie | list / create / delete / Play. Name 3–20 `^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$` |
| `/play` | play handoff | renderer only. Intents to the game. Leave → `LOGOUT` + `/account` |
| `/wiki` | no | vocation blurbs only |

Input id for the character name is `char-name` (not `name` — `window.name` is a browser global).

## Play

1. Cookie session → `POST /v1/play` `{ characterId }` (proxied).
2. Write `engine.playHandoff` in sessionStorage.
3. `location = /play` (no token in the URL).
4. `/play` reads + **removes** the handoff, opens `client-config.wsUrl`, waits `HELLO`, `ENTER` seq=1 with 32 raw bytes.
5. Viewport / appear / bag / dialog / skills are **display**. Logic viewport tiles stay friction-derived debug ids (walk). Visual stamps load from `GET /visual` (floor window) + `GET /sprites/…`. Camera follows the presentation tile. HUD shows `x,y,z`. Damage, loot, talk, and respawn resolve on the server.

`/play` is product chrome on the protocol (P16) plus visual map (P17): three-column layout (runtime · canvas · eq/backpack/combat/skills). No Simulator session form. Mouse default **Classic** (unshifted RMB = default action; Ctrl+click = menu). Native browser context menu is suppressed on `.play-shell` (capture `preventDefault`; header stays native) so `#ctx-menu` and later bar/hotkey menus own RMB. Click-to-walk and auto-chase path on the viewport, then one `MOVE_PATH` (array of dirs). Auto Chase is a play-chrome pref (`engine.autoChase`); the game process has no chase opcode. Keyboard walk ignores OS key-repeat: first down immediate, auto-repeat after **200** ms, then interval ≥ `stepMs` (one in-flight `MOVE_STEP`). Bag is `INVENTORY`; equipment slots stay empty until the server sends gear. Death overlay until `STATS` hp > 0. Action bars: [03](./03_action_bars.md) (P18) — bar 1 fires `CAST` / `USE_ITEM` / `EQUIP`; layout is IndexedDB. `window.cast` is debug. Smart Cast may rank `area_centers.js` locally and still CAST the chosen tile.

`/play` is the product renderer (same-origin handoff). Do not extract a play vhost until asked. Do not grow it into Hunt Simulator. Later Symfony on www does not move the game tick.

## Key files

| Path | Role |
| :--- | :--- |
| `static/js/prefs.js` | last email, play mouse prefs, delete lab DB |
| `static/js/api.js` | `credentials: 'same-origin'` JSON |
| `static/js/auth.js` | register / login |
| `static/js/account.js` | characters + play |
| `static/js/protocol.js` | frames (opcode numbers must match the game server) |
| `static/js/mouse_dispatcher.js` | Classic/Regular/Smart intents (pure) |
| `static/js/path_walk.js` | orthogonal click-to-walk / chase on the viewport |
| `static/js/area_centers.js` | rank AoE centers for Smart Cast (client only) |
| `static/js/keyboard_walk.js` | key-press delay (200 ms auto-repeat, no OS repeat) |
| `static/js/play.js` | WS renderer + Client panels + visual camera |
| `docs/03_action_bars.md` | P18 docks / hotkeys / CD overlay |
| `static/js/tile_draw.js` | scale/anchor + y-sort |
| `static/js/sprites.js` | `/sprites/…` image cache |
| `static/js/visual_map.js` | hybrid window fetch + prop collect |
| `php/Visual.php` | crop `sub_*` window; sprite PNG |
