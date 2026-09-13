'use strict';

const TILE = { 0: '#111', 1: '#3a7d3a', 2: '#c2a36b', 3: '#5a5a5a', 4: '#2a5a8a', 5: '#d4b84a' };
const TS = 32;
const CREATURE_MIN = 1000000000;
const ENGAGE_RANGE = 7;
const BACKPACK_SLOTS = 20;
const SKILL_ROWS = [
    { key: 'axe', label: 'Axe' },
    { key: 'club', label: 'Club' },
    { key: 'distance', label: 'Distance' },
    { key: 'fishing', label: 'Fishing' },
    { key: 'fist', label: 'Fist' },
    { key: 'magic', label: 'Magic Level' },
    { key: 'shielding', label: 'Shielding' },
    { key: 'sword', label: 'Sword' }
];
const SORT_FNS = {
    display_time_asc: function (a, b) { return a.seenAt - b.seenAt; },
    display_time_desc: function (a, b) { return b.seenAt - a.seenAt; },
    distance_asc: function (a, b) { return a.dist - b.dist; },
    distance_desc: function (a, b) { return b.dist - a.dist; },
    hp_percent_asc: function (a, b) { return a.hpPct - b.hpPct; },
    hp_percent_desc: function (a, b) { return b.hpPct - a.hpPct; },
    name_asc: function (a, b) { return a.name.localeCompare(b.name); },
    name_desc: function (a, b) { return b.name.localeCompare(a.name); }
};

function tileColor(t) {
    if (TILE[t]) return TILE[t];
    if ((t | 0) === 255) return '#2a2a38';
    const u = Math.max(0, Math.min(254, t | 0));
    const k = 1 - (u / 254);
    return 'rgb(' + Math.round(40 + k * 140) + ',' + Math.round(50 + k * 120) + ',55)';
}

const { C2S, S2C, APPEAR_FLAG, SKILL_ORDER, REASON, hexToBytes, encodeFrame, u32buf, encodeTileUse, encodeUseItemWith, encodeStrPayload, encodeContainerSlot, encodeEquip, encodeUnequip, Reader } = EngineProtocol;
const Mouse = EngineMouse;
const Path = EnginePath;
const Draw = EngineTileDraw;
const Sprites = EngineSprites;
const Visual = EngineVisual;
const KeyWalk = EngineKeyboardWalk;
const Hud = EngineEntityHud;
const Ground = typeof EngineGroundRenderer !== 'undefined' ? EngineGroundRenderer : null;
const SpritePres = typeof EngineSpritePresentation !== 'undefined' ? EngineSpritePresentation : null;
const CombatFx = typeof EngineCombatFx !== 'undefined' ? EngineCombatFx : null;
const tilemapCache = Visual && typeof Visual.createTilemapCache === 'function' ? Visual.createTilemapCache({ margin: 2 }) : null;

let ws = null;
let clientSeq = 1;
let viewport = null;
let self = null;
let others = new Map();
let corpses = new Map();
let worldPins = new Map();
let groundItems = new Map();
let fields = new Map();
let pendingUseWith = null;
let seenAt = new Map();
let openCorpse = 0;
let bag = { containerId: '', capacity: BACKPACK_SLOTS, slots: [] };
let openBag = null;
let equipment = {};
let capVal = null;
let capMax = null;
let skills = null;
let talkNpc = 0;
let shopNpc = 0;
let pingTimer = 0;
let targetId = 0;
let hoveredEntityId = 0;
let downed = false;
let mouse = loadMouseControls();
let autoChase = loadAutoChase();
let combatSort = loadCombatSort();
let selectedBag = -1;
let walkDest = null;
let walkBusy = false;
let walkRetry = 0;
let pendingAfterWalk = null;
const keyWalk = KeyWalk.create();
let buttonsDown = { left: false, right: false };
let cancelNext = false;
let fctTimer = 0;
let lastTick = 0;
let ups = 20;
let frames = 0;
let fps = 0;
let fpsTs = 0;
let mapId = 'firstlight_isle';
let camX = 0;
let camY = 0;
let stepMs = 200;
const visualLoader = Visual.createLoader();

const canvas = document.getElementById('world');
const ctx = canvas ? canvas.getContext('2d') : null;
const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');

function $(id) { return document.getElementById(id); }

function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

function visualPos(ent) {
    if (!ent) return null;
    if (ent.moveDur > 0 && ent.moveAt) {
        const t = Math.max(0, Math.min(1, (nowMs() - ent.moveAt) / ent.moveDur));
        return {
            x: Number(ent.fromX) + ((ent.x | 0) - Number(ent.fromX)) * t,
            y: Number(ent.fromY) + ((ent.y | 0) - Number(ent.fromY)) * t,
            z: ent.z
        };
    }
    return { x: Number(ent.x) || 0, y: Number(ent.y) || 0, z: ent.z };
}

function faceTowardTarget(ent, target) {
    if (!ent || !target) return;
    if (ent.moveDur > 0 && ent.moveAt && (nowMs() - ent.moveAt) < ent.moveDur) return;
    const tVis = visualPos(target) || target;
    const eVis = visualPos(ent) || ent;
    const dx = tVis.x - eVis.x;
    if (dx < -0.1) ent.facing = -1;
    else if (dx > 0.1) ent.facing = 1;
}

function beginSlide(ent, x, y, z) {
    if (!ent) return;
    const vis = visualPos(ent);
    const sameFloor = vis && (ent.z | 0) === (z | 0);
    if (sameFloor && vis && ((vis.x !== x) || (vis.y !== y))) {
        const dx = x - vis.x;
        if (dx < -0.01) ent.facing = -1;
        else if (dx > 0.01) ent.facing = 1;
        ent.fromX = vis.x;
        ent.fromY = vis.y;
        ent.moveAt = nowMs();
        ent.moveDur = stepMs;
    } else {
        const prevX = ent.x != null ? ent.x : x;
        const dx = x - prevX;
        if (dx < 0) ent.facing = -1;
        else if (dx > 0) ent.facing = 1;
        ent.fromX = x;
        ent.fromY = y;
        ent.moveAt = 0;
        ent.moveDur = 0;
    }
    ent.x = x;
    ent.y = y;
    ent.z = z;
}

function viewSize() {
    if (!canvas) return { w: 15, h: 11 };
    return { w: canvas.width / TS, h: canvas.height / TS };
}

function updateCamera() {
    const vis = self ? visualPos(self) : null;
    const vs = viewSize();
    if (vis) {
        camX = vis.x - (vs.w - 1) / 2;
        camY = vis.y - (vs.h - 1) / 2;
    } else if (viewport) {
        camX = viewport.originX;
        camY = viewport.originY;
    }
    const z = viewport ? viewport.z : (self ? self.z : 0);
    if (mapId && (self || viewport)) {
        visualLoader.ensure({
            mapId: mapId,
            z: z,
            camX: camX,
            camY: camY,
            viewW: vs.w,
            viewH: vs.h
        });
    }
}

function visualGenre() {
    const floor = visualLoader.floor;
    return floor && floor.genre ? floor.genre : 'rpg_fantasy';
}

function log(msg, cls) {
    if (!logEl) return;
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    logEl.appendChild(line);
    while (logEl.childNodes.length > 200) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
}

function fct(text) {
    const el = $('fct');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    if (fctTimer) clearTimeout(fctTimer);
    fctTimer = setTimeout(function () { el.hidden = true; }, 1800);
    log(text);
}

function send(opcode, payload) {
    if (!ws || ws.readyState !== 1) return 0;
    const seq = clientSeq;
    clientSeq += 1;
    ws.send(encodeFrame(opcode, seq, payload));
    return seq;
}

function cheb(ax, ay, az, bx, by, bz) {
    if ((az | 0) !== (bz | 0)) return Infinity;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function underfootTile() {
    if (!self || !viewport) return null;
    return Path.tileAt(viewport, self.x, self.y);
}

function setHud() {
    if (!self) return;
    const floor = viewport ? viewport.z : self.z;
    if (statusEl) {
        statusEl.textContent = self.name + ' L' + self.level + ' ' +
            self.hp + '/' + self.hpMax + ' hp  ' + self.mp + '/' + self.mpMax + ' mp';
    }
    const floorEl = $('live-floor');
    if (floorEl) floorEl.textContent = String(floor);
    const hpEl = $('live-hp');
    if (hpEl) hpEl.textContent = self.hp + '/' + self.hpMax;
    const mpEl = $('live-mp');
    if (mpEl) mpEl.textContent = self.mp + '/' + self.mpMax;
    const expEl = $('live-exp');
    if (expEl) expEl.textContent = String(self.experience || 0);
    const posEl = $('live-pos');
    if (posEl) posEl.textContent = self.x + ',' + self.y + ',' + self.z;
}

function isNpcEntity(p) {
    return !!(p && (p.isNpc || (p.flags & APPEAR_FLAG.NPC)));
}

function isCreatureEntity(p) {
    return !!(p && p.id >= CREATURE_MIN && !isNpcEntity(p));
}

function combatRoster() {
    if (!self) return [];
    const list = [];
    others.forEach(function (p) {
        if (!isCreatureEntity(p)) return;
        if ((p.z | 0) !== (self.z | 0)) return;
        const dist = cheb(self.x, self.y, self.z, p.x, p.y, p.z);
        if (dist > ENGAGE_RANGE && p.id !== targetId) return;
        const hpMax = p.hpMax || 1;
        list.push({
            id: p.id,
            name: p.name || ('#' + p.id),
            hp: p.hp | 0,
            hpMax: hpMax,
            hpPct: (p.hp | 0) / hpMax,
            dist: dist,
            seenAt: seenAt.get(p.id) || 0
        });
    });
    const fn = SORT_FNS[combatSort] || SORT_FNS.display_time_asc;
    list.sort(fn);
    return list;
}

function renderCombat() {
    const el = $('combatCreaturesList');
    if (!el) return;
    const list = combatRoster();
    const mobs = $('live-mobs');
    if (mobs) mobs.textContent = String(list.length);
    el.textContent = '';
    if (!list.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'No creatures in combat';
        el.appendChild(p);
        return;
    }
    list.forEach(function (row) {
        const d = document.createElement('div');
        d.className = 'entity-row' + (row.id === targetId ? ' is-target' : '');
        d.dataset.id = String(row.id);
        const name = document.createElement('div');
        name.textContent = row.name + '  ' + row.hp + '/' + row.hpMax;
        const bar = document.createElement('div');
        bar.className = 'entity-hp';
        const fill = document.createElement('span');
        fill.style.width = Math.max(0, Math.min(100, Math.round(row.hpPct * 100))) + '%';
        bar.appendChild(fill);
        d.appendChild(name);
        d.appendChild(bar);
        d.addEventListener('click', function (ev) {
            ev.preventDefault();
            send(C2S.SET_TARGET, u32buf(row.id));
            targetId = row.id;
            renderCombat();
        });
        d.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            send(C2S.SET_TARGET, u32buf(row.id));
            send(C2S.SET_AUTO_CHASE, Uint8Array.of(1));
            targetId = row.id;
            autoChase = true;
            const box = $('auto-chase');
            if (box) box.checked = true;
            renderCombat();
        });
        d.addEventListener('mouseenter', function () {
            hoveredEntityId = row.id;
            draw();
        });
        d.addEventListener('mouseleave', function () {
            if (hoveredEntityId === row.id) {
                hoveredEntityId = 0;
                draw();
            }
        });
        el.appendChild(d);
    });
}

function renderSkills() {
    const el = $('skillsPanelList');
    if (!el) return;
    el.textContent = '';
    if (!self) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'No character';
        el.appendChild(p);
        return;
    }
    SKILL_ROWS.forEach(function (row) {
        const d = document.createElement('div');
        d.className = 'skill-row';
        const label = document.createElement('span');
        label.textContent = row.label;
        const val = document.createElement('span');
        const n = skills && skills[row.key] != null ? skills[row.key] : '—';
        val.textContent = String(n);
        d.appendChild(label);
        d.appendChild(val);
        el.appendChild(d);
    });
}

function itemLabel(id) {
    return String(id || '').replace(/_/g, ' ');
}

function slotAt(view, index) {
    if (!view || !view.slots) return null;
    for (let i = 0; i < view.slots.length; i++) {
        if (view.slots[i].index === index) return view.slots[i];
    }
    return null;
}

function readBagView(r) {
    const containerId = r.str();
    const capacity = r.u8();
    const n = r.u8();
    const slots = [];
    for (let i = 0; i < n; i++) {
        slots.push({ index: r.u8(), id: r.str(), count: r.u16(), flags: r.u8() });
    }
    return { containerId: containerId, capacity: capacity, slots: slots };
}

function paintGrid(el, view, selectedIndex, kind) {
    if (!el) return;
    el.textContent = '';
    const cap = Math.max(4, (view && view.capacity) || BACKPACK_SLOTS);
    const rows = Math.ceil(cap / 4) * 4;
    for (let i = 0; i < rows; i++) {
        const slot = document.createElement('div');
        slot.className = 'backpack-slot';
        slot.dataset.slotIndex = String(i);
        const it = slotAt(view, i);
        if (it) {
            slot.className += ' is-filled';
            if (i === selectedIndex) slot.className += ' is-selected';
            slot.title = itemLabel(it.id);
            slot.textContent = itemLabel(it.id).slice(0, 6);
            if (it.flags & 1) slot.className += ' is-container';
            if (it.count > 1) {
                const c = document.createElement('span');
                c.className = 'inv-stack-count';
                c.textContent = String(it.count);
                slot.appendChild(c);
            }
        }
        slot.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (kind === 'bag') {
                selectedBag = it ? i : -1;
                renderBag();
            }
        });
        slot.addEventListener('dblclick', function (ev) {
            ev.preventDefault();
            if (!it || !view.containerId) return;
            send(C2S.USE_ITEM, encodeContainerSlot(view.containerId, i));
        });
        slot.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            if (!it) return;
            if (kind === 'bag') {
                selectedBag = i;
                renderBag();
            }
            showInvMenu(ev.clientX, ev.clientY, it, view.containerId, i);
        });
        el.appendChild(slot);
    }
}

function renderBag() {
    paintGrid($('backpackGrid'), bag, selectedBag, 'bag');
    const nested = $('openBagPanel');
    if (nested) nested.hidden = !openBag || !openBag.containerId;
    if (openBag && openBag.containerId) {
        const title = $('openBagTitle');
        if (title) title.textContent = 'Bag';
        paintGrid($('openBagGrid'), openBag, -1, 'nested');
    }
}

function renderEquipment() {
    const card = $('activeEquipmentCard');
    if (!card) return;
    const nodes = card.querySelectorAll('.slot-item');
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const key = el.getAttribute('data-slot');
        const it = equipment[key];
        const ph = el.querySelector('.slot-placeholder');
        let label = el.querySelector('.slot-label');
        if (it) {
            el.classList.add('is-filled');
            if (!label) {
                label = document.createElement('span');
                label.className = 'slot-label';
                el.appendChild(label);
            }
            label.textContent = itemLabel(it.id).slice(0, 6);
            if (ph) ph.hidden = true;
            el.title = itemLabel(it.id);
        } else {
            el.classList.remove('is-filled');
            if (label) label.textContent = '';
            if (ph) ph.hidden = false;
            el.title = el.getAttribute('title') || key;
        }
    }
    const capEl = $('activeEqCap');
    if (capEl) capEl.textContent = capVal != null ? String(capVal) : '—';
}

function renderDialog(text, replies) {
    const panel = $('npc-dialog');
    const body = $('dialog-body');
    if (!panel || !body) return;
    body.textContent = '';
    const t = document.createElement('div');
    t.textContent = text;
    body.appendChild(t);
    replies.forEach(function (label, index) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.onclick = function () {
            const p = new Uint8Array(5);
            new DataView(p.buffer).setUint32(0, talkNpc >>> 0, true);
            p[4] = index;
            send(C2S.TALK_REPLY, p);
        };
        body.appendChild(b);
    });
    placeFloat(panel, talkNpc);
}

function renderShop(currency, items) {
    const panel = $('npc-shop');
    const body = $('shop-body');
    if (!panel || !body) return;
    body.textContent = '';
    const cap = document.createElement('div');
    cap.textContent = 'pay with ' + currency;
    body.appendChild(cap);
    items.forEach(function (it) {
        if (it.buy > 0) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'Buy ' + itemLabel(it.itemId) + ' (' + it.buy + ')';
            b.onclick = function () { send(C2S.SHOP_BUY, encodeStrPayload(shopNpc, 1, it.itemId)); };
            body.appendChild(b);
        }
        if (it.sell > 0) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ghost';
            b.textContent = 'Sell ' + itemLabel(it.itemId) + ' (' + it.sell + ')';
            b.onclick = function () { send(C2S.SHOP_SELL, encodeStrPayload(shopNpc, 1, it.itemId)); };
            body.appendChild(b);
        }
    });
    placeFloat(panel, shopNpc);
}

function renderLoot(items) {
    const panel = $('loot-panel');
    const body = $('loot-body');
    if (!panel || !body) return;
    body.textContent = '';
    if (!items.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'empty';
        body.appendChild(p);
    } else {
        items.forEach(function (it, slot) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = it.count + '× ' + itemLabel(it.id);
            b.onclick = function () {
                const p = new Uint8Array(5);
                new DataView(p.buffer).setUint32(0, openCorpse >>> 0, true);
                p[4] = slot;
                send(C2S.LOOT_TAKE, p);
            };
            body.appendChild(b);
        });
    }
    const c = corpses.get(openCorpse);
    if (c) {
        const title = $('loot-title');
        if (title) title.textContent = c.name || 'Loot';
        placeFloatAtTile(panel, c.x, c.y);
    } else {
        placeFloat(panel, 0);
    }
}

function entityById(id) {
    if (self && self.id === id) return self;
    return others.get(id) || corpses.get(id) || null;
}

function placeFloat(el, entityId) {
    const ent = entityById(entityId);
    if (ent && ent.x != null) {
        placeFloatAtTile(el, ent.x, ent.y);
        return;
    }
    placeFloatAtTile(el, self ? self.x : 0, self ? self.y : 0);
}

function placeFloatAtTile(el, tx, ty) {
    const wrap = $('gameCanvasContainer');
    if (!el || !wrap || !viewport) {
        if (el) el.hidden = false;
        return;
    }
    if (el.parentNode !== wrap) wrap.appendChild(el);
    const scale = canvas.clientWidth / canvas.width;
    let left = ((tx - camX) * TS + TS + 4) * scale;
    let top = ((ty - camY) * TS) * scale;
    el.hidden = false;
    if (!el.offsetWidth) {
        requestAnimationFrame(function () {
            if (!el.offsetWidth) return;
            placeFloatAtTile(el, tx, ty);
        });
        return;
    }
    const maxL = Math.max(0, wrap.clientWidth - el.offsetWidth - 4);
    const maxT = Math.max(0, wrap.clientHeight - el.offsetHeight - 4);
    if (left > maxL) left = ((tx - camX) * TS - el.offsetWidth - 4) * scale;
    el.style.left = Math.max(0, Math.min(maxL, left)) + 'px';
    el.style.top = Math.max(0, Math.min(maxT, top)) + 'px';
}

function hideFloat(id) {
    const el = $(id);
    if (el) el.hidden = true;
}

function setDeath(on) {
    downed = !!on;
    const el = $('death-overlay');
    if (el) el.hidden = !on;
}

function drawPlacement(tileX, tileY, placement, genre, targetCtx, originX, originY, tw, th) {
    if (!placement || !placement.catalogId) return false;
    const opts = {
        genre: genre,
        kind: placement.kind || 'tiles',
        id: placement.catalogId,
        variant: placement.variant || Sprites.DEFAULT_TILE_VARIANT
    };
    Sprites.prefetch(opts);
    const img = Sprites.getReady(opts);
    if (!img) return false;
    const g = targetCtx || ctx;
    const ox = originX != null ? originX : camX;
    const oy = originY != null ? originY : camY;
    const cellW = tw || TS;
    const cellH = th || TS;
    const tilePx = (tileX - ox) * cellW;
    const tilePy = (tileY - oy) * cellH;
    const iw = img.naturalWidth || img.width || cellW;
    const ih = img.naturalHeight || img.height || cellH;
    const box = Draw.resolveTileDrawBox(tilePx, tilePy, cellW, cellH, iw, ih, placement.scale, placement.anchor);
    try {
        g.drawImage(img, box.dx, box.dy, box.dw, box.dh);
        return true;
    } catch (e) {
        return false;
    }
}

function entityImage(ent) {
    const genre = visualGenre();
    const ids = [];
    if (ent.look) ids.push(ent.look);
    if (ent.vocation && ids.indexOf(ent.vocation) < 0) ids.push(ent.vocation);
    if (!isCreatureEntity(ent) && !isNpcEntity(ent) && ids.indexOf('adventurer') < 0) ids.push('adventurer');
    for (let i = 0; i < ids.length; i++) {
        const opts = {
            genre: genre,
            kind: 'creatures',
            id: ids[i],
            variant: Sprites.DEFAULT_ENTITY_VARIANT
        };
        Sprites.prefetch(opts);
        const state = Sprites.loadState(opts);
        if (state === 'ready') return Sprites.getReady(opts);
        if (state === 'pending') return null;
    }
    return null;
}

function drawEntitySprite(ent, color) {
    const vis = visualPos(ent) || { x: ent.x, y: ent.y, z: ent.z };
    const tNowMs = nowMs();
    const tNowSec = tNowMs / 1000;

    // Step bob during tile slide (half-sine hop)
    const bobPy = SpritePres ? SpritePres.stepBobOffsetPx(ent, tNowMs, TS, 0.08) : 0;
    // Hit recoil nudge on damage
    const recoil = SpritePres ? SpritePres.getHitRecoilOffset(ent, tNowSec, TS, TS) : { x: 0, y: 0 };

    const tilePx = (vis.x - camX) * TS + recoil.x;
    const tilePy = (vis.y - camY) * TS + recoil.y + bobPy;
    const basePy = (vis.y - camY) * TS;

    const img = entityImage(ent);
    const flipH = ent.facing === -1 || ent.spriteFacing === -1 || ent.dir === 3;

    // Soft foot shadow grounded on floor basePy
    if (SpritePres) {
        SpritePres.drawEntityShadow(ctx, tilePx, basePy, TS, TS, 1, img, flipH, {
            combatTargetHighlight: !!(targetId && ent.id === targetId),
            hoverHighlight: !!(hoveredEntityId && ent.id === hoveredEntityId),
            now: tNowSec
        });
    }

    // Active combat target: pulsing red circular reticle under feet
    if (targetId && ent.id === targetId && Hud) {
        Hud.drawTargetReticle(ctx, tilePx, basePy, TS, TS, tNowSec);
    }

    let box = null;
    if (img) {
        const iw = img.naturalWidth || img.width || TS;
        const ih = img.naturalHeight || img.height || TS;
        box = Draw.resolveTileDrawBox(tilePx, tilePy, TS, TS, iw, ih, 1, 'bottom_center');

        // Rarity aura outline under sprite for rare+ mobs
        const rarity = SpritePres ? SpritePres.resolveEntityRarityTier(ent) : null;
        if (rarity && SpritePres) {
            SpritePres.drawEntityRarityAura(ctx, img, box, flipH, rarity, tNowSec);
        }

        if (flipH) {
            const cx = box.dx + box.dw / 2;
            ctx.save();
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
            try {
                ctx.drawImage(img, box.dx, box.dy, box.dw, box.dh);
            } catch (e) { /* placeholder */ }
            ctx.restore();
        } else {
            try {
                ctx.drawImage(img, box.dx, box.dy, box.dw, box.dh);
            } catch (e) { /* placeholder */ }
        }

        // White hit flash overlay on damage
        const flash = SpritePres ? SpritePres.hitFlashStrength(ent, tNowSec) : 0;
        if (flash > 0 && SpritePres) {
            SpritePres.drawSpriteHitFlash(ctx, box, flash);
        }
    } else {
        const sx = tilePx + TS / 2;
        const sy = tilePy + TS / 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    // Hover highlight: glowing gold outline
    if (hoveredEntityId && ent.id === hoveredEntityId && Hud) {
        const hBox = box || { dx: tilePx + 2, dy: tilePy + 2, dw: TS - 4, dh: TS - 4 };
        Hud.drawHoverHighlight(ctx, hBox);
    }
}

function draw() {
    if (!ctx || !canvas) return;
    updateCamera();
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!viewport && !self) return;
    const z = viewport ? viewport.z : self.z;
    const vs = viewSize();
    const floor = visualLoader.floor;
    const visualOk = floor && floor.present && (floor.z | 0) === (z | 0);
    if (visualOk) {
        let cached = false;
        if (tilemapCache) {
            cached = tilemapCache.render(ctx, floor, camX, camY, vs, {
                tw: TS,
                th: TS,
                sprites: Sprites,
                drawPlacement: drawPlacement
            });
        }
        if (!cached) {
            const x0 = Math.floor(camX) - 1;
            const y0 = Math.floor(camY) - 1;
            const x1 = Math.ceil(camX + vs.w) + 1;
            const y1 = Math.ceil(camY + vs.h) + 1;
            const genre = floor.genre;
            for (let li = 0; li < Visual.TERRAIN.length; li++) {
                const layerId = Visual.TERRAIN[li];
                for (let ty = y0; ty <= y1; ty++) {
                    for (let tx = x0; tx <= x1; tx++) {
                        const pIdx = Visual.paletteAt(floor, layerId, tx, ty);
                        if (pIdx <= 0) continue;
                        const placement = floor.palette[pIdx];
                        drawPlacement(tx, ty, placement, genre);
                    }
                }
            }
        }
    } else if (viewport) {
        for (let y = 0; y < viewport.height; y++) {
            for (let x = 0; x < viewport.width; x++) {
                const t = viewport.tiles[y * viewport.width + x];
                const px = (viewport.originX + x - camX) * TS;
                const py = (viewport.originY + y - camY) * TS;
                ctx.fillStyle = tileColor(t);
                ctx.fillRect(px, py, TS - 1, TS - 1);
            }
        }
    }
    const drawList = [];
    if (visualOk) {
        const props = Visual.collectWorldProps(floor, {
            x0: Math.floor(camX) - 2,
            y0: Math.floor(camY) - 2,
            x1: Math.ceil(camX + vs.w) + 2,
            y1: Math.ceil(camY + vs.h) + 2
        });
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            drawList.push({
                sortY: p.sortY,
                subOrder: p.subOrder != null ? p.subOrder : Draw.DRAW_SUB_PROP,
                stableKey: p.stableKey,
                draw: function () {
                    drawPlacement(p.tileX, p.tileY, p, floor.genre);
                }
            });
        }
    }
    if (Ground) {
        Ground.render(ctx, {
            corpses: corpses,
            worldPins: worldPins,
            groundItems: groundItems,
            fields: fields,
            camX: camX,
            camY: camY,
            floorZ: z,
            tw: TS,
            th: TS,
            nowSec: nowMs() / 1000,
            genre: visualGenre(),
            sprites: Sprites,
            draw: Draw
        });
    } else {
        worldPins.forEach(function (pin) {
            if ((pin.z | 0) !== (z | 0)) return;
            const sx = (pin.x - camX) * TS + 6;
            const sy = (pin.y - camY) * TS + 6;
            ctx.fillStyle = '#8fde5d';
            ctx.fillRect(sx, sy, TS - 12, TS - 12);
        });
        corpses.forEach(function (c) {
            if ((c.z | 0) !== (z | 0)) return;
            const sx = (c.x - camX) * TS + 4;
            const sy = (c.y - camY) * TS + 4;
            ctx.fillStyle = '#6b4423';
            ctx.fillRect(sx, sy, TS - 8, TS - 8);
        });
    }
    function pushEntity(ent, color) {
        if (!ent || (ent.z | 0) !== (z | 0)) return;
        const vis = visualPos(ent) || ent;
        drawList.push({
            sortY: Number(vis.y) || 0,
            subOrder: Draw.DRAW_SUB_ENTITY,
            stableKey: 'ent:' + ent.id,
            draw: function () { drawEntitySprite(ent, color); }
        });
    }
    if (self) {
        if (targetId) {
            const tgt = others.get(targetId);
            if (tgt) faceTowardTarget(self, tgt);
        }
        pushEntity(self, '#fff');
    }
    others.forEach(function (p) {
        let color = '#7ab8ff';
        if (isNpcEntity(p)) color = '#d4b84a';
        else if (isCreatureEntity(p)) {
            color = p.id === targetId ? '#ff6a4a' : '#e08080';
            if (p.id === targetId && self) faceTowardTarget(p, self);
        }
        pushEntity(p, color);
    });
    Draw.sortDrawables(drawList);
    for (let i = 0; i < drawList.length; i++) {
        try { drawList[i].draw(); } catch (e) { /* keep painting */ }
    }

    // Overhead HUD Pass (HP/Mana/Shield bars, centered nameplates with 2px stroke)
    if (Hud) {
        function renderEntityHud(ent) {
            if (!ent || (ent.z | 0) !== (z | 0)) return;
            const vis = visualPos(ent) || ent;
            const tilePx = (vis.x - camX) * TS;
            const tilePy = (vis.y - camY) * TS;
            const img = entityImage(ent);
            let stackTopY = tilePy;
            if (img) {
                const iw = img.naturalWidth || img.width || TS;
                const ih = img.naturalHeight || img.height || TS;
                const box = Draw.resolveTileDrawBox(tilePx, tilePy, TS, TS, iw, ih, 1, 'bottom_center');
                stackTopY = box.dy;
            }
            const showMana = !!(self && ent.id === self.id);
            Hud.drawNameplate(ctx, ent, tilePx, stackTopY, TS, showMana);
        }
        if (self) renderEntityHud(self);
        others.forEach(function (p) {
            renderEntityHud(p);
        });
    }

    // Ephemeral Combat FX & FCT Pass (Canvas-based floating text, projectiles, and slashes)
    if (CombatFx) {
        CombatFx.render(ctx, {
            camX: camX,
            camY: camY,
            floorZ: z,
            tw: TS,
            th: TS,
            nowSec: nowMs() / 1000,
            sprites: Sprites,
            draw: Draw
        });
    }
}

function isWalkable(x, y) {
    if (!viewport || !self) return false;
    const t = Path.tileAt(viewport, x, y);
    if (t == null || !Path.walkTile(t)) return false;
    let blocked = false;
    others.forEach(function (p) {
        if (blocked) return;
        if ((p.x | 0) === x && (p.y | 0) === y && (p.z | 0) === self.z) {
            if (isNpcEntity(p) || isCreatureEntity(p)) blocked = true;
        }
    });
    if (!blocked) {
        const f = fields.get(x + ',' + y + ',' + self.z);
        if (f && (f.kind === 'barrier' || f.kind === 'vine' || (f.flags & 1))) blocked = true;
    }
    if (!blocked) {
        worldPins.forEach(function (pin) {
            if (blocked) return;
            if ((pin.x | 0) === x && (pin.y | 0) === y && (pin.z | 0) === self.z) {
                if (pin.kind === 'chest' || (pin.kind === 'door' && !(pin.flags & 1))) {
                    blocked = true;
                }
            }
        });
    }
    return !blocked;
}

function stopWalk(keepPending) {
    walkDest = null;
    walkBusy = false;
    if (!keepPending) pendingAfterWalk = null;
    if (walkRetry) {
        clearTimeout(walkRetry);
        walkRetry = 0;
    }
}

function cancelClickWalk() {
    walkDest = null;
    pendingAfterWalk = null;
    if (walkRetry) {
        clearTimeout(walkRetry);
        walkRetry = 0;
    }
}

function sendKeyboardStep(dir) {
    if (!self || downed || dir == null) return false;
    if (walkBusy) return false;
    walkBusy = true;
    send(C2S.MOVE_STEP, Uint8Array.of(dir));
    return true;
}

function pumpKeyboardWalk(now) {
    if (!self || downed) return;
    const dir = keyWalk.readyDir(now, stepMs);
    if (dir == null) return;
    if (sendKeyboardStep(dir)) keyWalk.markEmitted(now);
}

function runPending() {
    const p = pendingAfterWalk;
    pendingAfterWalk = null;
    if (!p) return;
    if (p.type === 'TALK') send(C2S.TALK, u32buf(p.id));
    else if (p.type === 'OPEN_CORPSE') send(C2S.OPEN_CORPSE, u32buf(p.id));
    else if (p.type === 'USE' || p.type === 'OPEN_CONTAINER') {
        send(C2S.USE, encodeTileUse(p.x, p.y, p.z));
    }
}

function sendNextStep() {
    if (!self || !walkDest) return;
    if (self.x === walkDest.x && self.y === walkDest.y) {
        stopWalk(true);
        runPending();
        return;
    }
    const path = Path.findOrthogonalPath(self, walkDest, isWalkable);
    if (!path || !path.length) {
        stopWalk();
        fct('There is no way.');
        return;
    }
    walkBusy = true;
    send(C2S.MOVE_STEP, Uint8Array.of(path[0]));
}

function startWalk(dest, then) {
    if (!self || !dest) return;
    if (keyWalk.isHeld()) return;
    pendingAfterWalk = then || null;
    if ((dest.x | 0) === self.x && (dest.y | 0) === self.y) {
        stopWalk(true);
        runPending();
        return;
    }
    if (!isWalkable(dest.x, dest.y)) {
        pendingAfterWalk = null;
        fct('There is no way.');
        return;
    }
    walkDest = { x: dest.x | 0, y: dest.y | 0 };
    sendNextStep();
}

function talkTo(id) {
    const npc = others.get(id);
    if (!npc) return;
    if (cheb(self.x, self.y, self.z, npc.x, npc.y, npc.z) <= Mouse.TALK_NPC_RANGE) {
        send(C2S.TALK, u32buf(id));
        return;
    }
    const dest = Path.nearestApproach(self, npc, Mouse.TALK_NPC_RANGE, isWalkable);
    if (!dest) {
        fct('There is no way.');
        return;
    }
    startWalk(dest, { type: 'TALK', id: id });
}

function openCorpseAt(id) {
    const c = corpses.get(id);
    if (!c) return;
    if (cheb(self.x, self.y, self.z, c.x, c.y, c.z) <= Mouse.OPEN_CORPSE_RANGE) {
        send(C2S.OPEN_CORPSE, u32buf(id));
        return;
    }
    const dest = Path.nearestApproach(self, c, Mouse.OPEN_CORPSE_RANGE, isWalkable);
    if (!dest) {
        fct('There is no way.');
        return;
    }
    startWalk(dest, { type: 'OPEN_CORPSE', id: id });
}

function usePinAt(tile, type) {
    if (!self || !tile) return;
    const kind = type || 'USE';
    if (cheb(self.x, self.y, self.z, tile.x, tile.y, tile.z) <= Mouse.WORLD_USE_RANGE) {
        send(C2S.USE, encodeTileUse(tile.x, tile.y, tile.z));
        return;
    }
    const dest = Path.nearestApproach(self, tile, Mouse.WORLD_USE_RANGE, isWalkable);
    if (!dest) {
        fct('There is no way.');
        return;
    }
    startWalk(dest, { type: kind, x: tile.x, y: tile.y, z: tile.z });
}

function applyIntents(intents, clientX, clientY) {
    if (!intents || !intents.length) return;
    for (let i = 0; i < intents.length; i++) {
        let intent = intents[i];
        if (!intent) continue;
        const mapped = Mouse.mapStubQuicklootToOpen(intent);
        if (mapped) intent = mapped;
        switch (intent.type) {
            case 'LOOK':
                fct(intent.text || 'Nothing here.');
                break;
            case 'SET_TARGET':
                send(C2S.SET_TARGET, u32buf(intent.targetId));
                targetId = intent.targetId;
                renderCombat();
                break;
            case 'START_AUTOWALK':
                startWalk(intent.dest, null);
                break;
            case 'STOP_AUTOWALK':
                stopWalk();
                break;
            case 'TALK_NPC':
                talkTo(intent.creatureId);
                break;
            case 'OPEN_CORPSE':
                if (intent.corpseId != null) openCorpseAt(intent.corpseId);
                break;
            case 'USE':
            case 'OPEN_CONTAINER':
                if (intent.stub) {
                    fct('Not available yet.');
                    break;
                }
                if (intent.tile) usePinAt(intent.tile, intent.type);
                break;
            case 'USE_ITEM_WITH':
                if (intent.tile && intent.itemId) {
                    send(C2S.USE_ITEM_WITH, encodeUseItemWith(
                        intent.tile.x, intent.tile.y, intent.tile.z, intent.itemId
                    ));
                }
                break;
            case 'USE_STAIR':
                stopWalk();
                send(C2S.USE_STAIR, new Uint8Array(0));
                break;
            case 'OPEN_CONTEXT_MENU':
                showCanvasMenu(intent.hit, clientX, clientY);
                break;
            case 'QUICKLOOT':
                fct('Not available yet.');
                break;
            default:
                fct('Not available yet.');
        }
    }
}

function hideCtx() {
    const el = $('ctx-menu');
    if (el) el.hidden = true;
}

function showCanvasMenu(hit, clientX, clientY) {
    const el = $('ctx-menu');
    const wrap = $('gameCanvasContainer');
    if (!el || !wrap) return;
    const entries = Mouse.buildCanvasContextMenuEntries(hit);
    el.textContent = '';
    entries.forEach(function (entry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = entry.label;
        b.onclick = function () {
            hideCtx();
            if (entry.action === 'LOOK') applyIntents([Mouse.buildLookIntent(hit)]);
            else if (entry.action === 'ATTACK' && hit.creature) {
                applyIntents([{ type: 'SET_TARGET', targetId: hit.creature.id, creature: hit.creature }]);
            } else if (entry.action === 'TALK_NPC' && hit.creature) {
                applyIntents([{ type: 'TALK_NPC', creatureId: hit.creature.id }]);
            } else if (entry.action === 'OPEN_CORPSE') {
                applyIntents([{ type: 'OPEN_CORPSE', corpseId: hit.corpseId }]);
            } else if (entry.action === 'USE' || entry.action === 'OPEN_CONTAINER') {
                applyIntents([{
                    type: entry.action,
                    tile: { x: hit.x, y: hit.y, z: hit.z },
                    worldPin: hit.worldPin
                }]);
            } else if (entry.action === 'USE_STAIR') {
                applyIntents([{ type: 'USE_STAIR' }]);
            } else if (entry.action === 'WALK') {
                applyIntents([{ type: 'START_AUTOWALK', dest: { x: hit.x, y: hit.y, z: hit.z } }]);
            }
        };
        el.appendChild(b);
    });
    const rect = wrap.getBoundingClientRect();
    el.hidden = false;
    el.style.left = Math.max(0, clientX - rect.left) + 'px';
    el.style.top = Math.max(0, clientY - rect.top) + 'px';
}

function showInvMenu(clientX, clientY, item, containerId, index) {
    const el = $('ctx-menu');
    const wrap = $('gameCanvasContainer');
    if (!el || !wrap) return;
    el.textContent = '';
    const rows = [
        { label: 'Look', fn: function () { fct(itemLabel(item.id)); } },
        {
            label: 'Use',
            fn: function () {
                if (containerId != null) send(C2S.USE_ITEM, encodeContainerSlot(containerId, index));
            }
        },
        {
            label: 'Equip',
            fn: function () {
                if (containerId != null) send(C2S.EQUIP, encodeEquip(containerId, index, ''));
            }
        }
    ];
    if (item && item.flags & 1) {
        rows.push({
            label: 'Open',
            fn: function () {
                if (containerId != null) send(C2S.OPEN_BAG, encodeContainerSlot(containerId, index));
            }
        });
    }
    if (item && (item.id === 'rope' || item.id === 'shovel'
        || /(^|_)rope(_|$)/.test(item.id) || /(^|_)shovel(_|$)/.test(item.id))) {
        rows.push({
            label: 'Use with',
            fn: function () {
                pendingUseWith = item.id;
                fct('Use ' + itemLabel(item.id) + ' with…');
            }
        });
    }
    rows.forEach(function (entry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = entry.label;
        b.onclick = function () { hideCtx(); entry.fn(); };
        el.appendChild(b);
    });
    const rect = wrap.getBoundingClientRect();
    el.hidden = false;
    el.style.left = Math.max(0, clientX - rect.left) + 'px';
    el.style.top = Math.max(0, clientY - rect.top) + 'px';
}

function canvasTile(ev) {
    if (!viewport || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tx = Math.floor(camX + ((ev.clientX - rect.left) * scaleX) / TS);
    const ty = Math.floor(camY + ((ev.clientY - rect.top) * scaleY) / TS);
    return { x: tx, y: ty, z: self ? self.z : viewport.z };
}

function hitFromTile(tile) {
    if (!tile) return null;
    const t = viewport ? Path.tileAt(viewport, tile.x, tile.y) : null;
    return Mouse.resolveCanvasHit({
        tile: tile,
        player: self,
        others: Array.from(others.values()),
        corpses: Array.from(corpses.values()),
        worldPins: Array.from(worldPins.values()),
        fields: Array.from(fields.values()),
        groundItems: Array.from(groundItems.values()),
        tileId: t,
        walkable: t != null && isWalkable(tile.x, tile.y)
    });
}

function getEntityAtPixel(px, py, z) {
    let best = null;
    let bestY = -Infinity;
    function test(ent) {
        if (!ent || (ent.z | 0) !== (z | 0)) return;
        const vis = visualPos(ent) || ent;
        const tilePx = (vis.x - camX) * TS;
        const tilePy = (vis.y - camY) * TS;
        const img = entityImage(ent);
        let minX, minY, maxX, maxY;
        if (img) {
            const iw = img.naturalWidth || img.width || TS;
            const ih = img.naturalHeight || img.height || TS;
            const box = Draw.resolveTileDrawBox(tilePx, tilePy, TS, TS, iw, ih, 1, 'bottom_center');
            minX = box.dx;
            minY = box.dy;
            maxX = box.dx + box.dw;
            maxY = box.dy + box.dh;
        } else {
            minX = tilePx;
            minY = tilePy;
            maxX = tilePx + TS;
            maxY = tilePy + TS;
        }
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
            const y = Number(vis.y) || 0;
            if (y >= bestY) {
                best = ent;
                bestY = y;
            }
        }
    }
    if (self) test(self);
    others.forEach(test);
    return best;
}

function onCanvasPointerMove(ev) {
    if (!canvas || (!viewport && !self)) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    const z = viewport ? viewport.z : (self ? self.z : 0);
    const ent = getEntityAtPixel(px, py, z);
    const newId = ent ? ent.id : 0;
    if (newId !== hoveredEntityId) {
        hoveredEntityId = newId;
        draw();
    }
}

function onCanvasPointerLeave() {
    if (hoveredEntityId !== 0) {
        hoveredEntityId = 0;
        draw();
    }
}

function onCanvasPointer(ev) {
    if (!self || !viewport || downed) return;
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault();
    const button = ev.button === 2 ? 'right' : 'left';
    if (button === 'left') buttonsDown.left = true;
    if (button === 'right') buttonsDown.right = true;
    if (cancelNext) {
        cancelNext = false;
        return;
    }
    hideCtx();
    const tile = canvasTile(ev);
    if (pendingUseWith && tile && button === 'left') {
        const itemId = pendingUseWith;
        pendingUseWith = null;
        send(C2S.USE_ITEM_WITH, encodeUseItemWith(tile.x, tile.y, tile.z, itemId));
        return;
    }
    const hit = hitFromTile(tile);
    if (Mouse.isClassicLookChord({
        mode: mouse.mouseControlMode,
        button: button,
        leftPressed: buttonsDown.left,
        rightPressed: buttonsDown.right
    })) {
        cancelNext = true;
        applyIntents([Mouse.buildLookIntent(hit)]);
        return;
    }
    const intents = Mouse.processMouseAction({
        button: button,
        mode: mouse.mouseControlMode,
        lootMode: mouse.lootControlMode,
        talkOnRightClick: mouse.talkOnRightClick,
        modifiers: {
            shift: ev.shiftKey,
            ctrl: ev.ctrlKey,
            alt: ev.altKey,
            meta: ev.metaKey
        },
        hit: hit,
        playerControlMode: 'manual',
        playerAlive: !downed,
        playerTile: self
    });
    applyIntents(intents, ev.clientX, ev.clientY);
}

function onFrame(bytes, tokenHex) {
    const r = new Reader(bytes);
    const opcode = r.u16();
    r.u32();
    if (opcode === S2C.HELLO) {
        const ver = r.u16();
        ups = r.u8();
        lastTick = r.u32();
        stepMs = Math.max(50, Math.round((1000 / Math.max(1, ups)) * 4));
        log('HELLO v' + ver + ' ups=' + ups + ' tick=' + lastTick);
        const upsEl = $('stat-ups');
        if (upsEl) upsEl.textContent = String(ups);
        send(C2S.ENTER, hexToBytes(tokenHex));
        return;
    }
    if (opcode === S2C.ENTER_WORLD) {
        self = {
            id: r.u32(), name: r.str(), vocation: r.str(), level: r.u16(),
            experience: r.u32(), hp: r.u16(), hpMax: r.u16(), mp: r.u16(), mpMax: r.u16(),
            x: r.i16(), y: r.i16(), z: r.i8(), townId: r.u16()
        };
        self.look = self.vocation || 'adventurer';
        self.fromX = self.x;
        self.fromY = self.y;
        self.facing = 1;
        self.moveAt = 0;
        self.moveDur = 0;
        const originX = r.i16(), originY = r.i16(), z = r.i8(), w = r.u8(), h = r.u8();
        const tiles = [];
        for (let i = 0; i < w * h; i++) tiles.push(r.u16());
        viewport = { originX: originX, originY: originY, z: z, width: w, height: h, tiles: tiles };
        downed = false;
        setDeath(false);
        log('in world as ' + self.name, 'ok');
        setHud();
        renderSkills();
        draw();
        return;
    }
    if (opcode === S2C.VIEWPORT) {
        const originX = r.i16(), originY = r.i16(), z = r.i8(), w = r.u8(), h = r.u8();
        const tiles = [];
        for (let i = 0; i < w * h; i++) tiles.push(r.u16());
        viewport = { originX: originX, originY: originY, z: z, width: w, height: h, tiles: tiles };
        setHud();
        draw();
        return;
    }
    if (opcode === S2C.MOVE) {
        const id = r.u32(), x = r.i16(), y = r.i16(), z = r.i8(), dir = r.u8();
        if (self && id === self.id) {
            beginSlide(self, x, y, z);
            self.dir = dir;
            if (dir === 3) self.facing = -1;
            else if (dir === 1) self.facing = 1;
            setHud();
            walkBusy = false;
            if (keyWalk.isHeld()) pumpKeyboardWalk(nowMs());
            else if (walkDest) sendNextStep();
        } else {
            const p = others.get(id);
            if (p) {
                beginSlide(p, x, y, z);
                p.dir = dir;
                if (dir === 3) p.facing = -1;
                else if (dir === 1) p.facing = 1;
            }
        }
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.PONG) {
        const echo = r.u32();
        r.u32();
        lastTick = r.u32();
        const rtt = Math.max(0, Date.now() - echo);
        const rttEl = $('stat-rtt');
        if (rttEl) rttEl.textContent = rtt + 'ms';
        const tickEl = $('stat-tick');
        if (tickEl) tickEl.textContent = String(lastTick);
        return;
    }
    if (opcode === S2C.REJECT) {
        const seq = r.u32();
        const reason = r.u8();
        log('rejected seq=' + seq + ' reason=' + reason, 'err');
        if (reason === REASON.BUSY) {
            walkBusy = false;
            if (keyWalk.isHeld()) pumpKeyboardWalk(nowMs());
            else if (walkDest) {
                if (walkRetry) clearTimeout(walkRetry);
                walkRetry = setTimeout(function () {
                    walkRetry = 0;
                    sendNextStep();
                }, 200);
            }
        } else if (reason === REASON.BLOCKED && walkDest) {
            stopWalk();
        }
        return;
    }
    if (opcode === S2C.KICK) {
        log('kicked reason=' + r.u8(), 'err');
        return;
    }
    if (opcode === S2C.APPEAR) {
        const p = {
            id: r.u32(), name: r.str(), x: r.i16(), y: r.i16(), z: r.i8(),
            hp: r.u16(), hpMax: r.u16(), flags: r.u8()
        };
        p.look = r.o < r.b.length ? r.str() : '';
        p.fromX = p.x;
        p.fromY = p.y;
        p.facing = 1;
        p.moveAt = 0;
        p.moveDur = 0;
        others.set(p.id, p);
        if (!seenAt.has(p.id)) seenAt.set(p.id, Date.now());
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.DISAPPEAR) {
        const id = r.u32();
        others.delete(id);
        if (targetId === id) targetId = 0;
        if (hoveredEntityId === id) hoveredEntityId = 0;
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.STATS) {
        const id = r.u32(), hp = r.u16(), hpMax = r.u16(), mp = r.u16(), mpMax = r.u16();
        if (self && id === self.id) {
            self.hp = hp; self.hpMax = hpMax; self.mp = mp; self.mpMax = mpMax;
            if (hp > 0 && downed) setDeath(false);
            setHud();
        } else {
            const p = others.get(id);
            if (p) { p.hp = hp; p.hpMax = hpMax; }
        }
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.SWING) {
        const src = r.u32(), dst = r.u32(), amount = r.u16(), flags = r.u8();
        log('swing ' + src + '→' + dst + ' ' + amount + (flags & 1 ? ' miss' : '') + (flags & 2 ? ' death' : ''));
        const attacker = entityById(src);
        const defender = entityById(dst);
        const isMiss = !!(flags & 1);
        const isDeath = !!(flags & 2);
        const isCrit = !!(flags & 4);
        const tNow = nowMs() / 1000;

        if (defender) {
            if (isMiss) {
                if (CombatFx) {
                    CombatFx.pushFct({
                        x: defender.x,
                        y: defender.y,
                        z: defender.z,
                        text: 'miss',
                        color: CombatFx.ELEMENT_COLORS.miss
                    });
                }
            } else {
                if (SpritePres) {
                    SpritePres.beginHitFeedback(defender, attacker, tNow);
                }
                if (CombatFx) {
                    const text = isCrit ? (amount + '!') : String(amount);
                    const color = isCrit ? CombatFx.ELEMENT_COLORS.crit : CombatFx.ELEMENT_COLORS.physical;
                    CombatFx.pushFct({
                        x: defender.x,
                        y: defender.y,
                        z: defender.z,
                        text: text,
                        color: color,
                        isCrit: isCrit
                    });
                }
            }
            if (isDeath && CombatFx) {
                CombatFx.pushDeath({
                    x: defender.x,
                    y: defender.y,
                    z: defender.z,
                    color: '#ff4444'
                });
            }
        }
        if (attacker && defender && CombatFx) {
            const isRanged = attacker.weaponType === 'distance' || attacker.weaponType === 'ranged';
            if (isRanged) {
                CombatFx.pushProjectile({
                    x0: attacker.x,
                    y0: attacker.y,
                    x1: defender.x,
                    y1: defender.y,
                    z: attacker.z,
                    color: '#ffffff'
                });
            } else {
                CombatFx.pushMelee({
                    x0: attacker.x,
                    y0: attacker.y,
                    x1: defender.x,
                    y1: defender.y,
                    z: attacker.z,
                    color: isCrit ? CombatFx.ELEMENT_COLORS.crit : '#ffffff'
                });
            }
        }
        draw();
        return;
    }
    if (opcode === S2C.DEATH) {
        const id = r.u32(), killer = r.u32();
        log('death ' + id + ' by ' + killer, id === (self && self.id) ? 'err' : 'ok');
        const victim = entityById(id);
        if (victim && CombatFx) {
            CombatFx.pushDeath({ x: victim.x, y: victim.y, z: victim.z, color: '#ff4444' });
        }
        if (self && id === self.id) {
            setDeath(true);
            keyWalk.reset();
            stopWalk();
        }
        others.delete(id);
        if (targetId === id) targetId = 0;
        if (hoveredEntityId === id) hoveredEntityId = 0;
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.CORPSE) {
        const c = { id: r.u32(), x: r.i16(), y: r.i16(), z: r.i8(), name: r.str() };
        corpses.set(c.id, c);
        draw();
        return;
    }
    if (opcode === S2C.CORPSE_GONE) {
        const id = r.u32();
        corpses.delete(id);
        if (openCorpse === id) {
            openCorpse = 0;
            hideFloat('loot-panel');
        }
        draw();
        return;
    }
    if (opcode === S2C.WORLD_PIN) {
        const pin = {
            id: r.u32(),
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            kind: r.str(),
            catalogId: r.str(),
            flags: 0
        };
        if (r.o < r.b.length) pin.flags = r.u8();
        worldPins.set(pin.id, pin);
        draw();
        return;
    }
    if (opcode === S2C.WORLD_PIN_GONE) {
        const id = r.u32();
        worldPins.delete(id);
        if (openCorpse === id) {
            openCorpse = 0;
            hideFloat('loot-panel');
        }
        draw();
        return;
    }
    if (opcode === S2C.CONTAINER) {
        const id = r.u32(), n = r.u8();
        const items = [];
        for (let i = 0; i < n; i++) items.push({ id: r.str(), count: r.u16() });
        openCorpse = id;
        const targetContainer = corpses.get(id) || worldPins.get(id);
        if (targetContainer) targetContainer.items = items;
        renderLoot(items);
        draw();
        return;
    }
    if (opcode === S2C.ITEM_GAIN) {
        const id = r.str(), count = r.u16();
        log('gain ' + count + '× ' + id, 'ok');
        return;
    }
    if (opcode === S2C.EXP) {
        const total = r.u32(), gained = r.u32();
        if (self) self.experience = total;
        if (r.o + 2 <= r.b.length) {
            const level = r.u16();
            if (self) self.level = level;
        }
        log('exp +' + gained + ' (' + total + ')', 'ok');
        setHud();
        if (self && gained > 0 && CombatFx) {
            CombatFx.pushFct({
                x: self.x,
                y: self.y,
                z: self.z,
                text: '+' + gained + ' exp',
                color: CombatFx.ELEMENT_COLORS.exp
            });
            draw();
        }
        return;
    }
    if (opcode === S2C.CAST) {
        const sourceId = r.u32(), spellId = r.str(), targetId = r.u32();
        const cx = r.i16(), cy = r.i16(), cz = r.i8(), flags = (r.o < r.b.length ? r.u8() : 0);
        const caster = entityById(sourceId);
        const tgt = entityById(targetId);
        if (CombatFx) {
            const color = CombatFx.elementColorForSpell(spellId);
            if (caster && tgt && sourceId !== targetId) {
                CombatFx.pushProjectile({
                    x0: caster.x,
                    y0: caster.y,
                    x1: tgt.x,
                    y1: tgt.y,
                    z: cz,
                    color: color
                });
            } else {
                CombatFx.pushAoe({
                    x: cx,
                    y: cy,
                    z: cz,
                    radius: 1,
                    color: color
                });
            }
        }
        draw();
        return;
    }
    if (opcode === S2C.INVENTORY) {
        bag = readBagView(r);
        selectedBag = -1;
        renderBag();
        return;
    }
    if (opcode === S2C.EQUIPMENT) {
        capVal = r.u16();
        capMax = r.u16();
        const n = r.u8();
        equipment = {};
        for (let i = 0; i < n; i++) {
            equipment[r.str()] = { id: r.str(), count: r.u16() };
        }
        renderEquipment();
        return;
    }
    if (opcode === S2C.BAG) {
        const view = readBagView(r);
        openBag = view.containerId ? view : null;
        renderBag();
        return;
    }
    if (opcode === S2C.SKILLS) {
        skills = {};
        for (let i = 0; i < SKILL_ORDER.length; i++) skills[SKILL_ORDER[i]] = r.u16();
        renderSkills();
        return;
    }
    if (opcode === S2C.SAY) {
        fct(r.str());
        return;
    }
    if (opcode === S2C.DIALOG) {
        talkNpc = r.u32();
        r.str();
        const text = r.str();
        const n = r.u8();
        const replies = [];
        for (let i = 0; i < n; i++) replies.push(r.str());
        renderDialog(text, replies);
        return;
    }
    if (opcode === S2C.DIALOG_CLOSE) {
        r.u32();
        talkNpc = 0;
        hideFloat('npc-dialog');
        hideFloat('npc-shop');
        return;
    }
    if (opcode === S2C.SHOP) {
        shopNpc = r.u32();
        const currency = r.str();
        const n = r.u8();
        const items = [];
        for (let i = 0; i < n; i++) items.push({ itemId: r.str(), buy: r.u16(), sell: r.u16() });
        renderShop(currency, items);
        return;
    }
    if (opcode === S2C.FIELD) {
        const f = {
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            kind: r.str(),
            flags: r.o < r.b.length ? r.u8() : 0,
            createdAt: nowMs()
        };
        fields.set(f.x + ',' + f.y + ',' + f.z, f);
        draw();
        return;
    }
    if (opcode === S2C.FIELD_GONE) {
        const x = r.i16();
        const y = r.i16();
        const z = r.i8();
        fields.delete(x + ',' + y + ',' + z);
        draw();
        return;
    }
}

function leaveWorld() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = 0;
    }
    if (ws && ws.readyState === 1) send(C2S.LOGOUT);
    setTimeout(function () { location.href = (window.__accountUrl || '/account'); }, 200);
}

function connect(cfg, tokenHex) {
    clientSeq = 1;
    others = new Map();
    corpses = new Map();
    worldPins = new Map();
    groundItems = new Map();
    fields = new Map();
    pendingUseWith = null;
    seenAt = new Map();
    bag = [];
    skills = null;
    talkNpc = 0;
    shopNpc = 0;
    openCorpse = 0;
    targetId = 0;
    self = null;
    viewport = null;
    visualLoader.reset();
    if (tilemapCache) tilemapCache.invalidate();
    if (CombatFx) CombatFx.clear();
    keyWalk.reset();
    stopWalk();
    setDeath(false);
    ws = new WebSocket(cfg.wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = function (ev) {
        onFrame(new Uint8Array(ev.data), tokenHex);
    };
    ws.onclose = function (ev) {
        log('disconnected ' + ev.code, ev.code === 1000 || ev.code === 4016 ? 'ok' : 'err');
    };
    ws.onerror = function () { log('socket error', 'err'); };
    pingTimer = setInterval(function () {
        if (ws && ws.readyState === 1 && self) {
            const p = new Uint8Array(4);
            new DataView(p.buffer).setUint32(0, Date.now() >>> 0, true);
            send(C2S.PING, p);
        }
    }, 2000);
}

function syncMouseUi() {
    const modeEl = $('mouse-mode');
    const lootEl = $('loot-mode');
    const talkEl = $('talk-right');
    const lootWrap = $('loot-mode-wrap');
    const talkWrap = $('talk-right-wrap');
    if (modeEl) modeEl.value = String(mouse.mouseControlMode);
    if (lootEl) lootEl.value = String(mouse.lootControlMode);
    if (talkEl) talkEl.checked = mouse.talkOnRightClick;
    if (lootWrap) lootWrap.hidden = mouse.mouseControlMode !== 1;
    if (talkWrap) talkWrap.hidden = mouse.mouseControlMode !== 0;
}

function cycleTarget(dir) {
    const list = combatRoster();
    if (!list.length) return;
    let idx = list.findIndex(function (row) { return row.id === targetId; });
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    idx = (idx + dir + list.length) % list.length;
    const id = list[idx].id;
    send(C2S.SET_TARGET, u32buf(id));
    targetId = id;
    renderCombat();
}

function tickFps(now) {
    frames += 1;
    if (!fpsTs) fpsTs = now;
    if (now - fpsTs >= 1000) {
        fps = frames;
        frames = 0;
        fpsTs = now;
        const el = $('stat-fps');
        if (el) el.textContent = String(fps);
    }
    draw();
    pumpKeyboardWalk(now);
    requestAnimationFrame(tickFps);
}

if (canvas) {
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    canvas.addEventListener('pointerdown', onCanvasPointer);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerleave', onCanvasPointerLeave);
    window.addEventListener('pointerup', function (ev) {
        if (ev.button === 0) buttonsDown.left = false;
        if (ev.button === 2) buttonsDown.right = false;
    });
}

window.addEventListener('keydown', function (ev) {
    if (!self || downed) return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (ev.key === 'Escape') {
        ev.preventDefault();
        keyWalk.reset();
        stopWalk();
        hideCtx();
        if (talkNpc) send(C2S.TALK_CLOSE, u32buf(talkNpc));
        return;
    }
    if (ev.key === 'u' || ev.key === 'U') {
        ev.preventDefault();
        keyWalk.reset();
        stopWalk();
        send(C2S.USE_STAIR, new Uint8Array(0));
        return;
    }
    if (ev.code === 'Space') {
        ev.preventDefault();
        cycleTarget(ev.shiftKey ? -1 : 1);
        return;
    }
    if (KeyWalk.dirOf(ev.code) == null) return;
    ev.preventDefault();
    const now = nowMs();
    if (!keyWalk.keyDown(ev.code, now)) return;
    cancelClickWalk();
    pumpKeyboardWalk(now);
});

window.addEventListener('keyup', function (ev) {
    if (KeyWalk.dirOf(ev.code) == null) return;
    ev.preventDefault();
    keyWalk.keyUp(ev.code);
});

window.addEventListener('blur', function () {
    keyWalk.reset();
});

document.addEventListener('click', function (ev) {
    const menu = $('ctx-menu');
    if (menu && !menu.hidden && !menu.contains(ev.target)) hideCtx();
});

document.addEventListener('DOMContentLoaded', function () {
    const leave = $('leave');
    const leaveSide = $('leave-side');
    if (leave) leave.addEventListener('click', leaveWorld);
    if (leaveSide) leaveSide.addEventListener('click', leaveWorld);
    const modeEl = $('mouse-mode');
    const lootEl = $('loot-mode');
    const talkEl = $('talk-right');
    const chaseEl = $('auto-chase');
    const sortEl = $('combat-sort');
    if (chaseEl) chaseEl.checked = autoChase;
    if (sortEl) sortEl.value = combatSort;
    syncMouseUi();
    if (modeEl) {
        modeEl.addEventListener('change', function () {
            mouse.mouseControlMode = Number(modeEl.value);
            mouse = saveMouseControls(mouse);
            syncMouseUi();
        });
    }
    if (lootEl) {
        lootEl.addEventListener('change', function () {
            mouse.lootControlMode = Number(lootEl.value);
            mouse = saveMouseControls(mouse);
        });
    }
    if (talkEl) {
        talkEl.addEventListener('change', function () {
            mouse.talkOnRightClick = talkEl.checked;
            mouse = saveMouseControls(mouse);
        });
    }
    if (chaseEl) {
        chaseEl.addEventListener('change', function () {
            autoChase = chaseEl.checked;
            saveAutoChase(autoChase);
            if (self) send(C2S.SET_AUTO_CHASE, Uint8Array.of(autoChase ? 1 : 0));
        });
    }
    if (sortEl) {
        sortEl.addEventListener('change', function () {
            combatSort = sortEl.value;
            saveCombatSort(combatSort);
            renderCombat();
        });
    }
    const fs = $('fullscreen-btn');
    const wrap = $('gameCanvasContainer');
    if (fs && wrap) {
        fs.addEventListener('click', function () {
            if (document.fullscreenElement) document.exitFullscreen();
            else wrap.requestFullscreen();
        });
    }
    $('dialog-close') && $('dialog-close').addEventListener('click', function () {
        if (talkNpc) send(C2S.TALK_CLOSE, u32buf(talkNpc));
        hideFloat('npc-dialog');
    });
    $('shop-close') && $('shop-close').addEventListener('click', function () {
        hideFloat('npc-shop');
    });
    $('loot-close') && $('loot-close').addEventListener('click', function () {
        if (openCorpse) send(C2S.LOOT_CLOSE, u32buf(openCorpse));
        openCorpse = 0;
        hideFloat('loot-panel');
    });
    const eqCard = $('activeEquipmentCard');
    if (eqCard) {
        eqCard.querySelectorAll('.slot-item').forEach(function (el) {
            el.addEventListener('click', function (ev) {
                ev.preventDefault();
                const slot = el.getAttribute('data-slot');
                if (!slot || slot === 'light') return;
                if (equipment[slot]) {
                    send(C2S.UNEQUIP, encodeUnequip(slot));
                    return;
                }
                if (selectedBag < 0 || !bag.containerId) return;
                send(C2S.EQUIP, encodeEquip(bag.containerId, selectedBag, slot));
            });
        });
    }
    $('openBagClose') && $('openBagClose').addEventListener('click', function () {
        openBag = null;
        renderBag();
    });
    $('equipment-details') && $('equipment-details').addEventListener('click', function () {
        const modal = $('profile-modal');
        const body = $('profile-body');
        const title = $('profile-title');
        if (!modal || !body || !self) return;
        title.textContent = self.name;
        const lines = [
            self.vocation + '  L' + self.level,
            'HP ' + self.hp + '/' + self.hpMax,
            'MP ' + self.mp + '/' + self.mpMax,
            'Exp ' + (self.experience || 0)
        ];
        if (skills) {
            SKILL_ROWS.forEach(function (row) {
                lines.push(row.label + '  ' + (skills[row.key] != null ? skills[row.key] : '—'));
            });
        }
        body.textContent = '';
        lines.forEach(function (line) {
            const p = document.createElement('p');
            p.textContent = line;
            body.appendChild(p);
        });
        modal.hidden = false;
    });
    $('profile-close') && $('profile-close').addEventListener('click', function () {
        $('profile-modal').hidden = true;
    });
    renderBag();
    const handoff = takePlayHandoff();
    if (!handoff || !handoff.token) {
        location.href = '/account';
        return;
    }
    if (handoff.expiresAt && Date.parse(handoff.expiresAt) <= Date.now()) {
        if (statusEl) {
            statusEl.className = 'status err';
            statusEl.textContent = 'Play token expired. Return to account and press Play.';
        }
        return;
    }
    loadConfig().then(function (cfg) {
        window.__accountUrl = cfg.accountUrl || '/account';
        if (cfg.mapId) mapId = String(cfg.mapId);
        connect(cfg, handoff.token);
        requestAnimationFrame(tickFps);
    }).catch(function (e) {
        log(String(e && e.message || e), 'err');
    });
});
