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
| `engine.mouseControls` | localStorage | play mouse mode (default Classic `1`), loot mode, talk-on-RMB, `moveStack`. Not character data |
| `engine.autoChase` / `engine.combatSort` | localStorage | play chrome prefs only |
| `engine.prefs` / `actionBars` | IndexedDB | one `actionBarProfiles` map (character name, then vocation label, then last profile) and one `generalHotkeys` record for every character. Old per-id rows stay unread. Not bag/pos/hp. See [03](./03_action_bars.md) |
| `engine.minimap` / `blocks` | IndexedDB | one minimap cache per `mapId` for this browser, shared by every character. 64×64 floor blocks. Each cell is unseen, or a seen debug id plus a baked door, field, or chest bit. Not creatures, bag, pos, or hp. `minimap_store.js` writes it. |
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
5. Viewport / appear / bag / dialog / skills are **display**. The right column paints a 180×140 minimap from the `engine.minimap` cache (`minimap_view.js`): zoom −2…2, floor up and down, center, and a player cross. Unseen pixels stay the panel background. Changing floor does not send a packet. A drag pans. A left click on the player's floor walks there (`minimap_path.js`). Another floor shows "You cannot walk to that floor." A destination farther than Euclidean 250 shows "Destination is out of range." Logic viewport tiles stay friction-derived debug ids (walk). Visual stamps load from `GET /visual` (floor window) + `GET /sprites/…`. Camera follows the presentation tile. HUD shows `x,y,z`. Damage, loot, talk, and respawn resolve on the server.

`/play` is product chrome on the protocol (P16) plus visual map (P17): three-column layout (runtime · canvas · eq/backpack/combat/skills). No Simulator session form. Mouse mode, loot mode, talk-on-right-click, move stack, and auto chase live on the Settings window Controls page (`client_window.js`) and still use `engine.mouseControls` and `engine.autoChase`. Mouse default **Classic** (unshifted RMB = default action; Ctrl+click = menu). Smart Left Ctrl on a world-pin crate or corpse opens it (`OPEN_CONTAINER` / `OPEN_CORPSE`); other Smart Ctrl hits stay the menu. Player-dropped stacks use `MOVE_ITEM` loc kind **2** (tile) plus `GROUND` / `GROUND_GONE` AOI. Classic RMB opens a ground bag (`OPEN_BAG` index 255) or picks a loose stack into the backpack (never same-tile). Drag slides a stack to an adjacent walkable tile. Smart LMB drag is only pure pickupables (`allowGroundLmbDrag`). Walk-away close is server-pushed (`BAG` capacity 0 / empty `CONTAINER`). Browse Field (canvas menu, only when that tile has a ground drop) opens `browse_field.js`: one float per tile titled Browse Field, cap 8, at least 30 slots, top item in slot 0. Same-floor tiles farther than Chebyshev 1 walk-then; another floor says First go upstairs. or First go downstairs. Leaving that range, or any floor change, closes the window and sends `BROWSE_FIELD_CLOSE`. A drop on the window does nothing. Use on a listed ground item is `USE_ITEM` index 255. Native browser context menu is suppressed on `.play-shell` (capture `preventDefault`; header stays native) so `#ctx-menu` and later bar/hotkey menus own RMB. The combat-list sort dropdown is viewport-fixed through the same `placeCtxMenu` flip/clamp so the right rail does not clip it. Settings and Character title bars share `float_panel_drag.js` with bag, dialog, shop, and loot headers. Escape closes Settings and leaves an open bag where it is. Click-to-walk and auto-chase use the minimap A* when `minimap_path.js` is loaded (Euclidean 250, 4096 expansions, same floor). A route sends at most 165 `MOVE_PATH` steps and searches again when that queue finishes short of the destination. The viewport BFS in `path_walk.js` remains only when the cache module is missing. Keyboard walk stays one `MOVE_STEP`. Auto Chase is a play-chrome pref (`engine.autoChase`); the game process has no chase opcode. Chase walks to Chebyshev **1** (adjacent) for every vocation — weapon range is attack, not stand-off. Combat-list LMB sets the target; RMB is Attack / Look / Chase (OTC battle list). Keyboard walk ignores OS key-repeat: first down immediate, auto-repeat after **200** ms, then interval ≥ `stepMs` (one in-flight `MOVE_STEP`). Checkboxes (Auto Chase, Move stack without dialog) do not swallow WASD. Controls checkbox **Move stack without dialog** is `mouse.moveStack` (off: plain drag opens the slider, Ctrl moves all; on: inverted). A release on the sidebar backpack, an open bag or quiver window, or the gap and padding around that grid sends `MOVE_ITEM` into that container (index 255, so a bag in slot 0 is not entered). A container item in the grid names its slot so the server enters it. The window highlights across that gap and padding. Equipment dropped on a container is `MOVE_ITEM` through the same stack-split helper. Ammo dropped on the quiver paperdoll slot (`shield`) is `MOVE_ITEM` to that slot; other drops there stay equip or an equipment swap. Bag is `INVENTORY`; equipment slots stay empty until the server sends gear. Death overlay until `STATS` hp > 0. Action bars: [03](./03_action_bars.md) (P18) — bar 1 fires `CAST` / `USE_ITEM` / `EQUIP`; layout is IndexedDB. `window.cast` is debug. Smart Cast may rank `area_centers.js` locally and still CAST the chosen tile.

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
| `static/js/browse_field.js` | Browse Field float: one window per tile, snapshot grid, cap 8 |
| `static/js/path_walk.js` | eight-direction BFS on the viewport. Fallback when `minimap_path.js` is missing |
| `static/js/minimap_store.js` | minimap blocks in IndexedDB `engine.minimap` |
| `static/js/minimap_path.js` | click-to-walk A* on the cache. Euclidean 250, 4096 expansions, packet cap 165 |
| `static/js/minimap_view.js` | 180×140 preview above equipment. Six debug colors. A left click reports the tile |
| `static/js/area_centers.js` | rank AoE centers for Smart Cast (client only) |
| `static/js/keyboard_walk.js` | key-press delay (200 ms auto-repeat, no OS repeat); two cardinals combine into a diagonal |
| `static/js/play.js` | WS renderer + Client panels + visual camera |
| `docs/03_action_bars.md` | P18 docks / hotkeys / CD overlay |
| `static/js/tile_draw.js` | scale/anchor + y-sort |
| `static/js/sprites.js` | `/sprites/…` image cache |
| `static/js/visual_map.js` | hybrid window fetch + prop collect |
| `php/Visual.php` | crop `sub_*` window; sprite PNG |
