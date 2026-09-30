# 03. Action bars / hotkeys

`/play` docks fire intents. Server admits `CAST` / `USE_ITEM` / `EQUIP`. Cooldown overlay follows tick deadlines.

UX facts come from the reference client (`legacy/client/modules/game_actionbar`, data only). Product chrome lives here. HuntDL `kernel/apps/game/action_bars.js` is **not** the analog. The game process does **not** store or admit bar JSON.

## Do not

- Copy `kernel/apps/game/action_bars.js` / `action_bar_modals.js` / `HuntDLClientDB`. Product assign chrome is `static/js/action_bar_assign.js`.
- Copy reference Lua, OTUI, packets, encryption, or brand names.
- Put spell formulas (`powerCurve`, `basePower`, `damageAmplitude`) in the browser.
- Measure remaining CD with `Date.now`.
- Drive the cooldown wipe with per-frame paint.
- Store characters (bag, pos, hp, quest flags) in IndexedDB or `localStorage`.
- Recreate `HuntDLClientDB`.
- Send bar JSON on the WebSocket (`SET_HOTKEYS` / `HOTKEYS` unused).
- Bind slots on the HuntDL **top** dock (reference layout is bottom / left / right only).
- Port hunt `command` macros, TAS queue, or AI command-bar dispatch.
- Reuse C2S **12** or **17**. Dump opcodes.

## Pins

| Knob | Value |
| :--- | ---: |
| Bars | **9** (ids **1–3** bottom, **4–6** left, **7–9** right) |
| Logical slots / bar | **50** (carousel; visible window below) |
| Visible window | **12** horizontal, **10** vertical |
| Multi-action depth | **3** |
| Default visible | bar **1** only |
| Bar 1 default keys | `F1`…`F12` on slots 0–11 |
| `logicUps` | **20** → 2 s GCD = **40** ticks |
| CD paint | **100** ms while any slot on CD; **4000** ms if tab hidden; stop when idle |
| CD dirty buckets | remaining **0.1** s + progress **1** % |
| `--cd-progress` | 0–100, rounded to **0.1** |
| `maxIntentsPerTick` | **5** |
| `maxWsFrameBytes` | **4096** |
| Walk keys (blocked on slots) | general hotkeys. Defaults: arrows + WASD, diagonals empty, Space, Shift+Space, Escape stops autowalk. Bare arrows, WASD, Escape, Tab, and Enter stay blocked on a slot |

`play.html` still has `#actionBarDockTop`. Leave empty. Do not assign slots. The live HUD never mounts it.

## Action types

| `t` | Slice | Fire |
| :--- | ---: | :--- |
| `spell` | 1 | `C2S.CAST` `spellId` + `targetId` + `x,y,z` |
| `item` | 1 | find first stack with `itemId` in backpack, every open `BAG` window (focused first), then equipment → `USE_ITEM` or `EQUIP` if equipable. Rune `USE_ITEM` already `runCast`. Count badge sums the same windows. Host: `getOpenBags()` plus last-focused `getOpenBag()` |
| `multi` | 1 | first ready sub-slot (depth ≤ **3**; sub = spell/item/text) |
| `text` | 1 | canvas FCT over the player (HuntDL analog). Not C2S chat |
| `passive` | later | only if a vocation authors one |
| `command` | **out** | hunt TAS / lab |

## Target modes (`m`)

| `m` | CAST / use |
| :--- | :--- |
| `smart_target` | sticky target if valid; else `area_centers.js` ranks a tile; `CAST` that `x,y,z` |
| `active_target` | `targetId` = current `SET_TARGET` (0 → no-op / `SAY`) |
| `cursor_prompt` | next canvas click is aim, then fire |
| `self` | `targetId` = self, tile = self |

`selfTarget` spells (Magic Patch, Light Heal, haste; UI catalog `selfTarget` or inferred shapeless heal/support) **always** fire on self. Slot `m` / sticky / cursor prompt do not retarget them. Server ignores CAST `targetId` for those ids.

Spell `requiresTarget` without a target does not fire. `window.cast` stays a debug helper.

## Persist (client IndexedDB)

Bar JSON is a **user preference**, like mouse mode. The game process never sees it. General hotkeys are not stored in a profile.

| Store | Where | Key |
| :--- | :--- | :--- |
| `actionBars` record `actionBarProfiles` | IndexedDB `engine.prefs` (not `HuntDLClientDB`) | one map for every profile, plus `lastProfileId` |
| `actionBars` record `generalHotkeys` | same store | one global set for every character and profile. Not inside a profile document |
| leftover id-keyed rows in `actionBars` | same store | numeric character id. Left on disk. Enter does not read them |
| leftover SQL `character_state.hotkeys` | MySQL | always `{}` — do not write bars here |

The map record:

```json
{"v":1,"lastProfileId":"Mystic","profiles":{"Mystic":{"v":1,"bars":[{"id":1,"side":"bottom","visible":true,"locked":false,"page":0,"slots":[{"i":0,"k":"F1","t":"spell","id":"snap_jab","m":"smart_target"}]}]}}}
```

| Field | Rule |
| :--- | :--- |
| profile id | character **name**, or vocation **label** (`Guardian`, `Scout`, …). Compared case-insensitively. Class id (`guardian`) matches the vocation profile as an alias |
| `lastProfileId` | profile selected most recently. Updated on enter and when the player switches profile |
| `id` | bar 1–9 |
| `side` | `bottom` \| `left` \| `right` |
| `k` | hotkey, normalized `F1` / `SHIFT+1` / `CTRL+1` |
| `t` | type above |
| slot `id` | `spellId` or item catalog id |
| `m` | target mode; default `smart_target` |

On enter the client picks one profile and renders it:

1. A profile whose id matches the character name.
2. Else a profile whose id matches the vocation label, or the class id.
3. Else `lastProfileId` when that profile still exists.
4. Else one new profile named with the vocation label. Bar 1 is seeded.

A vocation match **uses** that profile. Enter does not copy it under the character name, so characters of that vocation who have no profile of their own share it. A character who already has a profile keeps it, including when their name is the same string as a vocation. Saves write the active profile and `lastProfileId`. The Hotkeys page lists profiles and can add, copy, rename, or remove one. Removing the active profile selects the first one that remains. The last profile cannot be removed. Copy, then rename to a character name, so the next enter for that character takes step 1 of the chain.

The same page edits slots on the bottom (bars 1–3), left (4–6), and right (7–9) docks and sets how many bars each side shows (0–3). There is no top dock. Spell, object, text, multi, and hotkey use the existing assign modals. The live HUD paints every bar with `visible: true` (default: bar 1 only). Each bar keeps 50 logical slots and shows a window of 12 (bottom) or 10 (left/right). First, previous, next, and last arrows move that window; the lock control uses a closed lock and an open lock. A hotkey on a hidden bar still fires when it matches. Cooldown wipe stays on the 100 ms dirty poll. Structure HTML is rewritten only when the slot signature changes. Inventory packets refresh item counts; the walk loop does not.

General hotkeys are a second record, `generalHotkeys`, applied no matter which profile is active. Several keys per action are allowed. A key that is already on a slot shows the assign overwrite warning; confirming clears the slot key. Assigning that key to a slot clears it from the general action. Movement rebinds, including the four diagonals, change keyboard walk. Holding two cardinals combines into one diagonal step (latest key wins on each axis). A diagonal step waits twice the cardinal gap. Toggle Auto Chase has no default key. Stop Autowalk defaults to Escape, which still closes the settings window and the talk dialog.

Empty / missing bar doc seeds bar 1 from `GET /content/classes-ui.json` `spells` for the vocation, skipping `melee_auto` / `distance_auto` / `wand_auto` and `*_auto`. Mystic slot 0 = `snap_jab`. Assign/rearrange debounce-saves the active profile. Relog in this browser keeps F1. Omit empty slots.

`snapshot.js` writes `hotkeys: {}`. No `session.hotkeys`. Do not load SQL hotkeys onto the session.

## Wire (P18)

Fire only. No bar JSON on the socket.

| Op | id | Payload |
| :--- | ---: | :--- |
| `C2S.CAST` | 16 | `spellId str`, `targetId u32`, `x i16 y i16 z i8` |
| `S2C.CAST` | 129 | `sourceId u32`, `spellId str`, `targetId u32`, `x i16 y i16 z i8`, `flags u8` |
| `C2S.USE_ITEM` | 43 | bag slot |
| `C2S.EQUIP` | 40 | bag slot |

C2S **17** stays unused. Bar JSON is not on the socket. S2C **135** is `SKILL_PROGRESS` (skill counters, not bars). Opcode numbers in `static/js/protocol.js` **MUST** match `../server/src/protocol/opcodes.js`.

## Cooldown overlay

Buckets (server `cooldowns.js`): `auto` / `primary` / `secondary` / `spell.<id>` / `item`.

| Source | Use |
| :--- | :--- |
| `HELLO.ups` + `PONG.tickIndex` | clock |
| UI catalog `cooldowns.primary.attack` (snap_jab **2** s) | duration after **accepted** `S2C.CAST` |
| `REJECT` | do not start overlay |

Remaining = `readyTick − tickIndex` in ticks, painted as a wipe. Do not poll a hunt sim. Do not drive the wipe with per-frame paint. Skip DOM writes when remaining/progress buckets are unchanged. Structure HTML (icon/badge) is not rewritten for overlay ticks.

Slice 1 may estimate `readyTick = tickIndex + round(sec × ups)` locally after `S2C.CAST`. A later `S2C` remaining-ticks field is optional if overlay drifts.

## UI catalog

`GET /content/equipment.json` already exists.

| Route | Fields |
| :--- | :--- |
| `GET /content/spells-ui.json` | `id`, `label`, `mana`, `level`, `vocations`, `range`, `requiresTarget`, `selfTarget`, `allowOnSelf`, `kind`, `isMelee`, `shape.type`, `cooldowns`, `customUISprite` |
| `GET /content/classes-ui.json` | `{ classes: [{ id, spells, label?, baseSprite?, baseSpriteGenre? }] }` seed order. `label` when the class file has one. `baseSprite` is the vocation watch sprite (creature catalog id); `baseSpriteGenre` when that art is not the mode genre |

MUST NOT ship `powerCurve` / `basePower` / `damageAmplitude` / delayed fuse / field damage / class combat formulas on those routes.

Icons: `customUISprite` or spell id via existing `/sprites/…` resolver.

Assign: drag from backpack / equipment onto a slot (binds `itemId` only; no split modal). RMB on a slot: Assign/Edit Spell (filter + sort + targeting), Object (pick or type id), Text (FCT), Multi-Action (depth 3), Hotkey; Clear; Lock/Unlock. Locked bars block assign/drop; LMB/hotkey still fire.

## Slices

| # | Lands | Check |
| ---: | :--- | :--- |
| **1** | Bar 1 visible, 12 slots, F1–F12, client seed, `CAST`/`USE_ITEM`/`EQUIP`, GCD wipe from ticks, IndexedDB round-trip, RMB assign, drag-drop items, text FCT, multi depth 3, lock, item count | mystic F1 `snap_jab`; overlay **40** ticks at 20 UPS; relog in this browser keeps the slot; F1 does not send bar JSON; RMB Assign Spell lists vocation spells |
| **2** | Bars 2–9 toggle, carousel 50 | Settings counts 0–3 per bottom/left/right; arrows move the 50-slot window |
| later | `passive`, chat-on/off maps, remaining-ticks packet | — |

N1–N7 (consumables, regen, kit) do **not** block slice 1. `window.cast` already tests P12.

## Key files

| Path | Role |
| :--- | :--- |
| `static/play.html` | docks `#actionBarDockBottom` / `Left` / `Right` (top unused) |
| `static/js/play.js` | `window.cast`; docks stay out of this god-file |
| `static/js/action_bars.js` | Visible bottom/left/right docks, carousel, fire, CD wipe, persist the active profile |
| `static/js/action_bar_profiles.js` | `resolveProfile`, add, copy, rename, remove |
| `static/js/general_hotkeys.js` | global general-hotkey document (not per profile) |
| `static/js/action_bar_assign.js` | RMB menu + spell/object/text/multi/hotkey modals |
| `static/js/prefs.js` | IndexedDB `engine.prefs` / `actionBars` record `actionBarProfiles` |
| `static/js/protocol.js` | `CAST` 16 / 129. No 17. 135 is `SKILL_PROGRESS` |
| `static/js/area_centers.js` | Smart tile rank |
| `php/Router.php` | `spells-ui.json`, `classes-ui.json` |
| `../server/src/protocol/opcodes.js` | ids; 17 unused; 135 is `SKILL_PROGRESS` |
| `../server/src/world/snapshot.js` | `hotkeys: {}` |
| `../server/src/world/spells.js` | admit `CAST` |
| `../server/sql/001_init.sql` | leftover `character_state.hotkeys` JSON — unused |

## Remaining

- Slice 1 assign chrome landed (RMB menu, spell catalog filter/sort/targeting, object pick + drag-drop, text FCT, multi depth 3, hotkey capture, lock, item count). No `SET_HOTKEYS` / `HOTKEYS`.
- Slice 2: bottom/left/right counts 0–3, carousel of 50, distinct lock icons. Top dock stays empty.
- Native RMB menu is already off on `.play-shell`. Do not use the OS menu.
- Do not copy HuntDL `action_bars.js` / `action_bar_modals.js`.
