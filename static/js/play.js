'use strict';

const TILE = { 0: '#111', 1: '#3a7d3a', 2: '#c2a36b', 3: '#5a5a5a', 4: '#2a5a8a', 5: '#d4b84a' };
const TS = 32;
const CREATURE_MIN = 1000000000;
const ENGAGE_RANGE = 7;
const BACKPACK_SLOTS = 20;
const MAX_OPEN_BAGS = 8;
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

const { C2S, S2C, APPEAR_FLAG, SKILL_ORDER, REASON, LOC_KIND, OPEN_BAG_SELF_INDEX, hexToBytes, encodeFrame, u32buf, encodeTileUse, encodeUseItemWith, encodeStrPayload, encodeContainerSlot, encodeEquip, encodeUnequip, encodeCloseBag, encodeMoveItem, encodeMovePath, encodeCast, encodeBrowseField, decodeBrowseField, decodeCastFx, decodeAppear, decodeSwing, decodeStats, decodeField, decodeFieldGone, decodeSay, swingElementName, fieldCreatedAtMs, rttMs, Reader } = EngineProtocol;
const StatusIcons = typeof EngineStatusIcons !== 'undefined' ? EngineStatusIcons : null;
const Mouse = EngineMouse;
const InvMouse = typeof EngineInventoryMouse !== 'undefined' ? EngineInventoryMouse : null;
const Path = EnginePath;
const Draw = EngineTileDraw;
const Sprites = EngineSprites;
const Visual = EngineVisual;
const KeyWalk = EngineKeyboardWalk;
const Hud = EngineEntityHud;
const FloatPlace = typeof EngineFloatPanelPlace !== 'undefined' ? EngineFloatPanelPlace : null;
const FloatDrag = typeof EngineFloatPanelDrag !== 'undefined' ? EngineFloatPanelDrag : null;
const NpcShopUi = typeof EngineNpcShopUi !== 'undefined' ? EngineNpcShopUi : (typeof require === 'function' ? require('./npc_shop_ui.js') : null);
const Ground = typeof EngineGroundRenderer !== 'undefined' ? EngineGroundRenderer : null;
const SpritePres = typeof EngineSpritePresentation !== 'undefined' ? EngineSpritePresentation : null;
const CombatFx = typeof EngineCombatFx !== 'undefined' ? EngineCombatFx : null;
const ContainerDrop = typeof EngineContainerDrop !== 'undefined' ? EngineContainerDrop : null;
const SkillProgress = typeof EngineSkillProgress !== 'undefined' ? EngineSkillProgress : null;
const BrowseField = typeof EngineBrowseField !== 'undefined' ? EngineBrowseField : null;
const MinimapStore = typeof EngineMinimapStore !== 'undefined' ? EngineMinimapStore : null;
const MinimapView = typeof EngineMinimapView !== 'undefined' ? EngineMinimapView : null;
const MinimapPath = typeof EngineMinimapPath !== 'undefined' ? EngineMinimapPath : null;
const tilemapCache = Visual && typeof Visual.createTilemapCache === 'function' ? Visual.createTilemapCache({ margin: 2 }) : null;

let ws = null;
let clientSeq = 1;
let viewport = null;
let self = null;
let others = new Map();
let corpses = new Map();
let worldPins = new Map();
let groundItems = new Map();
let groundByUid = new Map();
let groundDrag = null;
let groundDragAvatar = null;
let browseUi = null;
const groundRejectSeqs = [];
let fields = new Map();
let pendingUseWith = null;
let seenAt = new Map();
let openCorpse = 0;
let bag = { containerId: '', capacity: BACKPACK_SLOTS, slots: [] };
let openBag = null;
let openBagItemId = '';
let pendingOpenBagItemId = '';
let pendingOpenBagAnchor = null;
let pendingOpenFrom = null;
let floatZ = 0;
const openBags = new Map();
const containerCache = new Map();
const containerSlotMap = new Map();
const bgFetchQueue = [];
let equipment = {};
let capVal = null;
let capMax = null;
let skills = null;
let skillProgress = null;
let talkNpc = 0;
let shopNpc = 0;
let currentShop = null;
let shopUiState = null;
let pingTimer = 0;
let targetId = 0;
let hoveredEntityId = 0;
let downed = false;
let mouse = loadMouseControls();
let autoChase = loadAutoChase();
let combatSort = loadCombatSort();
let selectedBag = -1;
let selectedOpenBag = -1;
let selectedEquipSlot = null;
let walkDest = null;
let walkBusy = false;
let walkQueued = false;
let walkLeft = 0;
let pendingAfterWalk = null;
let chaseWalk = false;
const GeneralHotkeys = typeof EngineGeneralHotkeys !== 'undefined' ? EngineGeneralHotkeys : null;
let generalHotkeys = GeneralHotkeys ? GeneralHotkeys.defaults() : null;
let generalCapture = null;
const keyWalk = KeyWalk.create({
    dirOf: function (token) {
        if (!GeneralHotkeys || !generalHotkeys) return KeyWalk.dirOf(token);
        const dir = GeneralHotkeys.moveDir
            ? GeneralHotkeys.moveDir(token, generalHotkeys)
            : GeneralHotkeys.cardinalDir(token, generalHotkeys);
        return dir == null ? null : dir;
    }
});
let buttonsDown = { left: false, right: false };
let cancelNext = false;
let suppressNextSlotClick = false;
let suppressNextContextMenu = false;
let suppressNextCanvasClick = false;
let suppressNextDocClick = false;
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
const DIAGONAL_STEP_FACTOR = 2;
let walkGapScale = 1;
const visualLoader = Visual.createLoader();

const canvas = document.getElementById('world');
const ctx = canvas ? canvas.getContext('2d') : null;
const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const sessionStateBadge = document.getElementById('sessionStateBadge');

function setSessionBadge(text) {
    if (sessionStateBadge) sessionStateBadge.textContent = text;
}

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

function applyDirFacing(ent, dir) {
    if (!ent || dir == null) return;
    ent.dir = dir | 0;
    const step = Path && Path.DIRS ? Path.DIRS[ent.dir] : null;
    if (step && step.dx < 0) ent.facing = -1;
    else if (step && step.dx > 0) ent.facing = 1;
    else if (ent.dir === 3) ent.facing = -1;
    else if (ent.dir === 1) ent.facing = 1;
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
        const dy = y - vis.y;
        if (dx < -0.01) ent.facing = -1;
        else if (dx > 0.01) ent.facing = 1;
        ent.fromX = vis.x;
        ent.fromY = vis.y;
        ent.moveAt = nowMs();
        const diagonal = Math.abs(dx) > 0.45 && Math.abs(dy) > 0.45;
        ent.moveDur = diagonal ? stepMs * DIAGONAL_STEP_FACTOR : stepMs;
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

function hideHudFct() {
    const el = $('fct');
    if (!el) return;
    el.hidden = true;
    if (fctTimer) {
        clearTimeout(fctTimer);
        fctTimer = null;
    }
}

function fct(text) {
    const msg = text == null ? '' : String(text);
    if (!msg) return;
    log(msg);
    // System float: canvas FCT over the player (watch-mode emitSystemFloat).
    if (self && CombatFx && typeof CombatFx.pushFct === 'function') {
        hideHudFct();
        CombatFx.pushFct({
            x: self.x,
            y: self.y,
            z: self.z,
            text: msg,
            color: '#f59e0b',
            life: 1.1
        });
        return;
    }
    const el = $('fct');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    if (fctTimer) clearTimeout(fctTimer);
    fctTimer = setTimeout(function () { el.hidden = true; }, 1800);
}

function send(opcode, payload) {
    if (!ws || ws.readyState !== 1) return 0;
    const seq = clientSeq;
    clientSeq += 1;
    ws.send(encodeFrame(opcode, seq, payload));
    if (opcode === C2S.MOVE_ITEM || opcode === C2S.OPEN_BAG) {
        groundRejectSeqs.push(seq);
        if (groundRejectSeqs.length > 40) groundRejectSeqs.shift();
    }
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

function characterView() {
    if (!self) return null;
    return {
        name: self.name,
        vocation: self.vocation,
        level: self.level,
        hp: self.hp,
        hpMax: self.hpMax,
        mp: self.mp,
        mpMax: self.mpMax,
        experience: self.experience,
        foodSeconds: foodRemainingSec(),
        cap: capVal,
        capMax: capMax
    };
}

function setHud() {
    if (typeof EngineClientWindow !== 'undefined' && EngineClientWindow.syncCharacter) {
        EngineClientWindow.syncCharacter(characterView());
    }
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

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
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
            look: p.look || '',
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
        p.className = 'text-muted small mb-0 p-1 muted';
        p.textContent = 'No creatures in combat';
        el.appendChild(p);
        return;
    }
    const genre = visualGenre();
    list.forEach(function (row) {
        const isTarget = row.id === targetId;
        const d = document.createElement('div');
        d.className = 'entity-list-row entity-row' + (isTarget ? ' is-target' : '');
        d.dataset.id = String(row.id);
        d.setAttribute('data-uid', String(row.id));

        const iconBox = document.createElement('div');
        iconBox.className = 'entity-list-icon';
        const spriteStem = row.look || row.name;
        const iconUrl = Sprites && typeof Sprites.spritePath === 'function'
            ? Sprites.spritePath(genre, 'creatures', spriteStem, 'icon')
            : null;
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.alt = row.name;
            img.title = row.name;
            img.onerror = function () {
                iconBox.innerHTML = '<span class="icon-placeholder">' + escapeHtml(row.name.slice(0, 2).toUpperCase()) + '</span>';
            };
            iconBox.appendChild(img);
        } else {
            iconBox.innerHTML = '<span class="icon-placeholder">' + escapeHtml(row.name.slice(0, 2).toUpperCase()) + '</span>';
        }

        const info = document.createElement('div');
        info.className = 'entity-list-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'entity-list-name-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'entity-list-name';
        nameSpan.title = row.name;
        nameSpan.textContent = row.name;

        const hpPctVal = Math.max(0, Math.min(100, Math.round(row.hpPct * 100)));
        const hpText = document.createElement('span');
        hpText.className = 'entity-list-hp-text';
        hpText.textContent = hpPctVal + '%';

        nameRow.appendChild(nameSpan);
        nameRow.appendChild(hpText);

        const hpBarBg = document.createElement('div');
        hpBarBg.className = 'entity-list-hp-bar-bg entity-hp';

        const hpBarFill = document.createElement('div');
        hpBarFill.className = 'entity-list-hp-bar-fill';
        hpBarFill.style.width = hpPctVal + '%';
        hpBarFill.style.backgroundColor = row.hpPct > 0.7 ? '#00ff00' : (row.hpPct > 0.4 ? '#ffff00' : '#ff0000');

        hpBarBg.appendChild(hpBarFill);

        info.appendChild(nameRow);
        info.appendChild(hpBarBg);

        d.appendChild(iconBox);
        d.appendChild(info);

        d.addEventListener('pointerdown', function (ev) {
            if (ev.button === 0) buttonsDown.left = true;
            if (ev.button === 2) buttonsDown.right = true;
            if (ev.button !== 0) return;
            const intents = combatIntentsFromEvent(ev, 'left');
            if (intents && intents[0] && intents[0].type === 'LOOK') {
                ev.preventDefault();
                suppressNextSlotClick = true;
                suppressNextContextMenu = true;
                applyCombatIntents(intents, row, ev.clientX, ev.clientY);
            }
        });
        d.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (suppressNextSlotClick) {
                suppressNextSlotClick = false;
                return;
            }
            const intents = combatIntentsFromEvent(ev, 'left');
            if (!intents) {
                selectTarget(row.id);
                return;
            }
            const applied = applyCombatIntents(intents, row, ev.clientX, ev.clientY);
            if (applied === 'OPEN_CONTEXT_MENU') {
                ev.stopPropagation();
            }
        });
        d.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            if (suppressNextContextMenu) {
                suppressNextContextMenu = false;
                return;
            }
            const intents = combatIntentsFromEvent(ev, 'right');
            if (!intents) {
                showCombatMenu(ev.clientX, ev.clientY, row);
                return;
            }
            applyCombatIntents(intents, row, ev.clientX, ev.clientY);
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

function renderCombatList() {
    return renderCombat();
}

function skillFillStyle(percent, rest) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    return 'linear-gradient(to right, #31582f ' + pct + '%, ' + rest + ' ' + pct + '%)';
}

/** MM:SS. Minutes are floor(seconds / 60), the same shape as the legacy skills window. */
function formatFoodClock(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function foodRemainingSec() {
    if (!self) return 0;
    const base = Math.max(0, Math.floor(Number(self.foodSeconds) || 0));
    const sync = self.foodSyncMs || 0;
    const elapsed = Math.floor((nowMs() - sync) / 1000);
    return Math.max(0, base - (elapsed > 0 ? elapsed : 0));
}

function renderFoodStatus() {
    const sec = foodRemainingSec();
    const label = formatFoodClock(sec);
    const hungry = !!(self && sec <= 0);
    const row = document.querySelector('#skillsPanelList [data-skill="food"]');
    if (row) {
        const val = row.querySelector('.skills-panel-value');
        if (val && val.textContent !== label) val.textContent = label;
        row.classList.toggle('is-hungry', hungry);
        row.title = hungry ? 'You are hungry' : 'Food';
    }
    renderStatusIcons();
    if (self && typeof EngineClientWindow !== 'undefined' && EngineClientWindow.syncCharacter) {
        EngineClientWindow.syncCharacter(characterView());
    }
}

function renderStatusIcons() {
    const bar = $('activeEqStatusBar');
    if (!bar || !StatusIcons) return;
    const source = self ? {
        conditions: self.conditions,
        inProtectionZone: !!self.inProtectionZone,
        hungry: foodRemainingSec() <= 0
    } : null;
    StatusIcons.renderStatusBar(bar, source);
}

function renderSkills() {
    const el = $('skillsPanelList');
    if (!el) return;
    el.textContent = '';
    if (!self) {
        const p = document.createElement('p');
        p.className = 'text-muted small mb-0 p-1 muted';
        p.textContent = 'No character';
        el.appendChild(p);
        renderFoodStatus();
        return;
    }

    const rates = SkillProgress ? SkillProgress.ratesFor(self.vocation) : null;
    const levelProg = SkillProgress
        ? SkillProgress.levelProgress(self.experience, self.level)
        : null;
    const lvlRow = document.createElement('div');
    lvlRow.className = 'skills-panel-level';
    if (levelProg) {
        lvlRow.title = levelProg.tooltip;
        lvlRow.style.background = skillFillStyle(levelProg.percent, '#0a0d12');
    }
    const lvlLabel = document.createElement('span');
    lvlLabel.className = 'skills-panel-level-label';
    lvlLabel.textContent = 'Level';
    const lvlVal = document.createElement('span');
    lvlVal.className = 'skills-panel-level-value text-info';
    lvlVal.textContent = String(self.level || 1);
    lvlRow.appendChild(lvlLabel);
    lvlRow.appendChild(lvlVal);
    el.appendChild(lvlRow);

    const grid = document.createElement('div');
    grid.className = 'skills-panel-grid';

    SKILL_ROWS.forEach(function (row) {
        const d = document.createElement('div');
        d.className = 'skills-panel-row skill-row';
        d.setAttribute('data-skill', row.key);
        const label = document.createElement('span');
        label.className = 'skills-panel-name';
        label.textContent = row.label;
        const val = document.createElement('span');
        val.className = 'skills-panel-value';
        const n = skills && skills[row.key] != null ? skills[row.key] : null;
        val.textContent = n == null ? '—' : String(n);
        if (n != null && SkillProgress) {
            const counter = skillProgress && skillProgress[row.key] != null ? skillProgress[row.key] : 0;
            const prog = SkillProgress.skillProgress(row.key, n, counter, rates);
            d.title = prog.tooltip;
            d.style.background = skillFillStyle(prog.percent, 'rgba(0, 0, 0, 0.25)');
        }
        d.appendChild(label);
        d.appendChild(val);
        grid.appendChild(d);
    });
    el.appendChild(grid);

    const food = document.createElement('div');
    food.className = 'skills-panel-row skills-panel-food';
    food.setAttribute('data-skill', 'food');
    const foodName = document.createElement('span');
    foodName.className = 'skills-panel-name';
    foodName.textContent = 'Food';
    const foodVal = document.createElement('span');
    foodVal.className = 'skills-panel-value';
    food.appendChild(foodName);
    food.appendChild(foodVal);
    el.appendChild(food);
    renderFoodStatus();
}

function itemLabel(id) {
    if (!id) return '';
    const meta = itemCatalog.get(id);
    if (meta && (meta.label || meta.name)) return String(meta.label || meta.name);
    return String(id).replace(/_/g, ' ');
}

function groundTileKey(x, y, z) {
    return (z | 0) + ',' + (x | 0) + ',' + (y | 0);
}

function rebuildGroundTile(x, y, z) {
    const key = groundTileKey(x, y, z);
    const items = [];
    groundByUid.forEach(function (ent) {
        if (!ent) return;
        if ((ent.x | 0) === (x | 0) && (ent.y | 0) === (y | 0) && (ent.z | 0) === (z | 0)) {
            items.push(ent);
        }
    });
    items.sort(function (a, b) { return (b.stackIndex | 0) - (a.stackIndex | 0); });
    if (!items.length) {
        groundItems.delete(key);
        return;
    }
    groundItems.set(key, { x: x | 0, y: y | 0, z: z | 0, items: items });
}

function upsertGroundSlot(slot) {
    if (!slot || !slot.uid) return;
    const prev = groundByUid.get(slot.uid);
    groundByUid.set(slot.uid, {
        uid: slot.uid,
        x: slot.x | 0,
        y: slot.y | 0,
        z: slot.z | 0,
        stackIndex: slot.stackIndex | 0,
        id: slot.id,
        itemId: slot.id,
        count: slot.count | 0,
        flags: slot.flags | 0
    });
    if (prev && ((prev.x | 0) !== (slot.x | 0) || (prev.y | 0) !== (slot.y | 0) || (prev.z | 0) !== (slot.z | 0))) {
        rebuildGroundTile(prev.x, prev.y, prev.z);
    }
    rebuildGroundTile(slot.x, slot.y, slot.z);
    if (groundDrag && groundDrag.uid === slot.uid) {
        groundDrag.x = slot.x | 0;
        groundDrag.y = slot.y | 0;
        groundDrag.z = slot.z | 0;
        groundDrag.stackIndex = slot.stackIndex | 0;
    }
}

function removeGroundUid(uid) {
    if (!uid) return;
    const prev = groundByUid.get(uid);
    groundByUid.delete(uid);
    if (groundDrag && groundDrag.uid === uid) {
        groundDrag = null;
        currentDrag = null;
        removeGroundDragAvatar();
    }
    if (prev) rebuildGroundTile(prev.x, prev.y, prev.z);
}

function backpackMoveDest() {
    const index = ContainerDrop ? ContainerDrop.CONTAINER_INSERT_INDEX : 255;
    return { kind: 'container', containerUid: bag.containerId || 'root', index: index };
}

function tileMoveLoc(x, y, z, stackIndex) {
    return { kind: 'tile', x: x | 0, y: y | 0, z: z | 0, stackIndex: stackIndex | 0 };
}

function sendPickup(tile, stackIndex, item, ev) {
    if (!tile) return;
    moveItemWithSplit(
        tileMoveLoc(tile.x, tile.y, tile.z, stackIndex),
        backpackMoveDest(),
        item || { id: '', count: 1 },
        ev
    );
}

function catalogItemIsContainer(id) {
    if (!id) return false;
    const meta = itemCatalog.get(id);
    if (!meta) {
        const s = String(id).toLowerCase();
        return s === 'bag' || s === 'backpack' || s.indexOf('quiver') >= 0 || s.indexOf('backpack') >= 0;
    }
    const cat = String(meta.category || '').toLowerCase();
    if (cat === 'container' || cat === 'backpack' || cat === 'bag' || cat === 'quiver') return true;
    const types = Array.isArray(meta.type) ? meta.type : [];
    for (let i = 0; i < types.length; i++) {
        const t = String(types[i]).toLowerCase();
        if (t === 'container' || t === 'backpack' || t === 'bag' || t === 'quiver') return true;
    }
    return false;
}

function equipItemIsContainer(item) {
    if (!item) return false;
    if (item.flags & 1) return true;
    return catalogItemIsContainer(item.id);
}

function requestOpenBag(containerId, index, itemId, originEl) {
    if (!containerId) return;
    pendingOpenBagItemId = itemId || '';
    if (itemId) openBagItemId = itemId;
    pendingOpenFrom = { containerId: containerId, index: index | 0, isBackground: false };
    rememberOpenBagAnchor(originEl, containerId, index);
    const existingUid = findExistingOpenBagUid(containerId, index | 0);
    if (existingUid) focusOpenBagWindow(existingUid);
    send(C2S.OPEN_BAG, encodeContainerSlot(containerId, index));
}

function findExistingOpenBagUid(containerId, index) {
    if (containerId && openBags.has(containerId)) return containerId;
    const idx = index | 0;
    let found = '';
    openBags.forEach(function (rec, uid) {
        if (found || !rec) return;
        if (rec.openedFrom && rec.openedFrom.containerId === containerId && (rec.openedFrom.index | 0) === idx) {
            found = uid;
        }
    });
    return found || '';
}

function requestCloseBag(containerId) {
    send(C2S.CLOSE_BAG, encodeCloseBag(containerId || ''));
    if (!containerId) closeAllOpenBags();
    else removeOpenBagWindow(containerId);
    renderBag();
    const shopPanel = $('npc-shop');
    if (shopPanel && !shopPanel.hidden && currentShop) {
        buildShopUi(shopPanel, $('shop-body'));
    }
}

function inventoryFloatRoot() {
    let root = $('inventoryFloatRoot');
    if (root) return root;
    if (typeof document === 'undefined' || !document.body) return null;
    root = document.createElement('div');
    root.id = 'inventoryFloatRoot';
    root.className = 'inv-float-root';
    document.body.appendChild(root);
    return root;
}

function floatRootHost() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.body;
}

function reparentFloatRoot() {
    const root = inventoryFloatRoot();
    const host = floatRootHost();
    if (!root || !host) return;
    if (root.parentNode !== host) host.appendChild(root);
}

function bagPanelParts(panel) {
    if (!panel) return { title: null, count: null, grid: null, close: null };
    return {
        title: panel.querySelector('.inv-panel-title'),
        count: panel.querySelector('.inv-panel-count'),
        grid: panel.querySelector('.inv-panel-grid') || panel.querySelector('.backpack-grid'),
        close: panel.querySelector('.inv-panel-close')
    };
}

function findInvSlotEl(containerId, index) {
    if (containerId == null || typeof document === 'undefined') return null;
    const id = String(containerId);
    const idx = index != null ? String(index) : '';
    const nodes = document.querySelectorAll('.inv-slot[data-container-uid], .slot-item[data-slot]');
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.getAttribute('data-container-uid') === id && n.getAttribute('data-slot-index') === idx) {
            return n;
        }
        if (n.getAttribute('data-slot') === id) return n;
    }
    return null;
}

function rememberOpenBagAnchor(originEl, containerId, index) {
    let el = originEl;
    if (!el) el = findInvSlotEl(containerId, index);
    if (el && typeof el.getBoundingClientRect === 'function') {
        pendingOpenBagAnchor = { origin: 'slot', slotEl: el };
        return;
    }
    pendingOpenBagAnchor = { origin: 'slot' };
}

function bringFloatToFront(el) {
    if (!el || !el.style) return;
    floatZ += 1;
    el.style.zIndex = String(1000 + floatZ);
}

function wireFloatHeaderDrag(header, el) {
    if (!FloatDrag || !header || !el) return;
    FloatDrag.wireHeaderDrag(header, el, {
        onRaise: function () { bringFloatToFront(el); }
    });
}

function initFloatPanelDrag(id) {
    const panel = typeof $ === 'function' ? $(id) : (typeof document !== 'undefined' ? document.getElementById(id) : null);
    if (!panel) return;
    const header = panel.querySelector('.panel-title-bar, .inv-panel-header, header');
    if (header) {
        wireFloatHeaderDrag(header, panel);
    }
    panel.addEventListener('pointerdown', function () {
        bringFloatToFront(panel);
    });
}


function placeNewFloat(el, opts) {
    if (!el || !el.style || !FloatPlace) return null;
    const o2 = opts || {};
    let origin = o2.origin;
    let anchor = o2.anchor || null;
    if (!anchor && o2.slotEl) {
        anchor = FloatPlace.slotClientRect(o2.slotEl);
        if (!origin) origin = 'slot';
    }
    if (!anchor && o2.tile && o2.tile.x != null && o2.tile.y != null) {
        const canvasEl = $('world');
        anchor = FloatPlace.tileClientRect(
            o2.tile,
            canvasEl,
            { _viewOriginX: camX, _viewOriginY: camY },
            TS,
            TS
        );
        if (!origin) origin = 'canvas';
    }
    const boundsEl = origin === 'canvas'
        ? ($('gameCanvasContainer') || $('world'))
        : null;
    const pos = FloatPlace.placeFloatPanel(el, {
        anchor: anchor,
        bounds: FloatPlace.boundsForOrigin(
            origin,
            boundsEl,
            typeof window !== 'undefined' ? window : null
        ),
        occupied: FloatPlace.collectOccupiedRects(inventoryFloatRoot(), el),
        fallbackW: 200,
        fallbackH: 80
    });
    const root = inventoryFloatRoot();
    if (pos && root && typeof root.getBoundingClientRect === 'function') {
        const rr = root.getBoundingClientRect();
        el.style.left = (pos.left - (Number(rr.left) || 0)) + 'px';
        el.style.top = (pos.top - (Number(rr.top) || 0)) + 'px';
    }
    return pos;
}

function createFloatBagPanel(uid) {
    const root = inventoryFloatRoot();
    if (!root || !uid) return null;
    const el = document.createElement('div');
    el.className = 'inv-float-panel';
    el.dataset.containerUid = uid;
    el.setAttribute('data-open-bag-uid', uid);

    const header = document.createElement('div');
    header.className = 'inv-panel-header';
    const title = document.createElement('span');
    title.className = 'inv-panel-title';
    title.textContent = 'Bag';
    const count = document.createElement('span');
    count.className = 'inv-panel-count';
    count.textContent = '(0/20)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'inv-panel-close';
    closeBtn.setAttribute('aria-label', 'Close bag');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        requestCloseBag(uid);
    });
    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(closeBtn);

    const scroll = document.createElement('div');
    scroll.className = 'backpack-grid-scroll inv-panel-scroll';
    const grid = document.createElement('div');
    grid.className = 'backpack-grid inv-panel-grid';
    scroll.appendChild(grid);
    el.appendChild(header);
    el.appendChild(scroll);
    root.appendChild(el);

    wireFloatHeaderDrag(header, el);
    el.addEventListener('pointerdown', function () {
        focusOpenBagWindow(uid);
    });
    return el;
}

function focusOpenBagWindow(uid) {
    const rec = openBags.get(uid);
    if (!rec || !rec.panel) return;
    openBags.forEach(function (other) {
        if (other && other.panel) other.panel.classList.remove('is-focused');
    });
    rec.panel.classList.add('is-focused');
    bringFloatToFront(rec.panel);
    openBags.delete(uid);
    openBags.set(uid, rec);
    openBag = rec.view;
    openBagItemId = rec.itemId || '';
}

function syncFocusedOpenBag() {
    const remain = Array.from(openBags.values());
    if (!remain.length) {
        openBag = null;
        openBagItemId = '';
        return;
    }
    const last = remain[remain.length - 1];
    openBag = last.view;
    openBagItemId = last.itemId || '';
}

function syncFloatRootAria() {
    const root = $('inventoryFloatRoot');
    if (!root) return;
    const browseOpen = browseUi && browseUi.isAnyOpen && browseUi.isAnyOpen();
    root.setAttribute('aria-hidden', (openBags.size || browseOpen) ? 'false' : 'true');
}

function removeOpenBagWindow(uid) {
    const rec = openBags.get(uid);
    if (!rec) return;
    if (rec.view) {
        containerCache.set(uid, rec.view);
        if (rec.openedFrom) {
            containerSlotMap.set(rec.openedFrom.containerId + ':' + rec.openedFrom.index, uid);
            rec.view.parentContainerId = rec.openedFrom.containerId;
            rec.view.parentSlotIndex = rec.openedFrom.index;
        }
    }
    if (rec.panel && rec.panel.parentNode) rec.panel.remove();
    openBags.delete(uid);
    syncFocusedOpenBag();
    syncFloatRootAria();
}

function closeAllOpenBags() {
    const uids = Array.from(openBags.keys());
    for (let i = 0; i < uids.length; i++) removeOpenBagWindow(uids[i]);
    pendingOpenBagItemId = '';
    pendingOpenBagAnchor = null;
    pendingOpenFrom = null;
}

function upsertOpenBagWindow(view, itemIdHint) {
    if (!view || !view.containerId) return null;
    containerCache.set(view.containerId, view);
    const uid = view.containerId;
    let rec = openBags.get(uid);
    if (!rec) {
        if (openBags.size >= MAX_OPEN_BAGS) {
            const oldest = openBags.keys().next().value;
            if (oldest) removeOpenBagWindow(oldest);
        }
        rec = {
            view: view,
            itemId: itemIdHint || '',
            selected: -1,
            panel: createFloatBagPanel(uid),
            placed: false
        };
        openBags.set(uid, rec);
    } else {
        rec.view = view;
        if (itemIdHint) rec.itemId = itemIdHint;
    }
    return rec;
}

function queueBackgroundFetch(containerId, index, itemIdHint) {
    if (!containerId) return;
    const key = containerId + ':' + (index | 0);
    if (containerSlotMap.has(key) && containerCache.has(containerSlotMap.get(key))) return;
    for (let i = 0; i < bgFetchQueue.length; i++) {
        if (bgFetchQueue[i].containerId === containerId && (bgFetchQueue[i].index | 0) === (index | 0)) {
            return;
        }
    }
    bgFetchQueue.push({ containerId: containerId, index: index | 0, itemIdHint: itemIdHint || '' });
    drainBgFetchQueue();
}

function drainBgFetchQueue() {
    if (pendingOpenFrom || !bgFetchQueue.length) return;
    const next = bgFetchQueue.shift();
    if (!next) return;
    const key = next.containerId + ':' + (next.index | 0);
    if (containerSlotMap.has(key) && containerCache.has(containerSlotMap.get(key))) {
        drainBgFetchQueue();
        return;
    }
    pendingOpenBagItemId = next.itemIdHint || '';
    pendingOpenFrom = { containerId: next.containerId, index: next.index | 0, isBackground: true };
    send(C2S.OPEN_BAG, encodeContainerSlot(next.containerId, next.index | 0));
}

function checkAndFetchSubContainers() {
    if (typeof bag === 'undefined' || !bag || !Array.isArray(bag.slots)) return;
    for (let i = 0; i < bag.slots.length; i++) {
        const s = bag.slots[i];
        if (!s) continue;
        if ((s.flags & 1) || (typeof equipItemIsContainer === 'function' && equipItemIsContainer(s))) {
            queueBackgroundFetch(bag.containerId, s.index, s.id);
        }
    }
}

function applyBagView(view) {
    if (!view || !view.containerId) {
        closeAllOpenBags();
        renderBag();
        return;
    }
    if ((view.capacity | 0) === 0) {
        removeOpenBagWindow(view.containerId);
        renderBag();
        return;
    }

    containerCache.set(view.containerId, view);

    if (pendingOpenFrom && pendingOpenFrom.isBackground) {
        const pCid = pendingOpenFrom.containerId;
        const pIdx = pendingOpenFrom.index;
        pendingOpenFrom = null;
        pendingOpenBagItemId = '';

        containerSlotMap.set(pCid + ':' + pIdx, view.containerId);
        view.parentContainerId = pCid;
        view.parentSlotIndex = pIdx;

        send(C2S.CLOSE_BAG, encodeCloseBag(view.containerId));

        if (Array.isArray(view.slots)) {
            for (let i = 0; i < view.slots.length; i++) {
                const s = view.slots[i];
                if (s && ((s.flags & 1) || equipItemIsContainer(s))) {
                    queueBackgroundFetch(view.containerId, s.index, s.id);
                }
            }
        }

        drainBgFetchQueue();

        const shopPanel = $('npc-shop');
        if (shopPanel && !shopPanel.hidden && currentShop) {
            buildShopUi(shopPanel, $('shop-body'));
        }
        return;
    }

    const isNew = !openBags.has(view.containerId);
    const hint = isNew ? pendingOpenBagItemId : '';
    if (isNew) pendingOpenBagItemId = '';
    const rec = upsertOpenBagWindow(view, hint);
    if (isNew && rec && pendingOpenFrom) rec.openedFrom = pendingOpenFrom;
    if (rec && rec.openedFrom) {
        containerSlotMap.set(rec.openedFrom.containerId + ':' + rec.openedFrom.index, view.containerId);
        view.parentContainerId = rec.openedFrom.containerId;
        view.parentSlotIndex = rec.openedFrom.index;
    }
    openBag = view;
    if (rec && rec.itemId) openBagItemId = rec.itemId;
    renderBag();
    const from = rec && rec.openedFrom;
    const matchesPending = pendingOpenFrom && (
        pendingOpenFrom.containerId === view.containerId
        || (from && from.containerId === pendingOpenFrom.containerId && (from.index | 0) === (pendingOpenFrom.index | 0))
    );
    if (isNew || matchesPending) {
        focusOpenBagWindow(view.containerId);
        pendingOpenFrom = null;
    }
}

function openEquippedContainer(slotKey, item) {
    if (!item || !slotKey) return;
    if (slotKey === 'backpack') {
        openSidebarPanel('backpack');
        return;
    }
    const slotEl = document.querySelector('#activeEquipmentCard .slot-item[data-slot="' + slotKey + '"]');
    requestOpenBag(slotKey, 0, item.id || '', slotEl);
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

const itemCatalog = new Map();
let vocationClasses = [];

function loadVocationSprites() {
    if (typeof fetch === 'undefined') return;
    fetch('/content/classes-ui.json')
        .then(function (res) {
            if (!res.ok) return null;
            return res.json();
        })
        .then(function (data) {
            if (!data || !Array.isArray(data.classes)) return;
            vocationClasses = data.classes;
        })
        .catch(function () {});
}

function loadItemCatalog() {
    if (typeof fetch === 'undefined') return;
    fetch('/content/equipment.json')
        .then(function (res) {
            if (!res.ok) return null;
            return res.json();
        })
        .then(function (data) {
            if (!data) return;
            const list = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                if (it && it.id) {
                    itemCatalog.set(it.id, it);
                }
            }
            renderEquipment();
            renderBag();
        })
        .catch(function () {});
}

function resolveItemSpriteUrl(itemOrId, genre) {
    if (typeof EngineSprites !== 'undefined' && typeof EngineSprites.resolveItemSpriteUrl === 'function') {
        return EngineSprites.resolveItemSpriteUrl(itemOrId, genre);
    }
    if (!itemOrId) return null;
    let id = '';
    if (typeof itemOrId === 'string') {
        id = itemOrId;
    } else if (typeof itemOrId === 'object') {
        if (itemOrId.sprites && itemOrId.sprites.alpha) return itemOrId.sprites.alpha;
        if (itemOrId.sprite && typeof itemOrId.sprite === 'string') return itemOrId.sprite;
        id = itemOrId.customSprite || itemOrId.spriteId || itemOrId.id || itemOrId.itemId || '';
    }
    if (!id) return null;
    const stem = String(id).trim().replace(/\.png$/i, '').split(/[_\s-]+/).filter(Boolean).map(function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }).join('_');
    const g = String(genre || 'rpg_fantasy').replace(/[^a-z0-9_]/gi, '') || 'rpg_fantasy';
    return '/sprites/' + g + '/equipment/alpha/' + stem + '.png';
}

function weaponPenalty(meta) {
    if (!meta || typeof EngineEquipRules === 'undefined' || !EngineEquipRules.penalizedWeaponStats) {
        return null;
    }
    return EngineEquipRules.penalizedWeaponStats(meta, self && self.level);
}

function weaponAtkText(meta) {
    const pen = weaponPenalty(meta);
    if (pen) {
        const shown = Number(meta.extraAtk) > 0 ? (pen.atk + pen.extraAtk) : pen.atk;
        return shown + ' (-' + pen.gap + ')';
    }
    if (meta && meta.atk != null && meta.atk > 0) return String(meta.atk);
    return '';
}

function weaponDefText(meta) {
    const pen = weaponPenalty(meta);
    if (pen && pen.defense != null) return pen.defense + ' (-' + pen.gap + ')';
    if (meta && meta.defense != null && meta.defense > 0) return String(meta.defense);
    return '';
}

function formatItemTooltip(itemId, stackCount) {
    const meta = itemCatalog.get(itemId);
    const rawLabel = (meta && meta.label) || itemLabel(itemId);
    const label = rawLabel.split(' ').map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
    const lines = [];
    if (stackCount && stackCount > 1) {
        lines.push(label + ' (Count: ' + stackCount + ')');
    } else {
        lines.push(label);
    }
    if (meta) {
        const details = [];
        const kind = meta.category || meta.weaponType || meta.type || meta.slot;
        if (kind) details.push('Type: ' + kind);
        const atkText = weaponAtkText(meta);
        const defText = weaponDefText(meta);
        if (atkText) details.push('Atk: ' + atkText);
        if (defText) details.push('Def: ' + defText);
        if (meta.armor != null && meta.armor > 0) details.push('Arm: ' + meta.armor);
        if (meta.range != null && meta.range > 1) details.push('Range: ' + meta.range);
        if (meta.twoHanded || meta.hands === 2) details.push('Two-handed');
        if (meta.weight != null && meta.weight > 0) details.push('Weight: ' + (meta.weight / 100).toFixed(2) + ' oz');
        if (typeof EngineEquipRules !== 'undefined' && EngineEquipRules.wieldSentence) {
            const wield = EngineEquipRules.wieldSentence(meta);
            if (wield) lines.push(wield);
        }
        if (details.length) {
            lines.push(details.join(' · '));
        }
    }
    return lines.join('\n');
}

const SLOT_PLACEHOLDERS = Object.freeze({
    head: '<i class="fa-solid fa-helmet-safety"></i>',
    chest: '<i class="fa-solid fa-vest"></i>',
    legs: '<i class="fa-solid fa-socks"></i>',
    boots: '<i class="fa-solid fa-shoe-prints"></i>',
    weapon: '<i class="fa-solid fa-hand-fist"></i>',
    shield: '<i class="fa-solid fa-shield"></i>',
    amulet: '<i class="fa-solid fa-gem"></i>',
    ring: '<i class="fa-solid fa-ring"></i>',
    backpack: '<i class="fa-solid fa-bag-shopping"></i>',
    light: '<i class="fa-solid fa-lightbulb"></i>'
});

let currentDrag = null;

function onSlotDragStart(ev, containerId, slotIndex, item) {
    if (!item) return;
    currentDrag = {
        kind: 'container',
        containerId: containerId || 'root',
        slotIndex: slotIndex,
        item: item
    };
    if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        try {
            ev.dataTransfer.setData('text/plain', JSON.stringify(currentDrag));
        } catch (e) {}
    }
    ev.currentTarget.classList.add('is-dragging');
}

function onEquipDragStart(ev, slotKey) {
    const it = equipment[slotKey];
    if (!it) return;
    currentDrag = {
        kind: 'equipment',
        slot: slotKey,
        item: it
    };
    if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        try {
            ev.dataTransfer.setData('text/plain', JSON.stringify(currentDrag));
        } catch (e) {}
    }
    ev.currentTarget.classList.add('is-dragging');
}

function onDragOver(ev) {
    if (!currentDrag) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    setDragOver(ev.currentTarget);
}

function onDragLeave(ev) {
    ev.currentTarget.classList.remove('drag-over');
}

function onDragEnd(ev) {
    if (currentDrag && currentDrag.item && currentDrag.item.id && ev) {
        const under = typeof document !== 'undefined'
            ? document.elementFromPoint(ev.clientX, ev.clientY)
            : null;
        if (under && typeof EngineActionBars !== 'undefined'
            && typeof EngineActionBars.tryHandleSlotDrop === 'function') {
            if (EngineActionBars.tryHandleSlotDrop(under, currentDrag.item.id)) {
                currentDrag = null;
                document.querySelectorAll('.is-dragging, .drag-over').forEach(function (el) {
                    el.classList.remove('is-dragging', 'drag-over');
                });
                return;
            }
        }
    }
    currentDrag = null;
    document.querySelectorAll('.is-dragging, .drag-over').forEach(function (el) {
        el.classList.remove('is-dragging', 'drag-over');
    });
}

function setDragOver(el) {
    if (typeof document === 'undefined') return;
    const nodes = document.querySelectorAll('.drag-over');
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] !== el) nodes[i].classList.remove('drag-over');
    }
    if (el && el.classList) el.classList.add('drag-over');
}

function catalogMeta(item) {
    if (!item || !item.id) return null;
    return itemCatalog.get(item.id) || null;
}

function itemInOpenContainer(containerUid, index) {
    if (index == null || !containerUid) return null;
    if (bag && bag.containerId === containerUid) return slotAt(bag, index);
    const rec = openBags.get(containerUid);
    if (rec && rec.view) return slotAt(rec.view, index);
    return null;
}

function containerHitFromTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    if (target.closest('#loot-panel, #npc-dialog, #npc-shop')) return null;
    const bagWindow = target.closest('.inv-float-panel[data-container-uid], .inv-float-panel[data-open-bag-uid]');
    const sidebar = target.closest('.game-backpack-panel');
    const surface = bagWindow || sidebar;
    if (!surface) return null;
    let surfaceUid = '';
    if (bagWindow) {
        surfaceUid = bagWindow.getAttribute('data-container-uid') || bagWindow.getAttribute('data-open-bag-uid') || '';
    } else {
        surfaceUid = (bag && bag.containerId) || 'root';
    }
    if (!surfaceUid) surfaceUid = 'root';
    const slot = target.closest('.backpack-slot, .inv-slot');
    let slotIndex = null;
    let slotItem = null;
    let slotEl = null;
    if (slot && typeof surface.contains === 'function' && surface.contains(slot)) {
        const raw = slot.getAttribute('data-slot-index');
        if (raw != null && raw !== '') {
            slotIndex = raw | 0;
            const cid = slot.getAttribute('data-container-uid') || surfaceUid;
            if (cid) surfaceUid = cid;
            slotItem = itemInOpenContainer(surfaceUid, slotIndex);
            if (!slotItem && slot.classList && slot.classList.contains('is-container')) {
                slotItem = {
                    id: slot.getAttribute('data-item-id') || '',
                    flags: 1
                };
            }
            slotEl = slot;
        }
    }
    return {
        surfaceUid: surfaceUid,
        slotIndex: slotIndex,
        slotItem: slotItem,
        slotMeta: catalogMeta(slotItem),
        surfaceEl: surface,
        slotEl: slotEl
    };
}

function modifiersFromEvent(ev) {
    return {
        shift: !!(ev && ev.shiftKey),
        ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)),
        moveStack: !!(mouse && mouse.moveStack)
    };
}

function confirmPlannedAmount(plan, n) {
    if (!plan || !ContainerDrop) return;
    send(C2S.MOVE_ITEM, encodeMoveItem(plan.from, plan.to, ContainerDrop.wireCount(plan.total, n)));
}

function blockDress(item, slot, mode, sourceSlot) {
    if (typeof EngineEquipRules === 'undefined' || !EngineEquipRules.evaluateEquip) return false;
    const decision = EngineEquipRules.evaluateEquip({
        item: item,
        meta: catalogMeta(item),
        slot: slot || '',
        sourceSlot: sourceSlot || '',
        weapon: equipment.weapon || null,
        weaponMeta: catalogMeta(equipment.weapon),
        shield: equipment.shield || null,
        shieldMeta: catalogMeta(equipment.shield),
        player: self ? { level: self.level, vocation: self.vocation || '' } : null,
        mode: mode || 'move'
    });
    if (decision.ok) return false;
    fct(decision.message || 'You cannot dress this object there.');
    return true;
}

function applyPlannedDrop(plan, item) {
    if (!plan || plan.type === 'NONE') return;
    if (plan.type === 'EQUIP' && !plan.slot) return;
    if (plan.type === 'EQUIP') {
        if (blockDress(item, plan.slot, 'equip', '')) return;
        send(C2S.EQUIP, encodeEquip(plan.containerId, plan.index | 0, plan.slot));
        return;
    }
    if (plan.type === 'MODAL') {
        showStackSplitModal({
            max: plan.max,
            item: item,
            label: itemLabel(item && item.id),
            onConfirm: function (n) { confirmPlannedAmount(plan, n); }
        });
        return;
    }
    if (plan.type === 'MOVE_ITEM') {
        if (plan.to && plan.to.kind === 'equipment') {
            const sourceSlot = plan.from && plan.from.kind === 'equipment' ? plan.from.slot : '';
            if (blockDress(item, plan.to.slot, 'move', sourceSlot)) return;
        }
        send(C2S.MOVE_ITEM, encodeMoveItem(plan.from, plan.to, plan.count | 0));
    }
}

function highlightDropTarget(under) {
    if (!under || typeof under.closest !== 'function') {
        setDragOver(null);
        return;
    }
    const hit = containerHitFromTarget(under);
    if (hit && ContainerDrop) {
        const dest = ContainerDrop.resolveContainerDestination({
            surfaceUid: hit.surfaceUid,
            slotIndex: hit.slotIndex,
            slotItem: hit.slotItem,
            slotMeta: hit.slotMeta,
            drag: currentDrag
        });
        const el = dest && dest.highlight === 'slot' && hit.slotEl ? hit.slotEl : hit.surfaceEl;
        setDragOver(el);
        return;
    }
    setDragOver(under.closest('.slot-item, .action-bar-slot, [data-eq-slot]'));
}

function onEquipDrop(ev, targetSlotKey) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    if (!currentDrag) return;
    if (currentDrag.kind === 'ground' && !groundByUid.has(currentDrag.uid)) {
        onDragEnd();
        return;
    }
    const equipped = equipment[targetSlotKey];
    const plan = ContainerDrop ? ContainerDrop.planDrop({
        drag: currentDrag,
        dragMeta: catalogMeta(currentDrag.item),
        paperdoll: {
            targetSlot: targetSlotKey,
            equippedItem: equipped || null,
            equippedMeta: catalogMeta(equipped)
        },
        modifiers: modifiersFromEvent(ev)
    }) : null;
    applyPlannedDrop(plan, currentDrag.item);
    onDragEnd();
}

function resolveStackMoveAmount(opts) {
    if (ContainerDrop && ContainerDrop.resolveStackMoveAmount) {
        return ContainerDrop.resolveStackMoveAmount(opts);
    }
    const o = opts || {};
    let count = Math.floor(Number(o.count));
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count <= 1) return { kind: 'amount', amount: 1 };
    if (o.shift) return { kind: 'amount', amount: 1 };
    const ctrl = !!o.ctrl;
    const moveStack = !!o.moveStack;
    if (ctrl !== moveStack) return { kind: 'amount', amount: count };
    return { kind: 'modal', max: count };
}

function hideStackSplitModal() {
    const el = $('inv-stack-split');
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

function showStackSplitModal(opts) {
    hideStackSplitModal();
    if (typeof document === 'undefined') return;
    const max = Math.max(1, Math.floor(Number(opts.max) || 1));
    const el = document.createElement('div');
    el.id = 'inv-stack-split';
    el.className = 'inv-stack-split-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Move amount');

    const title = document.createElement('div');
    title.className = 'inv-stack-split-title';
    title.textContent = opts.label || itemLabel(opts.item && opts.item.id) || 'Move';

    const row = document.createElement('div');
    row.className = 'inv-stack-split-row';
    const amountEl = document.createElement('span');
    amountEl.className = 'inv-stack-split-amount';
    amountEl.textContent = String(max);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(max);
    slider.value = String(max);
    slider.className = 'inv-stack-split-slider';
    slider.addEventListener('input', function () {
        amountEl.textContent = String(slider.value);
    });
    row.appendChild(slider);
    row.appendChild(amountEl);

    const actions = document.createElement('div');
    actions.className = 'inv-stack-split-actions';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'inv-stack-split-btn inv-stack-split-btn--ok';
    okBtn.textContent = 'Ok';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'inv-stack-split-btn';
    cancelBtn.textContent = 'Cancel';
    function finish(confirm) {
        const n = Math.max(1, Math.min(max, Math.floor(Number(slider.value) || 1)));
        hideStackSplitModal();
        if (confirm && typeof opts.onConfirm === 'function') opts.onConfirm(n);
        else if (!confirm && typeof opts.onCancel === 'function') opts.onCancel();
    }
    okBtn.addEventListener('click', function (e) {
        e.preventDefault();
        finish(true);
    });
    cancelBtn.addEventListener('click', function (e) {
        e.preventDefault();
        finish(false);
    });
    actions.appendChild(okBtn);
    actions.appendChild(cancelBtn);
    el.appendChild(title);
    el.appendChild(row);
    el.appendChild(actions);
    const host = typeof ctxMenuHost === 'function' ? ctxMenuHost() : document.body;
    host.appendChild(el);
    try { slider.focus(); } catch (_e) { /* ignore */ }
}

function moveItemWithSplit(from, to, item, ev) {
    const count = item && item.count > 1 ? (item.count | 0) : 1;
    const decision = resolveStackMoveAmount({
        count: count,
        shift: !!(ev && ev.shiftKey),
        ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)),
        moveStack: !!(mouse && mouse.moveStack)
    });
    function go(n) {
        const sendCount = ContainerDrop
            ? ContainerDrop.wireCount(count, n)
            : ((n >= count) ? 0 : n);
        send(C2S.MOVE_ITEM, encodeMoveItem(from, to, sendCount));
    }
    if (decision.kind === 'amount') {
        go(decision.amount);
        return;
    }
    showStackSplitModal({
        max: decision.max,
        item: item,
        label: itemLabel(item && item.id),
        onConfirm: go
    });
}

function onContainerDrop(ev) {
    ev.preventDefault();
    if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over');
    if (!currentDrag) return;
    const hit = containerHitFromTarget(ev.target);
    if (!hit || !ContainerDrop) {
        onDragEnd();
        return;
    }
    if (currentDrag.kind === 'ground' && !groundByUid.has(currentDrag.uid)) {
        onDragEnd();
        return;
    }
    const plan = ContainerDrop.planDrop({
        drag: currentDrag,
        dragMeta: catalogMeta(currentDrag.item),
        container: hit,
        modifiers: modifiersFromEvent(ev)
    });
    applyPlannedDrop(plan, currentDrag.item);
    onDragEnd();
}

function showEquipMenu(clientX, clientY, item, slotKey) {
    const el = $('ctx-menu');
    if (!el) return;
    hideItemPopover(true);
    el.textContent = '';
    const rows = [
        { label: 'Look', fn: function () { showItemPopover(clientX, clientY, item.id, item.count, true); } },
        {
            label: 'Unequip',
            fn: function () {
                send(C2S.UNEQUIP, encodeUnequip(slotKey));
            }
        }
    ];
    if (equipItemIsContainer(item)) {
        rows.push({
            label: 'Open',
            fn: function () {
                openEquippedContainer(slotKey, item);
            }
        });
    }
    rows.forEach(function (entry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'inv-context-item';
        b.textContent = entry.label;
        b.onclick = function () { hideCtx(); entry.fn(); };
        el.appendChild(b);
    });
    placeCtxMenu(el, clientX, clientY);
}

function currentMouseMode() {
    return mouse && mouse.mouseControlMode != null ? Number(mouse.mouseControlMode) : 1;
}

function playItemMeta(item) {
    if (!item) return null;
    const meta = item.id ? itemCatalog.get(item.id) : null;
    if (!meta) return item;
    return Object.assign({}, meta, item);
}

function containerSlotState(it, containerId, index) {
    const extra = {
        kind: 'container',
        alreadyOpen: false,
        openUid: '',
        isMainBackpackSlot: false
    };
    if (it && InvMouse) {
        const classified = InvMouse.classifyItem(playItemMeta(it));
        if (classified.isContainer) {
            const existing = findExistingOpenBagUid(containerId, index | 0);
            extra.alreadyOpen = !!existing;
            extra.openUid = existing || '';
        }
        return InvMouse.slotFromItem(playItemMeta(it), extra);
    }
    return Object.assign({ empty: !it }, extra);
}

function equipSlotState(it, slotKey) {
    const extra = {
        kind: 'equipment',
        alreadyOpen: false,
        openUid: '',
        isMainBackpackSlot: slotKey === 'backpack',
        slot: slotKey
    };
    if (it && InvMouse) {
        const classified = InvMouse.classifyItem(playItemMeta(it));
        if (classified.isContainer || extra.isMainBackpackSlot) {
            const existing = findExistingOpenBagUid(slotKey, 0);
            extra.alreadyOpen = !!existing;
            extra.openUid = existing || '';
        }
        return InvMouse.slotFromItem(playItemMeta(it), extra);
    }
    return Object.assign({ empty: !it }, extra);
}

function inventoryIntentsFromEvent(ev, button, slotState) {
    if (!InvMouse) return null;
    return InvMouse.processInventoryAction({
        button: button,
        mode: currentMouseMode(),
        modifiers: {
            shift: !!(ev && ev.shiftKey),
            ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)),
            alt: !!(ev && ev.altKey),
            meta: !!(ev && ev.metaKey)
        },
        leftPressed: buttonsDown.left,
        rightPressed: buttonsDown.right,
        slot: slotState
    });
}

function combatIntentsFromEvent(ev, button) {
    if (!InvMouse) return null;
    return InvMouse.processCombatRowAction({
        button: button,
        mode: currentMouseMode(),
        modifiers: {
            shift: !!(ev && ev.shiftKey),
            ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)),
            alt: !!(ev && ev.altKey),
            meta: !!(ev && ev.metaKey)
        },
        leftPressed: buttonsDown.left,
        rightPressed: buttonsDown.right
    });
}

function applyInventoryIntents(intents, ctx) {
    if (!intents || !intents.length) return '';
    const intent = intents[0];
    const type = intent && intent.type ? intent.type : '';
    const item = ctx && ctx.item;
    const x = ctx && ctx.clientX;
    const y = ctx && ctx.clientY;
    if (type === 'IGNORE') return type;
    if (type === 'SELECT') return type;
    if (type === 'LOOK') {
        hideCtx();
        if (item) showItemPopover(x, y, item.id, item.count, true);
        return type;
    }
    if (type === 'OPEN_CONTEXT_MENU') {
        if (ctx.kind === 'equipment') showEquipMenu(x, y, item, ctx.slotKey);
        else showInvMenu(x, y, item, ctx.containerId, ctx.index);
        return type;
    }
    hideCtx();
    if (type === 'OPEN_BAG') {
        if (ctx.kind === 'equipment') {
            openEquippedContainer(ctx.slotKey, item, ctx.originEl);
        } else if (ctx.containerId != null) {
            requestOpenBag(ctx.containerId, ctx.index, item && item.id ? item.id : '', ctx.originEl);
        }
        return type;
    }
    if (type === 'CLOSE_BAG') {
        if (ctx.openUid) requestCloseBag(ctx.openUid);
        return type;
    }
    if (type === 'OPEN_BACKPACK') {
        openSidebarPanel('backpack');
        return type;
    }
    if (type === 'USE_ITEM') {
        if (ctx.kind !== 'equipment' && ctx.containerId != null) {
            if (typeof EngineEquipRules !== 'undefined'
                && EngineEquipRules.itemUseEquips(item, catalogMeta(item))
                && blockDress(item, '', 'equip', '')) {
                return type;
            }
            send(C2S.USE_ITEM, encodeContainerSlot(ctx.containerId, ctx.index));
        }
        return type;
    }
    if (type === 'ENTER_USE_WITH') {
        if (item && item.id) {
            pendingUseWith = item.id;
            fct('Use ' + itemLabel(item.id) + ' with…');
        }
        return type;
    }
    if (type === 'EQUIP') {
        if (ctx.containerId != null) {
            if (blockDress(item, '', 'equip', '')) return type;
            send(C2S.EQUIP, encodeEquip(ctx.containerId, ctx.index, ''));
        }
        return type;
    }
    if (type === 'UNEQUIP') {
        if (ctx.slotKey) send(C2S.UNEQUIP, encodeUnequip(ctx.slotKey));
        return type;
    }
    return type;
}

function setAutoChase(on) {
    autoChase = !!on;
    saveAutoChase(autoChase);
    const box = $('auto-chase');
    if (box) box.checked = autoChase;
    if (autoChase) pumpChase();
    else if (chaseWalk) stopWalk();
}

function enableAutoChaseAndTarget(id) {
    setAutoChase(true);
    selectTarget(id);
}

function hotkeyToken(ev) {
    if (typeof EngineActionBarAssign !== 'undefined' && EngineActionBarAssign.eventToHotkeyString) {
        return EngineActionBarAssign.eventToHotkeyString(ev) || '';
    }
    return '';
}

function generalAction(token) {
    if (!token || !GeneralHotkeys || !generalHotkeys) return '';
    return GeneralHotkeys.match(generalHotkeys, token) || '';
}

function publishGeneralHotkeys() {
    const ui = typeof EngineClientWindow !== 'undefined' && EngineClientWindow.attached
        ? EngineClientWindow.attached()
        : null;
    if (!ui || typeof ui.setGeneralHotkeys !== 'function' || !GeneralHotkeys) return;
    ui.setGeneralHotkeys({
        rows: GeneralHotkeys.rows(generalHotkeys),
        capturing: generalCapture,
        onAdd: function (id) { captureGeneral(id, -1); },
        onReplace: function (id, index) { captureGeneral(id, index); },
        onRemove: function (id, index) {
            generalHotkeys = GeneralHotkeys.removeAt(generalHotkeys, id, index);
            persistGeneralHotkeys();
        },
        onCancel: function () {
            if (typeof EngineActionBarAssign !== 'undefined' && EngineActionBarAssign.cancelHotkeyCapture) {
                EngineActionBarAssign.cancelHotkeyCapture();
            }
            generalCapture = null;
            publishGeneralHotkeys();
        }
    });
}

function persistGeneralHotkeys() {
    generalCapture = null;
    if (typeof saveGeneralHotkeys === 'function') saveGeneralHotkeys(generalHotkeys);
    publishGeneralHotkeys();
}

function commitGeneralHotkey(actionId, index, hotkey) {
    if (!GeneralHotkeys) return;
    generalHotkeys = GeneralHotkeys.setKey(generalHotkeys, actionId, hotkey, index);
    persistGeneralHotkeys();
}

function captureGeneral(actionId, index) {
    const Assign = typeof EngineActionBarAssign !== 'undefined' ? EngineActionBarAssign : null;
    if (!Assign || typeof Assign.beginHotkeyCapture !== 'function') return;
    generalCapture = { actionId: actionId, index: index };
    publishGeneralHotkeys();
    Assign.beginHotkeyCapture(function (hotkey) {
        generalCapture = null;
        if (!hotkey) {
            publishGeneralHotkeys();
            return;
        }
        const Bars = typeof EngineActionBars !== 'undefined' ? EngineActionBars : null;
        const hit = Bars && typeof Bars.findHotkeySlot === 'function' ? Bars.findHotkeySlot(hotkey) : null;
        if (hit) {
            const where = (hit.barId | 0) === 1
                ? ('slot ' + ((hit.index | 0) + 1))
                : ('bar ' + hit.barId + ' slot ' + ((hit.index | 0) + 1));
            if (typeof Assign.openOverwriteConfirm === 'function') {
                Assign.openOverwriteConfirm(
                    'Already on <strong>' + where + '</strong>. Ok steals the binding.',
                    function () {
                        if (Bars.clearSlotHotkey) Bars.clearSlotHotkey(hit.barId, hit.index);
                        commitGeneralHotkey(actionId, index, hotkey);
                    }
                );
            }
            publishGeneralHotkeys();
            return;
        }
        commitGeneralHotkey(actionId, index, hotkey);
    }, { allowEscape: true });
}

function loadGeneralHotkeyDoc() {
    if (!GeneralHotkeys || typeof loadGeneralHotkeys !== 'function') {
        publishGeneralHotkeys();
        return;
    }
    loadGeneralHotkeys().then(function (row) {
        generalHotkeys = GeneralHotkeys.normalize(row);
        publishGeneralHotkeys();
    }).catch(function () {
        generalHotkeys = GeneralHotkeys.defaults();
        publishGeneralHotkeys();
    });
}

function applyCombatIntents(intents, row, clientX, clientY) {
    if (!intents || !intents.length) return '';
    const type = intents[0] && intents[0].type ? intents[0].type : '';
    if (type === 'LOOK') {
        hideCtx();
        fct(row && row.name ? row.name : 'Creature');
        return type;
    }
    if (type === 'SET_TARGET') {
        selectTarget(row.id);
        return type;
    }
    if (type === 'AUTO_CHASE') {
        enableAutoChaseAndTarget(row.id);
        return type;
    }
    if (type === 'OPEN_CONTEXT_MENU') {
        showCombatMenu(clientX, clientY, row);
        return type;
    }
    return type;
}

function showCombatMenu(clientX, clientY, row) {
    const el = $('ctx-menu');
    if (!el || !row) return;
    hideItemPopover(true);
    el.textContent = '';
    const entries = InvMouse && typeof InvMouse.buildCombatContextMenuEntries === 'function'
        ? InvMouse.buildCombatContextMenuEntries()
        : [
            { action: 'ATTACK', label: 'Attack' },
            { action: 'LOOK', label: 'Look' },
            { action: 'CHASE', label: 'Chase' }
        ];
    entries.forEach(function (entry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'inv-context-item';
        b.textContent = entry.label;
        b.onclick = function () {
            hideCtx();
            if (entry.action === 'LOOK') fct(row.name || 'Creature');
            else if (entry.action === 'CHASE') enableAutoChaseAndTarget(row.id);
            else selectTarget(row.id);
        };
        el.appendChild(b);
    });
    placeCtxMenu(el, clientX, clientY);
}

function slotLookChord(ev, button, slotState, ctx) {
    if (!InvMouse || !InvMouse.isClassicLookChord) return false;
    if (!InvMouse.isClassicLookChord({
        mode: currentMouseMode(),
        button: button,
        leftPressed: buttonsDown.left,
        rightPressed: buttonsDown.right
    })) {
        return false;
    }
    ev.preventDefault();
    suppressNextSlotClick = true;
    suppressNextContextMenu = true;
    applyInventoryIntents([{ type: slotState && !slotState.empty ? 'LOOK' : 'IGNORE' }], ctx);
    return true;
}

/** Slot count from BAG/INVENTORY capacity. Do not pad small containers (quiver=6) to 20. */
function gridCapacity(view) {
    if (!view || view.capacity == null) return BACKPACK_SLOTS;
    const n = Number(view.capacity);
    if (n !== n) return BACKPACK_SLOTS;
    return Math.max(0, Math.min(255, n | 0));
}

function paintGrid(el, view, selectedIndex, kind) {
    if (!el) return;
    const cap = gridCapacity(view);
    const containerId = (view && view.containerId) ? view.containerId : '';

    while (el.children.length < cap) {
        const s = document.createElement('div');
        s.className = 'backpack-slot inv-slot';
        s.dataset.slotIndex = String(el.children.length);
        s.dataset.containerUid = containerId;
        el.appendChild(s);
    }
    while (el.children.length > cap) {
        el.removeChild(el.lastChild);
    }

    for (let i = 0; i < cap; i++) {
        const slot = el.children[i];
        slot.className = 'backpack-slot inv-slot';
        slot.dataset.slotIndex = String(i);
        slot.dataset.containerUid = containerId;
        const it = slotAt(view, i);

        slot.innerHTML = '';
        if (it) {
            slot.classList.add('is-filled');
            slot.setAttribute('draggable', 'true');
            slot.dataset.itemId = it.id;
            if (i === selectedIndex) slot.classList.add('is-selected');
            if (equipItemIsContainer(it)) slot.classList.add('is-container');

            const tooltip = formatItemTooltip(it.id, it.count);
            slot.title = tooltip;
            bindItemPopover(slot, it.id, it.count);

            const img = document.createElement('img');
            img.src = resolveItemSpriteUrl(it.id, 'rpg_fantasy');
            img.alt = itemLabel(it.id);
            img.title = tooltip;
            img.draggable = false;
            img.onerror = function () {
                this.style.display = 'none';
                if (!slot.querySelector('.slot-label')) {
                    const fallback = document.createElement('span');
                    fallback.className = 'slot-label';
                    fallback.textContent = itemLabel(it.id).slice(0, 6);
                    slot.appendChild(fallback);
                }
            };
            slot.appendChild(img);

            if (it.count > 1) {
                const c = document.createElement('span');
                c.className = 'inv-stack-count';
                c.textContent = String(it.count);
                slot.appendChild(c);
            }
        } else {
            slot.classList.remove('is-filled', 'is-selected', 'is-container');
            slot.setAttribute('draggable', 'false');
            delete slot.dataset.itemId;
            slot.title = 'Empty slot';
            bindItemPopover(slot, null);
        }

        slot.onpointerdown = function (ev) {
            if (ev.button === 0) buttonsDown.left = true;
            if (ev.button === 2) buttonsDown.right = true;
            if (ev.button !== 0) return;
            const state = containerSlotState(it, containerId, i);
            slotLookChord(ev, 'left', state, {
                kind: 'container',
                item: it,
                containerId: containerId,
                index: i,
                originEl: slot,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
        };

        slot.onclick = function (ev) {
            ev.preventDefault();
            if (suppressNextSlotClick) {
                suppressNextSlotClick = false;
                return;
            }
            const state = containerSlotState(it, containerId, i);
            const intents = inventoryIntentsFromEvent(ev, 'left', state);
            const applied = applyInventoryIntents(intents, {
                kind: 'container',
                item: it,
                containerId: containerId,
                index: i,
                originEl: slot,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
            if (applied === 'OPEN_CONTEXT_MENU') {
                ev.stopPropagation();
                return;
            }
            if (applied && applied !== 'SELECT' && applied !== '') return;
            if (kind === 'bag') {
                selectedBag = it ? (selectedBag === i ? -1 : i) : -1;
                selectedEquipSlot = null;
                renderBag();
                renderEquipment();
            } else if (kind === 'nested') {
                const rec = containerId ? openBags.get(containerId) : null;
                if (rec) rec.selected = it ? (rec.selected === i ? -1 : i) : -1;
                selectedOpenBag = rec ? rec.selected : -1;
                renderBag();
            }
        };

        slot.ondblclick = function (ev) {
            ev.preventDefault();
            if (!it || !containerId) return;
            if (it.flags & 1) {
                requestOpenBag(containerId, i, it.id || '', slot);
            } else {
                send(C2S.USE_ITEM, encodeContainerSlot(containerId, i));
            }
        };

        slot.oncontextmenu = function (ev) {
            ev.preventDefault();
            if (suppressNextContextMenu) {
                suppressNextContextMenu = false;
                return;
            }
            if (!it) return;
            if (kind === 'bag') {
                selectedBag = i;
                renderBag();
            } else if (kind === 'nested') {
                const rec = containerId ? openBags.get(containerId) : null;
                if (rec) rec.selected = i;
                selectedOpenBag = i;
                renderBag();
            }
            const state = containerSlotState(it, containerId, i);
            const intents = inventoryIntentsFromEvent(ev, 'right', state);
            if (!intents) {
                showInvMenu(ev.clientX, ev.clientY, it, containerId, i);
                return;
            }
            applyInventoryIntents(intents, {
                kind: 'container',
                item: it,
                containerId: containerId,
                index: i,
                originEl: slot,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
        };

        slot.ondragstart = function (ev) {
            if (!it) {
                ev.preventDefault();
                return;
            }
            onSlotDragStart(ev, containerId, i, it);
        };
        slot.ondragend = onDragEnd;
    }
}

function refreshActionBarSlots() {
    if (typeof EngineActionBars !== 'undefined' && typeof EngineActionBars.refreshSlots === 'function') {
        EngineActionBars.refreshSlots();
    }
}

function renderBag() {
    paintGrid($('backpackGrid'), bag, selectedBag, 'bag');
    openBags.forEach(function (rec) {
        if (!rec.panel) rec.panel = createFloatBagPanel(rec.view && rec.view.containerId);
        if (!rec.panel) return;
        rec.panel.hidden = false;
        const parts = bagPanelParts(rec.panel);
        if (parts.title) parts.title.textContent = itemLabel(rec.itemId) || 'Bag';
        if (parts.count) {
            const filledCount = rec.view && rec.view.slots ? rec.view.slots.length : 0;
            parts.count.textContent = '(' + filledCount + '/' + gridCapacity(rec.view) + ')';
        }
        paintGrid(parts.grid, rec.view, rec.selected, 'nested');
        if (!rec.placed) {
            placeNewFloat(rec.panel, pendingOpenBagAnchor || { origin: 'slot' });
            rec.placed = true;
            pendingOpenBagAnchor = null;
        }
    });
    syncFloatRootAria();
    refreshActionBarSlots();
}

function renderEquipment() {
    const card = $('activeEquipmentCard');
    if (!card) return;
    const nodes = card.querySelectorAll('.slot-item');
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const key = el.getAttribute('data-slot');
        const it = equipment[key];
        el.innerHTML = '';
        if (it) {
            el.classList.add('is-filled', 'inv-equip-slot');
            el.classList.toggle('is-container', equipItemIsContainer(it));
            el.classList.toggle('is-selected', selectedEquipSlot === key);
            el.setAttribute('draggable', 'true');
            el.dataset.itemId = it.id;
            const tooltip = formatItemTooltip(it.id, it.count);
            el.title = tooltip;
            bindItemPopover(el, it.id, it.count);

            const img = document.createElement('img');
            img.src = resolveItemSpriteUrl(it.id, 'rpg_fantasy');
            img.alt = itemLabel(it.id);
            img.title = tooltip;
            img.draggable = false;
            img.onerror = function () {
                this.style.display = 'none';
                if (!el.querySelector('.slot-label')) {
                    const fallback = document.createElement('span');
                    fallback.className = 'slot-label';
                    fallback.textContent = itemLabel(it.id).slice(0, 6);
                    el.appendChild(fallback);
                }
            };
            el.appendChild(img);
        } else {
            el.classList.remove('is-filled', 'inv-equip-slot', 'is-selected', 'is-container');
            el.setAttribute('draggable', 'false');
            delete el.dataset.itemId;
            el.title = el.getAttribute('title') || key;
            el.innerHTML = '<span class="slot-placeholder">' + (SLOT_PLACEHOLDERS[key] || '') + '</span>';
            bindItemPopover(el, null);
        }

        el.ondragstart = function (ev) {
            if (!it) {
                ev.preventDefault();
                return;
            }
            onEquipDragStart(ev, key);
        };
        el.ondragover = onDragOver;
        el.ondragleave = onDragLeave;
        el.ondrop = function (ev) {
            onEquipDrop(ev, key);
        };
        el.ondragend = onDragEnd;

        el.onpointerdown = function (ev) {
            if (ev.button === 0) buttonsDown.left = true;
            if (ev.button === 2) buttonsDown.right = true;
            if (ev.button !== 0 || !key || key === 'light') return;
            const state = equipSlotState(it, key);
            slotLookChord(ev, 'left', state, {
                kind: 'equipment',
                item: it,
                slotKey: key,
                originEl: el,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
        };

        el.onclick = function (ev) {
            ev.preventDefault();
            if (suppressNextSlotClick) {
                suppressNextSlotClick = false;
                return;
            }
            if (!key || key === 'light') return;
            const state = equipSlotState(it, key);
            const intents = inventoryIntentsFromEvent(ev, 'left', state);
            const applied = applyInventoryIntents(intents, {
                kind: 'equipment',
                item: it,
                slotKey: key,
                originEl: el,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
            if (applied === 'OPEN_CONTEXT_MENU') {
                ev.stopPropagation();
                return;
            }
            if (applied && applied !== 'SELECT' && applied !== '') return;
            if (it) {
                selectedEquipSlot = (selectedEquipSlot === key ? null : key);
                selectedBag = -1;
                renderEquipment();
                renderBag();
            } else if (selectedBag >= 0 && bag && bag.containerId) {
                const picked = slotAt(bag, selectedBag);
                if (picked && blockDress(picked, key, 'equip', '')) return;
                send(C2S.EQUIP, encodeEquip(bag.containerId, selectedBag, key));
            }
        };

        el.ondblclick = function (ev) {
            ev.preventDefault();
            if (!key || key === 'light' || !it) return;
            if (equipItemIsContainer(it)) {
                openEquippedContainer(key, it);
                return;
            }
            send(C2S.UNEQUIP, encodeUnequip(key));
        };

        el.oncontextmenu = function (ev) {
            ev.preventDefault();
            if (suppressNextContextMenu) {
                suppressNextContextMenu = false;
                return;
            }
            if (!it) return;
            selectedEquipSlot = key;
            renderEquipment();
            const state = equipSlotState(it, key);
            const intents = inventoryIntentsFromEvent(ev, 'right', state);
            if (!intents) {
                showEquipMenu(ev.clientX, ev.clientY, it, key);
                return;
            }
            applyInventoryIntents(intents, {
                kind: 'equipment',
                item: it,
                slotKey: key,
                originEl: el,
                openUid: state.openUid,
                clientX: ev.clientX,
                clientY: ev.clientY
            });
        };
    }
    const capEl = $('activeEqCap');
    if (capEl) {
        capEl.textContent = capVal != null ? String(capVal) : '—';
        const capTip = capVal != null && capMax != null
            ? 'You have ' + capVal + ' of ' + capMax + ' capacity left'
            : '';
        capEl.title = capTip;
        if (capEl.parentNode) capEl.parentNode.title = capTip;
    }
    const soulEl = $('activeEqSoul');
    if (soulEl) soulEl.textContent = '100';
    renderFoodStatus();
    refreshActionBarSlots();
}


function renderDialog(text, replies) {
    const panel = $('npc-dialog');
    const body = $('dialog-body');
    if (!panel || !body) return;
    body.textContent = '';
    const t = document.createElement('div');
    t.className = 'inv-npc-dialog-text mb-2';
    t.textContent = text;
    body.appendChild(t);
    const repList = document.createElement('div');
    repList.className = 'inv-npc-dialog-replies';
    replies.forEach(function (label, index) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'inv-npc-dialog-reply btn-retro';
        b.textContent = label;
        b.onclick = function () {
            const p = new Uint8Array(5);
            new DataView(p.buffer).setUint32(0, talkNpc >>> 0, true);
            p[4] = index;
            send(C2S.TALK_REPLY, p);
        };
        repList.appendChild(b);
    });
    body.appendChild(repList);
    const wasHidden = panel.hidden;
    panel.hidden = false;
    if (wasHidden || !panel.style || !panel.style.left || !panel.style.top) {
        placeFloat(panel, talkNpc);
    }
}

function makeItemSprite(itemId) {
    const img = document.createElement('img');
    img.src = resolveItemSpriteUrl(itemId, visualGenre());
    img.alt = itemLabel(itemId);
    img.draggable = false;
    img.onerror = function () { this.style.display = 'none'; };
    return img;
}

function makeItemRow(opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'inv-item-row ' + (opts.className || '');
    b.appendChild(makeItemSprite(opts.itemId));
    const text = document.createElement('span');
    text.className = 'inv-item-row-label';
    text.textContent = opts.label;
    b.appendChild(text);
    if (opts.badge) {
        const badge = document.createElement('span');
        badge.className = 'badge-retro';
        badge.textContent = opts.badge;
        b.appendChild(badge);
    }
    bindItemPopover(b, opts.itemId, opts.count || 1);
    if (opts.onclick) b.onclick = opts.onclick;
    return b;
}

function ensureShopUiState(npcId) {
    if (!shopUiState || String(shopUiState.npcId) !== String(npcId)) {
        shopUiState = {
            npcId: npcId,
            side: 'buy',
            search: '',
            selectedItemId: null,
            amount: 1
        };
    }
}

function isGroundOpenBag(rec) {
    if (!rec) return false;
    const groundIndex = typeof OPEN_BAG_SELF_INDEX !== 'undefined' ? OPEN_BAG_SELF_INDEX : 255;
    let cur = rec;
    const seen = new Set();
    while (cur && cur.openedFrom) {
        if ((cur.openedFrom.index | 0) === groundIndex) return true;
        const parentId = cur.openedFrom.containerId;
        if (!parentId || seen.has(parentId)) break;
        seen.add(parentId);
        if (typeof bag !== 'undefined' && bag && parentId === bag.containerId) return false;
        if (typeof equipment !== 'undefined' && equipment && equipment[parentId]) return false;
        cur = typeof openBags !== 'undefined' && openBags && typeof openBags.get === 'function' ? openBags.get(parentId) : null;
    }
    return false;
}

function walkPlayerContainers(fn) {
    if (typeof fn !== 'function') return;
    const visitedUids = new Set();
    const queue = [];

    function enqueue(uid) {
        if (!uid || visitedUids.has(uid)) return;
        visitedUids.add(uid);
        let view = null;
        if (typeof containerCache !== 'undefined' && containerCache && typeof containerCache.get === 'function') {
            view = containerCache.get(uid);
        }
        if (!view && typeof openBags !== 'undefined' && openBags && typeof openBags.get === 'function') {
            const rec = openBags.get(uid);
            view = (rec && rec.view) ? rec.view : rec;
        }
        if (view && Array.isArray(view.slots)) {
            queue.push(view);
        }
    }

    // 1. Containers inside main backpack
    if (typeof bag !== 'undefined' && bag && Array.isArray(bag.slots)) {
        for (let i = 0; i < bag.slots.length; i++) {
            const s = bag.slots[i];
            if (!s) continue;
            if ((s.flags & 1) || (typeof equipItemIsContainer === 'function' && equipItemIsContainer(s))) {
                const key = bag.containerId + ':' + s.index;
                const childUid = typeof containerSlotMap !== 'undefined' && containerSlotMap ? containerSlotMap.get(key) : null;
                if (childUid) enqueue(childUid);
            }
        }
    }

    // 2. Open bags (excluding ground bags)
    if (typeof openBags !== 'undefined' && openBags && typeof openBags.values === 'function') {
        for (const ob of openBags.values()) {
            if (!ob) continue;
            if (typeof isGroundOpenBag === 'function' && isGroundOpenBag(ob)) continue;
            const view = (ob && ob.view) ? ob.view : ob;
            if (view && view.containerId) enqueue(view.containerId);
        }
    }

    // 3. Fallback: cached containers linked to known tree
    if (typeof containerCache !== 'undefined' && containerCache && typeof containerCache.values === 'function') {
        for (const view of containerCache.values()) {
            if (view && view.parentContainerId && ((typeof bag !== 'undefined' && bag && view.parentContainerId === bag.containerId) || visitedUids.has(view.parentContainerId))) {
                enqueue(view.containerId);
            }
        }
    }

    // 4. BFS traversal for deeper nesting
    while (queue.length > 0) {
        const view = queue.shift();
        if (!view) continue;
        fn(view);

        if (Array.isArray(view.slots)) {
            for (let i = 0; i < view.slots.length; i++) {
                const s = view.slots[i];
                if (!s) continue;
                if ((s.flags & 1) || (typeof equipItemIsContainer === 'function' && equipItemIsContainer(s))) {
                    const key = view.containerId + ':' + s.index;
                    const childUid = typeof containerSlotMap !== 'undefined' && containerSlotMap ? containerSlotMap.get(key) : null;
                    if (childUid) enqueue(childUid);
                }
            }
        }
    }
}

function countPlayerItem(itemId) {
    const id = String(itemId || '');
    if (!id) return 0;
    let n = 0;
    if (typeof bag !== 'undefined' && bag && Array.isArray(bag.slots)) {
        for (let i = 0; i < bag.slots.length; i++) {
            const s = bag.slots[i];
            if (s && s.id === id) n += (s.count | 0) > 0 ? (s.count | 0) : 1;
        }
    }
    walkPlayerContainers(function (view) {
        if (!view || !Array.isArray(view.slots)) return;
        const cid = view.containerId;
        if (typeof bag !== 'undefined' && bag && cid && cid === bag.containerId) return;
        for (let i = 0; i < view.slots.length; i++) {
            const s = view.slots[i];
            if (s && s.id === id) n += (s.count | 0) > 0 ? (s.count | 0) : 1;
        }
    });
    return n;
}

function predictConsumeFromInventory(itemId, count) {
    const id = String(itemId || '');
    let need = Math.max(0, Math.floor(Number(count) || 0));
    if (!id || need <= 0) return;

    if (typeof bag !== 'undefined' && bag && Array.isArray(bag.slots)) {
        for (let i = 0; i < bag.slots.length && need > 0; i++) {
            const s = bag.slots[i];
            if (s && s.id === id) {
                const have = (s.count | 0) > 0 ? (s.count | 0) : 1;
                const take = Math.min(have, need);
                s.count = have - take;
                need -= take;
                if (s.count <= 0) {
                    bag.slots.splice(i, 1);
                    i--;
                }
            }
        }
    }

    if (need > 0) {
        walkPlayerContainers(function (view) {
            if (need <= 0 || !view || !Array.isArray(view.slots)) return;
            const cid = view.containerId;
            if (typeof bag !== 'undefined' && bag && cid && cid === bag.containerId) return;
            for (let i = 0; i < view.slots.length && need > 0; i++) {
                const s = view.slots[i];
                if (s && s.id === id) {
                    const have = (s.count | 0) > 0 ? (s.count | 0) : 1;
                    const take = Math.min(have, need);
                    s.count = have - take;
                    need -= take;
                    if (s.count <= 0) {
                        view.slots.splice(i, 1);
                        i--;
                    }
                }
            }
        });
    }

    if (typeof renderBag === 'function') {
        renderBag();
    }
}

function makeShopRow(row, side) {
    const rowEl = document.createElement('div');
    rowEl.className = 'inv-npc-shop-row';
    rowEl.dataset.itemId = row.itemId;
    rowEl.dataset.shopSide = side;

    const img = makeItemSprite(row.itemId);
    img.className = 'inv-npc-shop-icon';
    rowEl.appendChild(img);

    const name = document.createElement('span');
    name.className = 'inv-npc-shop-name';
    name.textContent = (NpcShopUi && typeof NpcShopUi.shopItemLabel === 'function')
        ? NpcShopUi.shopItemLabel(row.itemId, itemLabel)
        : itemLabel(row.itemId);
    rowEl.appendChild(name);

    const price = document.createElement('span');
    price.className = 'inv-npc-shop-price';
    price.textContent = String(side === 'sell' ? row.sell : row.buy);
    rowEl.appendChild(price);

    if (side === 'sell') {
        const have = document.createElement('span');
        have.className = 'inv-npc-shop-have';
        have.textContent = String(countPlayerItem(row.itemId));
        rowEl.appendChild(have);
    }

    bindItemPopover(rowEl, row.itemId, 1);
    return rowEl;
}

function makeShopDeal() {
    const root = document.createElement('div');
    root.className = 'inv-npc-shop-deal';

    const amountRow = document.createElement('div');
    amountRow.className = 'inv-npc-shop-amount-row';

    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'inv-npc-shop-amount-dec';
    dec.setAttribute('aria-label', 'Decrease amount');
    dec.textContent = '\u2212';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'inv-npc-shop-amount-slider';
    slider.min = '1';
    slider.max = '1';
    slider.value = '1';
    slider.step = '1';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'inv-npc-shop-amount-input';
    amountInput.min = '1';
    amountInput.value = '1';
    amountInput.setAttribute('aria-label', 'Amount');

    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'inv-npc-shop-amount-inc';
    inc.setAttribute('aria-label', 'Increase amount');
    inc.textContent = '+';

    amountRow.appendChild(dec);
    amountRow.appendChild(slider);
    amountRow.appendChild(amountInput);
    amountRow.appendChild(inc);
    root.appendChild(amountRow);

    const meta = document.createElement('div');
    meta.className = 'inv-npc-shop-deal-meta';

    function addDealMetaRow(parent, label, valueClass) {
        const row = document.createElement('div');
        row.className = 'inv-npc-shop-deal-row';
        const lab = document.createElement('span');
        lab.className = 'inv-npc-shop-deal-label';
        lab.textContent = label;
        const val = document.createElement('span');
        val.className = valueClass;
        val.textContent = '—';
        row.appendChild(lab);
        row.appendChild(val);
        parent.appendChild(row);
        return val;
    }

    const price = addDealMetaRow(meta, 'Price', 'inv-npc-shop-unit-price');
    const total = addDealMetaRow(meta, 'Total', 'inv-npc-shop-total');

    const currency = document.createElement('div');
    currency.className = 'inv-npc-shop-deal-row inv-npc-shop-currency';
    const curLabel = document.createElement('span');
    curLabel.className = 'inv-npc-shop-deal-label';
    const curVal = document.createElement('span');
    curVal.className = 'inv-npc-shop-currency-val';
    currency.appendChild(curLabel);
    currency.appendChild(curVal);
    meta.appendChild(currency);
    root.appendChild(meta);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'inv-npc-shop-confirm inv-npc-shop-buy';
    confirm.textContent = 'Buy';
    root.appendChild(confirm);

    return {
        root,
        amountRow,
        dec,
        slider,
        amountInput,
        inc,
        price,
        total,
        currency,
        currencyLabel: curLabel,
        currencyVal: curVal,
        confirm
    };
}

function buildShopUi(panel, body) {
    if (!panel || !body || !currentShop) return;
    body.textContent = '';

    const shop = currentShop;
    const ui = shopUiState;

    const shopEl = document.createElement('div');
    shopEl.className = 'inv-npc-shop';

    const tabs = document.createElement('div');
    tabs.className = 'inv-npc-shop-tabs';
    tabs.setAttribute('role', 'tablist');

    function makeShopTab(side, active) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'inv-npc-shop-tab' + (active ? ' is-active' : '');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-pressed', active ? 'true' : 'false');
        tab.dataset.shopSide = side;
        tab.textContent = side === 'sell' ? 'Sell' : 'Buy';
        tab.addEventListener('click', () => {
            if (ui.side === side) return;
            ui.side = side;
            ui.search = '';
            ui.selectedItemId = null;
            ui.amount = 1;
            if (side === 'sell' && typeof checkAndFetchSubContainers === 'function') {
                checkAndFetchSubContainers();
            }
            buildShopUi(panel, body);
        });
        return tab;
    }

    tabs.appendChild(makeShopTab('buy', ui.side === 'buy'));
    tabs.appendChild(makeShopTab('sell', ui.side === 'sell'));
    shopEl.appendChild(tabs);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'inv-npc-shop-search';
    search.placeholder = 'Search';
    search.setAttribute('aria-label', 'Search');
    search.value = ui.search || '';
    shopEl.appendChild(search);

    const listEl = document.createElement('div');
    listEl.className = 'inv-npc-shop-list';
    shopEl.appendChild(listEl);

    const deal = makeShopDeal();
    shopEl.appendChild(deal.root);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'inv-npc-shop-back';
    back.textContent = 'Back';
    back.addEventListener('click', () => {
        const shopP = $('npc-shop');
        let inheritedPos = null;
        if (shopP && !shopP.hidden && shopP.style && shopP.style.left && shopP.style.top) {
            inheritedPos = { left: shopP.style.left, top: shopP.style.top };
        }
        hideFloat('npc-shop');
        shopNpc = 0;
        shopUiState = null;
        currentShop = null;
        if (talkNpc) {
            const diag = $('npc-dialog');
            if (diag) {
                if (inheritedPos && diag.style) {
                    diag.hidden = false;
                    diag.style.left = inheritedPos.left;
                    diag.style.top = inheritedPos.top;
                } else {
                    placeFloat(diag, talkNpc);
                }
            }
        }
    });
    shopEl.appendChild(back);

    body.appendChild(shopEl);

    function sideRows() {
        const list = shop ? shop.items : [];
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (!it) continue;
            if (ui.side === 'buy' && it.buy > 0) out.push(it);
            else if (ui.side === 'sell' && it.sell > 0) out.push(it);
        }
        return out;
    }

    function visibleRows() {
        if (NpcShopUi && typeof NpcShopUi.filterShopRowsByName === 'function') {
            return NpcShopUi.filterShopRowsByName(sideRows(), ui.search, itemLabel);
        }
        const q = String(ui.search || '').trim().toLowerCase();
        const rows = sideRows();
        if (!q) return rows;
        return rows.filter((r) => {
            const id = String(r.itemId || '').toLowerCase();
            const label = itemLabel(r.itemId).toLowerCase();
            return id.includes(q) || label.includes(q);
        });
    }

    function selectedRow() {
        const rows = visibleRows();
        if (ui.selectedItemId) {
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].itemId === ui.selectedItemId) return rows[i];
            }
        }
        return rows[0] || null;
    }

    function currentMax() {
        if (NpcShopUi && typeof NpcShopUi.shopDealMax === 'function') {
            return NpcShopUi.shopDealMax(countPlayerItem, shop, selectedRow(), ui.side);
        }
        return 1;
    }

    function unitPrice(row) {
        if (!row) return 0;
        return ui.side === 'sell' ? (row.sell | 0) : (row.buy | 0);
    }

    function canAfford(row) {
        if (!row) return false;
        if (NpcShopUi && typeof NpcShopUi.canAffordShopRow === 'function') {
            return NpcShopUi.canAffordShopRow(countPlayerItem, shop, row, ui.side);
        }
        if (ui.side === 'sell') return countPlayerItem(row.itemId) > 0;
        return countPlayerItem(shop.currency) >= unitPrice(row);
    }

    function applyAmount(n) {
        const max = currentMax();
        const clampFn = (NpcShopUi && typeof NpcShopUi.clampShopAmount === 'function')
            ? NpcShopUi.clampShopAmount
            : (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || lo));
        ui.amount = clampFn(n, 1, max);
        deal.slider.min = '1';
        deal.slider.max = String(max);
        deal.slider.value = String(ui.amount);
        deal.amountInput.min = '1';
        deal.amountInput.max = String(max);
        deal.amountInput.value = String(ui.amount);

        const row = selectedRow();
        const unit = unitPrice(row);
        deal.price.textContent = row ? String(unit) : '—';
        deal.total.textContent = row ? String(unit * ui.amount) : '—';
        const coinLabel = itemLabel(shop.currency) || shop.currency;
        if (deal.currencyLabel && deal.currencyVal) {
            deal.currencyLabel.textContent = coinLabel + ': ';
            deal.currencyVal.textContent = String(countPlayerItem(shop.currency));
        } else {
            deal.currency.textContent = coinLabel + ': ' + String(countPlayerItem(shop.currency));
        }

        const sideClass = ui.side === 'sell' ? 'inv-npc-shop-sell' : 'inv-npc-shop-buy';
        deal.confirm.className = 'inv-npc-shop-confirm ' + sideClass;
        deal.confirm.textContent = ui.side === 'sell' ? 'Sell' : 'Buy';
        deal.confirm.dataset.shopSide = ui.side;
        if (row) {
            deal.confirm.dataset.itemId = row.itemId;
            deal.confirm.disabled = false;
        } else {
            deal.confirm.dataset.itemId = '';
            deal.confirm.disabled = true;
        }
    }

    function refreshList() {
        const rows = visibleRows();
        const prevId = ui.selectedItemId;
        const picked = selectedRow();
        ui.selectedItemId = picked ? picked.itemId : null;
        if (picked && picked.itemId !== prevId) {
            const defFn = (NpcShopUi && typeof NpcShopUi.defaultShopAmount === 'function')
                ? NpcShopUi.defaultShopAmount
                : (side, cap) => (side === 'sell' ? cap : 1);
            ui.amount = defFn(ui.side, currentMax());
        }
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'inv-npc-shop-empty';
            empty.textContent = ui.search ? 'No matching items.' : (ui.side === 'sell' ? 'Nothing to sell.' : 'Nothing to buy.');
            listEl.appendChild(empty);
        }
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowEl = makeShopRow(row, ui.side);
            if (picked && row.itemId === picked.itemId) {
                rowEl.classList.add('is-selected');
            }
            if (!canAfford(row)) {
                rowEl.classList.add('is-unaffordable');
            }
            rowEl.addEventListener('click', () => {
                const same = ui.selectedItemId === row.itemId;
                ui.selectedItemId = row.itemId;
                if (!same) {
                    const defFn = (NpcShopUi && typeof NpcShopUi.defaultShopAmount === 'function')
                        ? NpcShopUi.defaultShopAmount
                        : (side, cap) => (side === 'sell' ? cap : 1);
                    ui.amount = defFn(ui.side, currentMax());
                }
                refreshList();
            });
            listEl.appendChild(rowEl);
        }
        applyAmount(ui.amount);
    }

    search.addEventListener('input', () => {
        ui.search = search.value != null ? String(search.value) : '';
        refreshList();
    });
    search.addEventListener('change', () => {
        ui.search = search.value != null ? String(search.value) : '';
        refreshList();
    });

    deal.slider.addEventListener('input', () => {
        applyAmount(deal.slider.value);
    });
    deal.amountInput.addEventListener('input', () => {
        applyAmount(deal.amountInput.value);
    });
    deal.amountInput.addEventListener('change', () => {
        applyAmount(deal.amountInput.value);
    });
    deal.amountInput.addEventListener('keydown', (ev) => {
        const key = ev && ev.key;
        if (key !== 'ArrowUp' && key !== 'Up' && key !== 'ArrowDown' && key !== 'Down') {
            return;
        }
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        const dir = (key === 'ArrowDown' || key === 'Down') ? -1 : 1;
        const deltaFn = (NpcShopUi && typeof NpcShopUi.applyShopAmountDelta === 'function')
            ? NpcShopUi.applyShopAmountDelta
            : (curr, d) => Math.max(1, curr + d);
        applyAmount(deltaFn(ui.amount, dir, ev, 1, currentMax()));
    });
    deal.dec.addEventListener('click', (ev) => {
        const deltaFn = (NpcShopUi && typeof NpcShopUi.applyShopAmountDelta === 'function')
            ? NpcShopUi.applyShopAmountDelta
            : (curr, d) => Math.max(1, curr + d);
        applyAmount(deltaFn(ui.amount, -1, ev, 1, currentMax()));
    });
    deal.inc.addEventListener('click', (ev) => {
        const deltaFn = (NpcShopUi && typeof NpcShopUi.applyShopAmountDelta === 'function')
            ? NpcShopUi.applyShopAmountDelta
            : (curr, d) => Math.max(1, curr + d);
        applyAmount(deltaFn(ui.amount, 1, ev, 1, currentMax()));
    });
    deal.amountRow.addEventListener('wheel', (ev) => {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        const dir = ev && ev.deltaY < 0 ? 1 : -1;
        const deltaFn = (NpcShopUi && typeof NpcShopUi.applyShopAmountDelta === 'function')
            ? NpcShopUi.applyShopAmountDelta
            : (curr, d) => Math.max(1, curr + d);
        applyAmount(deltaFn(ui.amount, dir, ev, 1, currentMax()));
    }, { passive: false });

    deal.confirm.addEventListener('click', () => {
        const row = selectedRow();
        if (!row) return;
        const opcode = ui.side === 'sell' ? C2S.SHOP_SELL : C2S.SHOP_BUY;
        if (ui.side === 'sell' && typeof predictConsumeFromInventory === 'function') {
            predictConsumeFromInventory(row.itemId, ui.amount);
        }
        send(opcode, encodeStrPayload(shopNpc, ui.amount, row.itemId));
    });

    if (!ui.selectedItemId) {
        const first = visibleRows()[0];
        if (first) {
            ui.selectedItemId = first.itemId;
            const defFn = (NpcShopUi && typeof NpcShopUi.defaultShopAmount === 'function')
                ? NpcShopUi.defaultShopAmount
                : (side, cap) => (side === 'sell' ? cap : 1);
            ui.amount = defFn(ui.side, currentMax());
        }
    }

    refreshList();
}

function renderShop(currency, items) {
    const panel = $('npc-shop');
    const body = $('shop-body');
    if (!panel || !body) return;

    currentShop = { currency: currency || 'gold_coin', items: Array.isArray(items) ? items : [] };
    ensureShopUiState(shopNpc);
    if (typeof checkAndFetchSubContainers === 'function') {
        checkAndFetchSubContainers();
    }

    buildShopUi(panel, body);

    const diag = typeof $ === 'function' ? $('npc-dialog') : null;
    let inheritedPos = null;
    if (diag && !diag.hidden && diag.style && diag.style.left && diag.style.top) {
        inheritedPos = { left: diag.style.left, top: diag.style.top };
    }
    if (typeof hideFloat === 'function') {
        hideFloat('npc-dialog');
    }

    if (panel.hidden) {
        if (inheritedPos && panel.style) {
            panel.hidden = false;
            panel.style.left = inheritedPos.left;
            panel.style.top = inheritedPos.top;
        } else {
            placeFloat(panel, shopNpc);
        }
    }
}

function renderLoot(items) {
    const panel = $('loot-panel');
    const body = $('loot-body');
    if (!panel || !body) return;
    body.textContent = '';
    if (!items.length) {
        const p = document.createElement('p');
        p.className = 'text-muted small mb-0 p-1 muted';
        p.textContent = 'empty';
        body.appendChild(p);
    } else {
        items.forEach(function (it, slot) {
            const b = makeItemRow({
                itemId: it.id,
                count: it.count,
                label: (it.count > 1 ? it.count + '× ' : '') + itemLabel(it.id),
                className: 'is-loot',
                onclick: function () {
                    const p = new Uint8Array(5);
                    new DataView(p.buffer).setUint32(0, openCorpse >>> 0, true);
                    p[4] = slot;
                    send(C2S.LOOT_TAKE, p);
                }
            });
            if (it.count > 1) {
                const c = document.createElement('span');
                c.className = 'inv-stack-count';
                c.textContent = String(it.count);
                b.appendChild(c);
            }
            body.appendChild(b);
        });
    }
    const c = corpses.get(openCorpse);
    if (c) {
        const title = $('loot-title');
        if (title) title.textContent = c.name || 'Loot';
    }
    if (panel.hidden || !panel.style || !panel.style.left || !panel.style.top) {
        if (c) {
            placeFloatAtTile(panel, c.x, c.y);
        } else {
            placeFloat(panel, 0);
        }
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
    setSessionBadge(on ? 'DEAD' : (self ? 'READY' : 'CONNECTING'));
}

function drawPlacement(tileX, tileY, placement, genre, targetCtx, originX, originY, tw, th, frame) {
    if (!placement || !placement.catalogId) return false;
    const opts = {
        genre: genre,
        kind: placement.kind || 'tiles',
        id: placement.catalogId,
        variant: placement.variant || Sprites.DEFAULT_TILE_VARIANT,
        frame: frame | 0
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
    const size = Sprites.getCachedImageSize ? Sprites.getCachedImageSize(img) : null;
    const iw = size ? size.iw : (img.naturalWidth || img.width || cellW);
    const ih = size ? size.ih : (img.naturalHeight || img.height || cellH);
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
    const player = !isCreatureEntity(ent) && !isNpcEntity(ent);
    const candidates = Sprites.entitySpriteCandidates(ent, {
        classes: vocationClasses,
        genre: genre,
        player: player
    });
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const opts = {
            genre: c.genre,
            kind: 'creatures',
            id: c.id,
            variant: Sprites.DEFAULT_ENTITY_VARIANT
        };
        Sprites.prefetch(opts);
        const state = Sprites.loadState(opts);
        if (state === 'ready') return Sprites.getReady(opts);
        if (state === 'pending') return null;
    }
    return null;
}

function entityPresentPx(ent) {
    const vis = visualPos(ent) || { x: ent.x, y: ent.y, z: ent.z };
    const tNowMs = nowMs();
    const tNowSec = tNowMs / 1000;
    const bobPy = SpritePres ? SpritePres.stepBobOffsetPx(ent, tNowMs, TS, 0.08) : 0;
    const recoil = SpritePres ? SpritePres.getHitRecoilOffset(ent, tNowSec, TS, TS) : { x: 0, y: 0 };
    return {
        tilePx: (vis.x - camX) * TS + recoil.x,
        tilePy: (vis.y - camY) * TS + recoil.y + bobPy,
        floorPy: (vis.y - camY) * TS + recoil.y,
        bobPy: bobPy,
        tNowSec: tNowSec
    };
}

function entitySpriteBox(ent, img, pres) {
    if (!img) return null;
    const p = pres || entityPresentPx(ent);
    const size = Sprites.getCachedImageSize ? Sprites.getCachedImageSize(img) : null;
    const iw = size ? size.iw : (img.naturalWidth || img.width || TS);
    const ih = size ? size.ih : (img.naturalHeight || img.height || TS);
    return Draw.resolveTileDrawBox(p.tilePx, p.tilePy, TS, TS, iw, ih, 1, 'bottom_center');
}

function drawEntitySprite(ent, color) {
    const pres = entityPresentPx(ent);
    const tilePx = pres.tilePx;
    const tilePy = pres.tilePy;
    const tNowSec = pres.tNowSec;

    const img = entityImage(ent);
    const flipH = ent.facing === -1 || ent.spriteFacing === -1 || ent.dir === 3;

    // Soft foot shadow on the floor (recoil, no bob) — HuntDL py - bobY
    if (SpritePres) {
        SpritePres.drawEntityShadow(ctx, tilePx, pres.floorPy, TS, TS, 1, img, flipH, {
            combatTargetHighlight: !!(targetId && ent.id === targetId),
            hoverHighlight: !!(hoveredEntityId && ent.id === hoveredEntityId),
            now: tNowSec
        });
    }

    // Active combat target: pulsing red circular reticle under feet
    if (targetId && ent.id === targetId && Hud) {
        Hud.drawTargetReticle(ctx, tilePx, pres.floorPy, TS, TS, tNowSec);
    }

    let box = null;
    if (img) {
        box = entitySpriteBox(ent, img, pres);

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
                drawPlacement: drawPlacement,
                timeSec: nowMs() / 1000
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
        fields.forEach(function (f) {
            if ((f.z | 0) !== (z | 0)) return;
            const sx = (f.x - camX) * TS;
            const sy = (f.y - camY) * TS;
            ctx.fillStyle = f.kind === 'fire' ? 'rgba(230, 80, 20, 0.45)' :
                            f.kind === 'poison' ? 'rgba(40, 180, 40, 0.45)' :
                            f.kind === 'energy' ? 'rgba(60, 140, 240, 0.45)' :
                            'rgba(180, 180, 180, 0.45)';
            ctx.fillRect(sx, sy, TS, TS);
        });
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
            const pres = entityPresentPx(ent);
            const img = entityImage(ent);
            let stackTopY = pres.tilePy;
            if (img) {
                const box = entitySpriteBox(ent, img, pres);
                if (box) stackTopY = box.dy;
            }
            const showMana = !!(self && ent.id === self.id);
            Hud.drawNameplate(ctx, ent, pres.tilePx, stackTopY, TS, showMana);
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
                if (pin.kind === 'chest' || (pin.kind === 'door' && (pin.flags & 1))) {
                    blocked = true;
                }
            }
        });
    }
    return !blocked;
}

// Door, field, or chest only. Creatures stay out of the minimap byte.
function minimapBakedBlocker(x, y, z) {
    const zz = z | 0;
    const f = fields.get(x + ',' + y + ',' + zz);
    if (f && (f.kind === 'barrier' || f.kind === 'vine' || (f.flags & 1))) return true;
    let blocked = false;
    worldPins.forEach(function (pin) {
        if (blocked) return;
        if ((pin.x | 0) === x && (pin.y | 0) === y && (pin.z | 0) === zz) {
            if (pin.kind === 'chest' || (pin.kind === 'door' && (pin.flags & 1))) blocked = true;
        }
    });
    return blocked;
}

function syncMinimapView() {
    if (!MinimapView || typeof MinimapView.sync !== 'function') return;
    let live = null;
    if (viewport) {
        live = {
            originX: viewport.originX,
            originY: viewport.originY,
            z: viewport.z,
            width: viewport.width,
            height: viewport.height,
            tiles: viewport.tiles,
            bakedBlocker: minimapBakedBlocker
        };
    }
    MinimapView.sync({
        mapId: mapId,
        store: MinimapStore,
        player: self ? { x: self.x, y: self.y, z: self.z } : null,
        live: live
    });
}

function noteMinimapWindow() {
    syncMinimapView();
    if (!MinimapStore || !viewport || !mapId) return;
    const pending = MinimapStore.noteWindow(mapId, viewport, minimapBakedBlocker);
    if (pending && typeof pending.then === 'function') pending.then(syncMinimapView, syncMinimapView);
}

function flushMinimap() {
    if (!MinimapStore) return;
    MinimapStore.flush();
}

function minimapLive() {
    if (!viewport) return null;
    return {
        originX: viewport.originX,
        originY: viewport.originY,
        z: viewport.z,
        width: viewport.width,
        height: viewport.height,
        tiles: viewport.tiles,
        bakedBlocker: minimapBakedBlocker,
        walkable: isWalkable
    };
}

function routeWalkable(x, y) {
    if (!self) return false;
    if (!MinimapStore || !mapId || !MinimapPath) return isWalkable(x, y);
    const cell = MinimapStore.queryCell(mapId, x | 0, y | 0, self.z | 0, minimapLive());
    return !!(cell && cell.walkable);
}

function findRoute(from, dest) {
    if (MinimapPath && MinimapStore && typeof MinimapPath.findPath === 'function') {
        return MinimapPath.findPath(from, dest, routeWalkable);
    }
    return Path.findOrthogonalPath(from, dest, isWalkable);
}

function approachTile(from, target, range) {
    if (MinimapPath && MinimapStore && typeof MinimapPath.nearestApproach === 'function') {
        return MinimapPath.nearestApproach(from, target, range, routeWalkable);
    }
    return Path.nearestApproach(from, target, range, isWalkable);
}

function walkStepDecision(left, arrived, sameFloor) {
    if (MinimapPath && typeof MinimapPath.afterStep === 'function') {
        return MinimapPath.afterStep(left, arrived, sameFloor);
    }
    if (arrived) return 'arrive';
    if (!sameFloor) return 'cancel-floor';
    return 'wait';
}

function onMinimapClick(tile) {
    startWalk(tile, null);
}

function sendWalkPath(dirs) {
    if (!dirs || !dirs.length) {
        if (walkQueued) send(C2S.MOVE_PATH, Uint8Array.of(0));
        walkQueued = false;
        walkLeft = 0;
        return;
    }
    const cap = MinimapPath && MinimapPath.PACKET_CAP ? MinimapPath.PACKET_CAP : 165;
    const slice = MinimapPath && typeof MinimapPath.clipSteps === 'function'
        ? MinimapPath.clipSteps(dirs, cap)
        : dirs.slice(0, Math.min(165, dirs.length));
    send(C2S.MOVE_PATH, encodeMovePath(slice));
    walkQueued = true;
    walkLeft = slice.length;
}

function stopWalk(keepPending, silent) {
    const notify = walkQueued && !silent;
    walkDest = null;
    walkBusy = false;
    walkQueued = false;
    walkLeft = 0;
    chaseWalk = false;
    if (!keepPending) pendingAfterWalk = null;
    if (notify) send(C2S.MOVE_PATH, Uint8Array.of(0));
}

function cancelClickWalk() {
    const notify = walkQueued;
    walkDest = null;
    pendingAfterWalk = null;
    chaseWalk = false;
    walkQueued = false;
    walkLeft = 0;
    walkBusy = false;
    if (notify) send(C2S.MOVE_PATH, Uint8Array.of(0));
}

function chaseApproachRange() {
    return Path && Path.CHASE_APPROACH_RANGE != null ? Path.CHASE_APPROACH_RANGE : 1;
}

function pumpChase() {
    if (!autoChase || !self || downed) return;
    if (keyWalk.isHeld()) return;
    if (pendingAfterWalk) return;
    if (!targetId) return;
    const tgt = others.get(targetId);
    if (!tgt || (tgt.hp | 0) <= 0) return;
    if ((tgt.z | 0) !== (self.z | 0)) return;
    const range = chaseApproachRange();
    if (Path.chebyshev(self.x, self.y, tgt.x, tgt.y) <= range) {
        if (chaseWalk) stopWalk();
        return;
    }
    const dest = approachTile(self, tgt, range);
    if (!dest) return;
    if ((self.x | 0) === (dest.x | 0) && (self.y | 0) === (dest.y | 0)) {
        if (chaseWalk) stopWalk();
        return;
    }
    if (walkDest && (walkDest.x | 0) === (dest.x | 0) && (walkDest.y | 0) === (dest.y | 0)) {
        chaseWalk = true;
        if (!walkQueued) sendNextStep();
        return;
    }
    chaseWalk = true;
    walkDest = { x: dest.x | 0, y: dest.y | 0 };
    sendNextStep();
}

function selectTarget(id) {
    const n = id | 0;
    send(C2S.SET_TARGET, u32buf(n));
    targetId = n;
    renderCombat();
    if (n) pumpChase();
    else if (chaseWalk) stopWalk();
}

function isDiagonalDir(dir) {
    const step = Path && Path.DIRS ? Path.DIRS[dir] : null;
    return !!(step && step.dx && step.dy);
}

function walkGapMs() {
    return stepMs * (walkGapScale > 1 ? DIAGONAL_STEP_FACTOR : 1);
}

function sendKeyboardStep(dir) {
    if (!self || downed || dir == null) return false;
    if (walkBusy) return false;
    const step = Path.DIRS[dir];
    if (!step) return false;
    const nx = (self.x | 0) + step.dx;
    const ny = (self.y | 0) + step.dy;
    // Known blocked dest: skip send so walkBusy is not held for REJECT BLOCKED.
    const t = viewport ? Path.tileAt(viewport, nx, ny) : null;
    if (t != null && !isWalkable(nx, ny)) return false;
    if (step.dx && step.dy && Path.diagonalClosed(
        self.x | 0, self.y | 0, step.dx, step.dy, isWalkable
    )) return false;
    walkBusy = true;
    send(C2S.MOVE_STEP, Uint8Array.of(dir));
    return true;
}

function pumpKeyboardWalk(now) {
    if (!self || downed) return;
    const dir = keyWalk.readyDir(now, walkGapMs());
    if (dir == null) return;
    if (!sendKeyboardStep(dir)) return;
    keyWalk.markEmitted(now);
    walkGapScale = isDiagonalDir(dir) ? DIAGONAL_STEP_FACTOR : 1;
}

function runPending() {
    const p = pendingAfterWalk;
    pendingAfterWalk = null;
    if (!p) return;
    if (p.type === 'TALK') send(C2S.TALK, u32buf(p.id));
    else if (p.type === 'OPEN_CORPSE') send(C2S.OPEN_CORPSE, u32buf(p.id));
    else if (p.type === 'BROWSE_FIELD') {
        const ui = ensureBrowse();
        if (ui) ui.arrive(p);
    } else if (p.type === 'USE' || p.type === 'OPEN_CONTAINER') {
        send(C2S.USE, encodeTileUse(p.x, p.y, p.z));
    }
}

function sendNextStep() {
    if (!self || !walkDest) return;
    if (self.x === walkDest.x && self.y === walkDest.y) {
        stopWalk(true, true);
        runPending();
        return;
    }
    const path = findRoute(self, walkDest);
    if (!path || !path.length) {
        stopWalk(false, true);
        fct('There is no way.');
        return;
    }
    sendWalkPath(path);
}

function startWalk(dest, then) {
    if (!self || !dest || downed) return;
    if (keyWalk.isHeld()) return;
    if (then) chaseWalk = false;
    pendingAfterWalk = then || null;
    if (MinimapPath && typeof MinimapPath.clickPlan === 'function') {
        const plan = MinimapPath.clickPlan(self, dest);
        if (plan.type === 'text') {
            pendingAfterWalk = null;
            fct(plan.text);
            return;
        }
        if (plan.type === 'arrive') {
            stopWalk(true);
            runPending();
            return;
        }
    } else if ((dest.x | 0) === self.x && (dest.y | 0) === self.y) {
        stopWalk(true);
        runPending();
        return;
    }
    if (!routeWalkable(dest.x, dest.y)) {
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
    const dest = approachTile(self, npc, Mouse.TALK_NPC_RANGE);
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
    const dest = approachTile(self, c, Mouse.OPEN_CORPSE_RANGE);
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
    const dest = approachTile(self, tile, Mouse.WORLD_USE_RANGE);
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
                selectTarget(intent.targetId);
                break;
            case 'START_AUTOWALK':
                chaseWalk = false;
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
            case 'OPEN_BAG':
                if (intent.containerId) {
                    requestOpenBag(
                        intent.containerId,
                        intent.index != null ? intent.index : OPEN_BAG_SELF_INDEX,
                        intent.item && intent.item.id,
                        null
                    );
                }
                break;
            case 'PICKUP':
                sendPickup(intent.tile, intent.stackIndex, intent.item, null);
                break;
            case 'QUICKLOOT':
                fct('Not available yet.');
                break;
            default:
                fct('Not available yet.');
        }
    }
}

function hideItemPopover(force) {
    const el = $('item-popover');
    if (!el) return;
    if (!force && el.dataset.sticky === '1') return;
    el.hidden = true;
    el.dataset.sticky = '0';
}

function itemPopoverHtml(itemId, stackCount) {
    const meta = itemCatalog.get(itemId);
    const rawLabel = (meta && (meta.label || meta.name)) || itemLabel(itemId);
    const label = String(rawLabel).split(' ').map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
    const src = resolveItemSpriteUrl(itemId, visualGenre());
    let rows = '';
    function addRow(k, v) {
        rows += '<tr><td class="eq-stat-label">' + escapeHtml(k) + '</td><td class="eq-stat-val">' + escapeHtml(String(v)) + '</td></tr>';
    }
    if (stackCount && stackCount > 1) addRow('Count', stackCount);
    if (meta) {
        const kind = meta.category || meta.weaponType || meta.type || meta.slot;
        if (kind) addRow('Type', kind);
        if (meta.slot) addRow('Slot', meta.slot);
        const atkText = weaponAtkText(meta);
        const defText = weaponDefText(meta);
        if (atkText) addRow('Atk', atkText);
        if (defText) addRow('Def', defText);
        if (meta.armor != null && meta.armor > 0) addRow('Arm', meta.armor);
        if (meta.range != null && meta.range > 1) addRow('Range', meta.range);
        if (meta.twoHanded || meta.hands === 2) addRow('Hands', 'Two-handed');
        if (meta.weight != null && meta.weight > 0) addRow('Weight', (meta.weight / 100).toFixed(2) + ' oz');
        if (typeof EngineEquipRules !== 'undefined' && EngineEquipRules.wieldSentence) {
            const wield = EngineEquipRules.wieldSentence(meta);
            if (wield) addRow('Wield', wield);
        }
    }
    return '<div class="eq-modal-thumb"><img src="' + escapeHtml(src || '') + '" alt=""></div>'
        + '<div class="eq-modal-title">' + escapeHtml(label) + '</div>'
        + (meta && meta.id ? '<div class="eq-modal-id">' + escapeHtml(meta.id) + '</div>' : '')
        + (rows ? '<table class="eq-stat-table"><tbody>' + rows + '</tbody></table>' : '');
}

function showItemPopover(clientX, clientY, itemId, stackCount, sticky) {
    const el = $('item-popover');
    if (!el) return;
    el.innerHTML = itemPopoverHtml(itemId, stackCount);
    el.dataset.sticky = sticky ? '1' : '0';
    placeCtxMenu(el, clientX, clientY);
}

function bindItemPopover(el, itemId, count) {
    if (!el) return;
    if (!itemId) {
        el.onmouseenter = null;
        el.onmousemove = null;
        el.onmouseleave = null;
        return;
    }
    el.onmouseenter = function (ev) {
        showItemPopover(ev.clientX + 12, ev.clientY + 12, itemId, count, false);
    };
    el.onmousemove = function (ev) {
        const pop = $('item-popover');
        if (!pop || pop.hidden || pop.dataset.sticky === '1') return;
        placeCtxMenu(pop, ev.clientX + 12, ev.clientY + 12);
    };
    el.onmouseleave = function () {
        hideItemPopover(false);
    };
}

function hideCtx() {
    const el = $('ctx-menu');
    if (el) el.hidden = true;
    hideItemPopover(true);
    hideStackSplitModal();
}

function ctxMenuHost() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.body;
}

// HuntDL placeContextMenu: fixed at the cursor, flip then clamp to the viewport.
function placeCtxMenu(el, x, y) {
    if (!el || !el.style) return;
    const host = ctxMenuHost();
    if (host && el.parentNode !== host) host.appendChild(el);
    el.hidden = false;
    if (FloatPlace && typeof FloatPlace.placeContextMenu === 'function') {
        FloatPlace.placeContextMenu(el, x, y, {
            win: typeof window !== 'undefined' ? window : null,
            fallbackW: 160,
            fallbackH: 80
        });
        return;
    }
    const pad = 8;
    const menuW = el.offsetWidth || 160;
    const menuH = el.offsetHeight || 80;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    let left = Number(x) || 0;
    let top = Number(y) || 0;
    if (left + menuW > vw - pad) left = left - menuW;
    if (top + menuH > vh - pad) top = top - menuH;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    if (left > vw - menuW - pad) left = Math.max(pad, vw - menuW - pad);
    if (top > vh - menuH - pad) top = Math.max(pad, vh - menuH - pad);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

// HuntDL placeContextMenu: right-align below the sort button, flip if the
// right rail would clip the menu, then clamp to the viewport.
function placeCombatSortDropdown() {
    const btn = $('combatSortBtn');
    const el = $('combatSortDropdown');
    if (!btn || !el) return;
    const r = btn.getBoundingClientRect();
    placeCtxMenu(el, r.right, r.bottom + 2);
}

function beginBrowseDrag(info, ev) {
    if (!info || !ev) return;
    groundDrag = {
        uid: info.uid,
        x: info.x | 0,
        y: info.y | 0,
        z: info.z | 0,
        stackIndex: info.stackIndex | 0,
        item: info.item || { id: '', count: 1 },
        startX: ev.clientX,
        startY: ev.clientY,
        dragging: false,
        browse: true
    };
    currentDrag = {
        kind: 'ground',
        uid: groundDrag.uid,
        x: groundDrag.x,
        y: groundDrag.y,
        z: groundDrag.z,
        stackIndex: groundDrag.stackIndex,
        item: groundDrag.item,
        browse: true
    };
}

function ensureBrowse() {
    if (browseUi || !BrowseField) return browseUi;
    browseUi = BrowseField.attach({
        getPlayer: function () { return self; },
        nearestApproach: function (player, tile, range) {
            return approachTile(player, tile, range);
        },
        isWalkable: isWalkable,
        sendBrowse: function (x, y, z) {
            send(C2S.BROWSE_FIELD, encodeBrowseField(x, y, z));
        },
        sendClose: function (x, y, z) {
            send(C2S.BROWSE_FIELD_CLOSE, encodeBrowseField(x, y, z));
        },
        fct: fct,
        startWalk: startWalk,
        floatRoot: inventoryFloatRoot,
        wireDrag: wireFloatHeaderDrag,
        raise: bringFloatToFront,
        place: function (el, tile) {
            placeNewFloat(el, { origin: 'canvas', tile: tile });
        },
        syncAria: syncFloatRootAria,
        menuEl: function () { return $('ctx-menu'); },
        placeMenu: placeCtxMenu,
        hideChrome: hideCtx,
        showLook: function (x, y, id, count) { showItemPopover(x, y, id, count, true); },
        bindLook: bindItemPopover,
        spriteUrl: function (id) { return resolveItemSpriteUrl(id, visualGenre()); },
        itemLabel: itemLabel,
        beginDrag: beginBrowseDrag,
        useItem: function (uid) {
            if (!uid) return;
            send(C2S.USE_ITEM, encodeContainerSlot(uid, OPEN_BAG_SELF_INDEX));
        },
        openBag: function (uid, itemId) {
            if (!uid) return;
            requestOpenBag(uid, OPEN_BAG_SELF_INDEX, itemId || '', null);
        },
        pickup: function (rec, it, ev) {
            if (!rec || !it) return;
            moveItemWithSplit(
                tileMoveLoc(rec.x, rec.y, rec.z, it.stackIndex | 0),
                backpackMoveDest(),
                { id: it.id, count: it.count | 0 },
                ev || null
            );
        },
        armUseWith: function (it) {
            if (!it || !it.id) return;
            pendingUseWith = it.id;
            fct('Use ' + itemLabel(it.id) + ' with…');
        }
    });
    return browseUi;
}

function showCanvasMenu(hit, clientX, clientY) {
    const el = $('ctx-menu');
    if (!el) return;
    if (buttonsDown.left) {
        suppressNextCanvasClick = true;
        suppressNextDocClick = true;
    }
    hideItemPopover(true);
    const entries = Mouse.buildCanvasContextMenuEntries(hit);
    el.textContent = '';
    entries.forEach(function (entry) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'inv-context-item';
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
            } else if (entry.action === 'OPEN_BAG' && hit.groundUseUid) {
                applyIntents([Mouse.groundOpenBagIntent(hit, hit.groundUseUid)]);
            } else if (entry.action === 'PICKUP' && hit.pickableUid) {
                applyIntents([Mouse.groundPickupIntent(hit, hit.pickableUid, hit.pickableStackIndex)]);
            } else if (entry.action === 'BROWSE_FIELD') {
                const ui = ensureBrowse();
                if (ui) ui.chooseTile(hit.x, hit.y, hit.z);
            } else if (entry.action === 'USE_STAIR') {
                applyIntents([{ type: 'USE_STAIR' }]);
            } else if (entry.action === 'WALK') {
                applyIntents([{ type: 'START_AUTOWALK', dest: { x: hit.x, y: hit.y, z: hit.z } }]);
            }
        };
        el.appendChild(b);
    });
    placeCtxMenu(el, clientX, clientY);
}

function showInvMenu(clientX, clientY, item, containerId, index) {
    const el = $('ctx-menu');
    if (!el) return;
    hideItemPopover(true);
    el.textContent = '';
    const rows = [
        { label: 'Look', fn: function () { showItemPopover(clientX, clientY, item.id, item.count, true); } },
        {
            label: 'Use',
            fn: function () {
                if (containerId != null) send(C2S.USE_ITEM, encodeContainerSlot(containerId, index));
            }
        },
        {
            label: 'Equip',
            fn: function () {
                if (containerId == null) return;
                if (blockDress(item, '', 'equip', '')) return;
                send(C2S.EQUIP, encodeEquip(containerId, index, ''));
            }
        }
    ];
    if (item && item.flags & 1) {
        rows.push({
            label: 'Open',
            fn: function () {
                if (containerId) {
                    requestOpenBag(containerId, index, item && item.id ? item.id : '', findInvSlotEl(containerId, index));
                }
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
        b.className = 'inv-context-item';
        b.textContent = entry.label;
        b.onclick = function () { hideCtx(); entry.fn(); };
        el.appendChild(b);
    });
    placeCtxMenu(el, clientX, clientY);
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

function removeGroundDragAvatar() {
    if (groundDragAvatar) {
        groundDragAvatar.remove();
        groundDragAvatar = null;
    }
    document.querySelectorAll('.drag-over').forEach(function (el) {
        el.classList.remove('drag-over');
    });
}

function updateGroundDragAvatar(ev) {
    if (!groundDrag) return;
    const dx = Math.abs(ev.clientX - groundDrag.startX);
    const dy = Math.abs(ev.clientY - groundDrag.startY);
    if (!groundDrag.dragging && (dx > 4 || dy > 4)) {
        groundDrag.dragging = true;
    }
    if (!groundDrag.dragging) return;

    const item = groundDrag.item;
    const itemId = item && item.id ? item.id : '';
    const count = item && item.count ? item.count | 0 : 1;

    if (!groundDragAvatar) {
        const avatar = document.createElement('div');
        avatar.id = 'ground-drag-avatar';
        avatar.className = 'ground-drag-avatar inv-slot is-filled';
        avatar.style.position = 'fixed';
        avatar.style.pointerEvents = 'none';
        avatar.style.zIndex = '10000';
        avatar.style.transform = 'translate(-50%, -50%)';
        avatar.style.left = ev.clientX + 'px';
        avatar.style.top = ev.clientY + 'px';

        const img = document.createElement('img');
        img.src = resolveItemSpriteUrl(itemId, visualGenre());
        img.alt = itemLabel(itemId);
        img.draggable = false;
        img.onerror = function () { this.style.display = 'none'; };
        avatar.appendChild(img);

        if (count > 1) {
            const badge = document.createElement('span');
            badge.className = 'inv-stack-count';
            badge.textContent = String(count);
            avatar.appendChild(badge);
        }

        const host = typeof ctxMenuHost === 'function' ? ctxMenuHost() : document.body;
        if (host) host.appendChild(avatar);
        groundDragAvatar = avatar;
    } else {
        groundDragAvatar.style.left = ev.clientX + 'px';
        groundDragAvatar.style.top = ev.clientY + 'px';
    }

    const under = typeof document !== 'undefined'
        ? document.elementFromPoint(ev.clientX, ev.clientY)
        : null;
    highlightDropTarget(under);
}

function onCanvasPointerMove(ev) {
    if (groundDrag) {
        updateGroundDragAvatar(ev);
    }
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

function finishCanvasGroundDrag(ev) {
    const drag = groundDrag;
    groundDrag = null;
    removeGroundDragAvatar();
    setDragOver(null);
    if (!drag || !drag.dragging) return false;
    const under = typeof document !== 'undefined'
        ? document.elementFromPoint(ev.clientX, ev.clientY)
        : null;
    if (under && browseUi && browseUi.isBrowseSurface(under)) return true;
    if (!groundByUid.has(drag.uid) && !drag.browse) return true;
    if (under && typeof EngineActionBars !== 'undefined'
        && typeof EngineActionBars.tryHandleSlotDrop === 'function') {
        if (drag.item && drag.item.id && EngineActionBars.tryHandleSlotDrop(under, drag.item.id)) {
            return true;
        }
    }
    if (under && typeof under.closest === 'function' && ContainerDrop) {
        const payload = {
            kind: 'ground',
            uid: drag.uid,
            x: drag.x,
            y: drag.y,
            z: drag.z,
            stackIndex: drag.stackIndex,
            item: drag.item
        };
        const equipEl = under.closest('#activeEquipmentCard .slot-item, .equipment-card .slot-item');
        if (equipEl) {
            const eq = equipEl.getAttribute('data-slot') || equipEl.getAttribute('data-eq-slot');
            const equipped = eq ? equipment[eq] : null;
            applyPlannedDrop(ContainerDrop.planDrop({
                drag: payload,
                dragMeta: catalogMeta(drag.item),
                paperdoll: {
                    targetSlot: eq,
                    equippedItem: equipped || null,
                    equippedMeta: catalogMeta(equipped)
                },
                modifiers: modifiersFromEvent(ev)
            }), drag.item);
            return true;
        }
        const hit = containerHitFromTarget(under);
        if (hit) {
            applyPlannedDrop(ContainerDrop.planDrop({
                drag: payload,
                dragMeta: catalogMeta(drag.item),
                container: hit,
                modifiers: modifiersFromEvent(ev)
            }), drag.item);
            return true;
        }
        if (under.closest('#loot-panel, #npc-dialog, #npc-shop')) return true;
    }
    const dest = canvasTile(ev);
    if (!dest) return true;
    if (self && (dest.x | 0) === (self.x | 0) && (dest.y | 0) === (self.y | 0) && (dest.z | 0) === (self.z | 0)) {
        moveItemWithSplit(
            tileMoveLoc(drag.x, drag.y, drag.z, drag.stackIndex),
            backpackMoveDest(),
            drag.item,
            ev
        );
        return true;
    }
    if ((dest.x | 0) === (drag.x | 0) && (dest.y | 0) === (drag.y | 0) && (dest.z | 0) === (drag.z | 0)) {
        return true;
    }
    moveItemWithSplit(
        tileMoveLoc(drag.x, drag.y, drag.z, drag.stackIndex),
        tileMoveLoc(dest.x, dest.y, dest.z, 0),
        drag.item,
        ev
    );
    return true;
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
    if (button === 'left' && hit && hit.groundMoveUid && Mouse.allowGroundLmbDrag({
        hit: hit,
        mode: mouse.mouseControlMode,
        modifiers: { shift: ev.shiftKey, ctrl: ev.ctrlKey, alt: ev.altKey, meta: ev.metaKey }
    })) {
        groundDrag = {
            uid: hit.groundMoveUid,
            x: hit.x,
            y: hit.y,
            z: hit.z,
            stackIndex: hit.groundMoveItem && hit.groundMoveItem.stackIndex != null
                ? hit.groundMoveItem.stackIndex | 0
                : 0,
            item: hit.groundMoveItem || { id: '', count: 1 },
            startX: ev.clientX,
            startY: ev.clientY,
            dragging: false,
            hit: hit,
            ev: ev
        };
        currentDrag = {
            kind: 'ground',
            uid: groundDrag.uid,
            x: groundDrag.x,
            y: groundDrag.y,
            z: groundDrag.z,
            stackIndex: groundDrag.stackIndex,
            item: groundDrag.item
        };
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

function onCanvasPointerUp(ev) {
    if (ev.button !== 0 && ev.button !== 2) return;
    if (groundDrag) {
        const drag = groundDrag;
        const dx = Math.abs(ev.clientX - drag.startX);
        const dy = Math.abs(ev.clientY - drag.startY);
        if (dx > 4 || dy > 4) drag.dragging = true;
        if (finishCanvasGroundDrag(ev)) {
            currentDrag = null;
            return;
        }
        if (drag.browse) {
            groundDrag = null;
            currentDrag = null;
            removeGroundDragAvatar();
            return;
        }
        const hit = drag.hit;
        groundDrag = null;
        currentDrag = null;
        removeGroundDragAvatar();
        const intents = Mouse.processMouseAction({
            button: 'left',
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
        send(C2S.ENTER, hexToBytes(tokenHex));
        return;
    }
    if (opcode === S2C.ENTER_WORLD) {
        skillProgress = null;
        self = {
            id: r.u32(), name: r.str(), vocation: r.str(), level: r.u16(),
            experience: r.u64(), hp: r.u32(), hpMax: r.u32(), mp: r.u32(), mpMax: r.u32(),
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
        if (r.rest().length >= 2) {
            self.foodSeconds = r.u16();
            self.foodSyncMs = nowMs();
        }
        viewport = { originX: originX, originY: originY, z: z, width: w, height: h, tiles: tiles };
        noteMinimapWindow();
        downed = false;
        setDeath(false);
        log('in world as ' + self.name, 'ok');
        if (typeof EngineActionBars !== 'undefined' && EngineActionBars.onEnter) {
            EngineActionBars.onEnter({
                characterId: self.id,
                name: self.name,
                vocation: self.vocation
            });
        }
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
        noteMinimapWindow();
        setHud();
        draw();
        return;
    }
    if (opcode === S2C.MOVE) {
        const id = r.u32(), x = r.i16(), y = r.i16(), z = r.i8(), dir = r.u8();
        if (self && id === self.id) {
            const prev = { x: self.x | 0, y: self.y | 0, z: self.z | 0 };
            beginSlide(self, x, y, z);
            if (browseUi) browseUi.onPlayerMoved(prev, self);
            applyDirFacing(self, dir);
            setHud();
            syncMinimapView();
            walkBusy = false;
            if (keyWalk.isHeld()) pumpKeyboardWalk(nowMs());
            else if (walkDest) {
                const arrived = (self.x | 0) === (walkDest.x | 0) && (self.y | 0) === (walkDest.y | 0);
                const sameFloor = (z | 0) === (prev.z | 0);
                const decision = walkStepDecision(walkLeft, arrived, sameFloor);
                if (decision === 'arrive') {
                    stopWalk(true, true);
                    runPending();
                } else if (decision === 'cancel-floor') {
                    stopWalk(false, true);
                    pumpChase();
                } else if (decision === 'continue') {
                    walkLeft = 0;
                    sendNextStep();
                } else if (walkLeft > 0) {
                    walkLeft -= 1;
                }
            } else pumpChase();
        } else {
            const p = others.get(id);
            if (p) {
                beginSlide(p, x, y, z);
                applyDirFacing(p, dir);
            }
            if (id === targetId) pumpChase();
        }
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.PONG) {
        const echo = r.u32();
        r.u32();
        lastTick = r.u32();
        const rtt = rttMs(Date.now(), echo);
        const rttEl = $('stat-rtt');
        if (rttEl) rttEl.textContent = rtt + 'ms';
        return;
    }
    if (opcode === S2C.REJECT) {
        const seq = r.u32();
        const reason = r.u8();
        log('rejected seq=' + seq + ' reason=' + reason, 'err');
        const groundIdx = groundRejectSeqs.indexOf(seq);
        if (groundIdx >= 0) {
            groundRejectSeqs.splice(groundIdx, 1);
            if (reason === REASON.OUT_OF_RANGE) fct('There is no way.');
        }
        if (reason === REASON.BUSY) {
            walkBusy = false;
            if (keyWalk.isHeld()) pumpKeyboardWalk(nowMs());
        } else if (reason === REASON.BLOCKED) {
            walkBusy = false;
            if (walkDest) {
                stopWalk(false, true);
                pumpChase();
            }
            if (keyWalk.isHeld()) pumpKeyboardWalk(nowMs());
        }
        return;
    }
    if (opcode === S2C.KICK) {
        log('kicked reason=' + r.u8(), 'err');
        return;
    }
    if (opcode === S2C.APPEAR) {
        const p = typeof decodeAppear === 'function' ? decodeAppear(r.b.subarray(r.o)) : {
            id: r.u32(), name: r.str(), x: r.i16(), y: r.i16(), z: r.i8(),
            hp: r.u32(), hpMax: r.u32(), flags: r.u8(),
            look: r.o < r.b.length ? r.str() : '',
            dir: r.o < r.b.length ? r.u8() : 0
        };
        p.fromX = p.x;
        p.fromY = p.y;
        p.facing = 1;
        p.moveAt = 0;
        p.moveDur = 0;
        applyDirFacing(p, p.dir);
        others.set(p.id, p);
        if (!seenAt.has(p.id)) seenAt.set(p.id, Date.now());
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.DISAPPEAR) {
        const id = r.u32();
        others.delete(id);
        if (targetId === id) {
            targetId = 0;
            if (chaseWalk) stopWalk();
        }
        if (hoveredEntityId === id) hoveredEntityId = 0;
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.STATS) {
        const st = typeof decodeStats === 'function' ? decodeStats(r.rest()) : null;
        if (!st) return;
        const id = st.id, hp = st.hp, hpMax = st.hpMax;
        if (self && id === self.id) {
            self.hp = hp; self.hpMax = hpMax; self.mp = st.mp; self.mpMax = st.mpMax;
            self.foodSeconds = st.foodSeconds;
            self.foodSyncMs = nowMs();
            self.inProtectionZone = !!st.inProtectionZone;
            self.conditions = st.conditions;
            if (hp > 0 && downed) setDeath(false);
            setHud();
            renderFoodStatus();
        } else {
            const p = others.get(id);
            if (p) { p.hp = hp; p.hpMax = hpMax; }
        }
        renderCombat();
        draw();
        return;
    }
    if (opcode === S2C.SWING) {
        const sw = typeof decodeSwing === 'function' ? decodeSwing(r.b.subarray(r.o)) : {
            sourceId: r.u32(), targetId: r.u32(), amount: r.u16(), flags: r.u8(),
            element: r.o < r.b.length ? r.u8() : 0,
            weaponId: r.o < r.b.length ? r.str() : '',
            ammoId: r.o < r.b.length ? r.str() : ''
        };
        const src = sw.sourceId, dst = sw.targetId, amount = sw.amount, flags = sw.flags;
        log('swing ' + src + '→' + dst + ' ' + amount + (flags & 1 ? ' miss' : '') + (flags & 2 ? ' death' : ''));
        const attacker = entityById(src);
        const defender = entityById(dst);
        const isMiss = !!(flags & 1);
        const isDeath = !!(flags & 2);
        const isCrit = !!(flags & 4);
        const tNow = nowMs() / 1000;
        const elName = typeof swingElementName === 'function' ? swingElementName(sw.element) : 'physical';
        const elColor = CombatFx ? CombatFx.elementColorForSpell(elName) : '#ffffff';

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
                    const color = isCrit ? CombatFx.ELEMENT_COLORS.crit : elColor;
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
            const ammoId = sw.ammoId || '';
            const weaponId = sw.weaponId || '';
            const isRanged = !!(ammoId
                || (attacker.weaponType === 'distance')
                || (attacker.weaponType === 'ranged'));
            const isWand = !isRanged && elName !== 'physical' && elName !== 'healing';
            if (isRanged || isWand) {
                CombatFx.pushProjectile({
                    x0: attacker.x,
                    y0: attacker.y,
                    x1: defender.x,
                    y1: defender.y,
                    z: attacker.z,
                    color: elColor,
                    spriteId: ammoId || (isWand ? weaponId : null)
                });
            } else {
                CombatFx.pushMelee({
                    x0: attacker.x,
                    y0: attacker.y,
                    x1: defender.x,
                    y1: defender.y,
                    z: attacker.z,
                    color: isCrit ? CombatFx.ELEMENT_COLORS.crit : elColor
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
        if (targetId === id) {
            targetId = 0;
            if (chaseWalk) stopWalk();
        }
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
    if (opcode === S2C.GROUND) {
        const slot = {
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            stackIndex: r.u8(),
            uid: r.str(),
            id: r.str(),
            count: r.u16(),
            flags: 0
        };
        if (r.o < r.b.length) slot.flags = r.u8();
        upsertGroundSlot(slot);
        draw();
        return;
    }
    if (opcode === S2C.GROUND_GONE) {
        const uid = r.str();
        if (r.o + 5 <= r.b.length) {
            r.i16(); r.i16(); r.i8();
        }
        removeGroundUid(uid);
        draw();
        return;
    }
    if (opcode === S2C.CONTAINER) {
        const id = r.u32(), n = r.u8();
        const items = [];
        for (let i = 0; i < n; i++) items.push({ id: r.str(), count: r.u16() });
        const targetContainer = corpses.get(id) || worldPins.get(id);
        if (targetContainer) targetContainer.items = items;
        if (!items.length) {
            openCorpse = 0;
            hideFloat('loot-panel');
            draw();
            return;
        }
        openCorpse = id;
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
        const total = r.u64(), gained = r.u64(), level = r.u16();
        if (self) {
            self.experience = total;
            self.level = level;
        }
        log('exp +' + gained + ' (' + total + ')', 'ok');
        setHud();
        renderSkills();
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
        const fx = typeof decodeCastFx === 'function' ? decodeCastFx(r.b.subarray(r.o)) : {
            sourceId: r.u32(),
            spellId: r.str(),
            targetId: r.u32(),
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            flags: (r.o < r.b.length ? r.u8() : 0)
        };
        const sourceId = fx.sourceId, spellId = fx.spellId, targetId = fx.targetId;
        const cx = fx.x, cy = fx.y, cz = fx.z, flags = fx.flags;
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
        if (typeof EngineActionBars !== 'undefined' && EngineActionBars.onCast) {
            EngineActionBars.onCast(fx);
        }
        draw();
        return;
    }
    if (opcode === S2C.INVENTORY) {
        bag = readBagView(r);
        selectedBag = -1;
        renderBag();
        if (typeof checkAndFetchSubContainers === 'function') {
            checkAndFetchSubContainers();
        }
        const shopPanel = $('npc-shop');
        if (shopPanel && !shopPanel.hidden && currentShop) {
            buildShopUi(shopPanel, $('shop-body'));
        }
        return;
    }
    if (opcode === S2C.EQUIPMENT) {
        capVal = r.u16();
        capMax = r.u16();
        const n = r.u8();
        equipment = {};
        for (let i = 0; i < n; i++) {
            const slot = r.str();
            equipment[slot] = { id: r.str(), count: r.u16(), flags: r.u8() };
        }
        renderEquipment();
        return;
    }
    if (opcode === S2C.BAG) {
        applyBagView(readBagView(r));
        const shopPanel = $('npc-shop');
        if (shopPanel && !shopPanel.hidden && currentShop) {
            buildShopUi(shopPanel, $('shop-body'));
        }
        return;
    }
    if (opcode === S2C.SKILLS) {
        skills = {};
        for (let i = 0; i < SKILL_ORDER.length; i++) skills[SKILL_ORDER[i]] = r.u16();
        renderSkills();
        return;
    }
    if (opcode === S2C.SKILL_PROGRESS) {
        skillProgress = {};
        for (let i = 0; i < SKILL_ORDER.length; i++) skillProgress[SKILL_ORDER[i]] = r.u64();
        renderSkills();
        return;
    }
    if (opcode === S2C.SAY) {
        const msg = typeof decodeSay === 'function' ? decodeSay(r.b.subarray(r.o)) : {
            text: r.str(),
            speakerId: r.o + 4 <= r.b.length ? r.u32() : 0,
            yell: r.o < r.b.length ? r.u8() !== 0 : false
        };
        const text = msg && msg.text != null ? String(msg.text) : '';
        const speakerId = msg && msg.speakerId ? (msg.speakerId | 0) : 0;
        const yell = !!(msg && msg.yell);
        const speaker = speakerId ? entityById(speakerId) : null;
        if (speaker && CombatFx) {
            CombatFx.pushFct({
                x: speaker.x,
                y: speaker.y,
                z: speaker.z,
                text: text,
                color: yell ? '#fbbf24' : '#fde68a',
                life: yell ? 2.2 : 1.6,
                isCrit: yell
            });
            log(text);
            draw();
        } else {
            fct(text);
        }
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
        shopNpc = 0;
        shopUiState = null;
        currentShop = null;
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
        const f = typeof decodeField === 'function' ? decodeField(r.b.subarray(r.o)) : {
            x: r.i16(),
            y: r.i16(),
            z: r.i8(),
            kind: r.str(),
            flags: r.o < r.b.length ? r.u8() : 0
        };
        const recvMs = nowMs();
        if (f.createdTick != null && typeof fieldCreatedAtMs === 'function') {
            f.createdAt = fieldCreatedAtMs(f.createdTick, lastTick, ups, recvMs);
        } else {
            f.createdAt = recvMs;
        }
        fields.set(f.x + ',' + f.y + ',' + f.z, f);
        draw();
        return;
    }
    if (opcode === S2C.BROWSE_FIELD) {
        const msg = typeof decodeBrowseField === 'function'
            ? decodeBrowseField(r.b.subarray(r.o))
            : null;
        const ui = ensureBrowse();
        if (ui && msg) ui.applySnapshot(msg);
        return;
    }
    if (opcode === S2C.FIELD_GONE) {
        const g = typeof decodeFieldGone === 'function' ? decodeFieldGone(r.b.subarray(r.o)) : {
            x: r.i16(),
            y: r.i16(),
            z: r.i8()
        };
        fields.delete(g.x + ',' + g.y + ',' + g.z);
        draw();
        return;
    }
}

function cast(spellId, targetId, x, y, z) {
    if (!ws || ws.readyState !== 1) return false;
    const sId = spellId || 'snap_jab';
    const tgt = (targetId != null) ? (targetId | 0) : (targetEntity ? (targetEntity.id | 0) : 0);
    const targetEnt = tgt ? entityById(tgt) : null;
    const tx = (x != null) ? (x | 0) : (targetEnt ? targetEnt.x : (self ? self.x : 0));
    const ty = (y != null) ? (y | 0) : (targetEnt ? targetEnt.y : (self ? self.y : 0));
    const tz = (z != null) ? (z | 0) : (self ? self.z : 0);
    const payload = typeof encodeCast === 'function'
        ? encodeCast({ spellId: sId, targetId: tgt, x: tx, y: ty, z: tz })
        : (EngineProtocol && EngineProtocol.encodeCast({ spellId: sId, targetId: tgt, x: tx, y: ty, z: tz }));
    if (!payload) return false;
    send(C2S.CAST, payload);
    return true;
}

if (typeof window !== 'undefined') {
    window.cast = cast;
}

function leaveWorld() {
    flushMinimap();
    setSessionBadge('LEAVING');
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = 0;
    }
    if (ws && ws.readyState === 1) send(C2S.LOGOUT);
    setTimeout(function () { location.href = (window.__accountUrl || '/account'); }, 200);
}

function connect(cfg, tokenHex) {
    setSessionBadge('CONNECTING');
    clientSeq = 1;
    others = new Map();
    corpses = new Map();
    worldPins = new Map();
    groundItems = new Map();
    groundByUid = new Map();
    groundDrag = null;
    removeGroundDragAvatar();
    if (browseUi) browseUi.reset();
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
    if (typeof EngineClientWindow !== 'undefined' && EngineClientWindow.syncCharacter) {
        EngineClientWindow.syncCharacter(null);
    }
    viewport = null;
    syncMinimapView();
    visualLoader.reset();
    if (tilemapCache) tilemapCache.invalidate();
    if (CombatFx) CombatFx.clear();
    if (typeof EngineActionBars !== 'undefined' && EngineActionBars.reset) EngineActionBars.reset();
    keyWalk.reset();
    stopWalk();
    setDeath(false);
    ws = new WebSocket(cfg.wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = function (ev) {
        onFrame(new Uint8Array(ev.data), tokenHex);
    };
    ws.onclose = function (ev) {
        flushMinimap();
        setSessionBadge('OFFLINE');
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

function cycleTarget(dir) {
    const list = combatRoster();
    if (!list.length) return;
    let idx = list.findIndex(function (row) { return row.id === targetId; });
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    idx = (idx + dir + list.length) % list.length;
    selectTarget(list[idx].id);
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
    renderFoodStatus();
    draw();
    pumpKeyboardWalk(now);
    requestAnimationFrame(tickFps);
}

document.addEventListener('dragover', function (ev) {
    if (!currentDrag) return;
    if (browseUi && browseUi.isBrowseSurface(ev.target)) {
        ev.preventDefault();
        return;
    }
    highlightDropTarget(ev.target);
    if (!containerHitFromTarget(ev.target)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
});

document.addEventListener('drop', function (ev) {
    if (!currentDrag) return;
    if (browseUi && browseUi.isBrowseSurface(ev.target)) {
        ev.preventDefault();
        return;
    }
    if (!containerHitFromTarget(ev.target)) return;
    onContainerDrop(ev);
});

// Native OS menu off inside the play workspace (canvas, docks, bag, eq).
// Capture preventDefault does not stop app RMB handlers. Header stays native.
document.addEventListener('contextmenu', function (ev) {
    const t = ev && ev.target;
    if (t && typeof t.closest === 'function'
        && (t.closest('.play-shell') || t.closest('#ctx-menu'))) {
        ev.preventDefault();
    }
}, true);

if (canvas) {
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    canvas.addEventListener('pointerdown', onCanvasPointer);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerleave', onCanvasPointerLeave);
    canvas.addEventListener('click', function (ev) {
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            suppressNextDocClick = false;
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }
    });
    canvas.addEventListener('dragover', function (ev) {
        if (!currentDrag) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    });
    canvas.addEventListener('drop', function (ev) {
        ev.preventDefault();
        if (!currentDrag || !self) return;
        const dest = canvasTile(ev);
        if (!dest) return;
        if (currentDrag.kind === 'container') {
            moveItemWithSplit(
                { kind: 'container', containerUid: currentDrag.containerId, index: currentDrag.slotIndex },
                tileMoveLoc(dest.x, dest.y, dest.z, 0),
                currentDrag.item,
                ev
            );
        } else if (currentDrag.kind === 'equipment') {
            moveItemWithSplit(
                { kind: 'equipment', slot: currentDrag.slot },
                tileMoveLoc(dest.x, dest.y, dest.z, 0),
                currentDrag.item,
                ev
            );
        } else if (currentDrag.kind === 'ground') {
            if (!groundByUid.has(currentDrag.uid)) return;
            moveItemWithSplit(
                tileMoveLoc(currentDrag.x, currentDrag.y, currentDrag.z, currentDrag.stackIndex),
                tileMoveLoc(dest.x, dest.y, dest.z, 0),
                currentDrag.item,
                ev
            );
        }
        onDragEnd();
    });
}

window.addEventListener('pointerdown', function (ev) {
    if (ev.button === 0) buttonsDown.left = true;
    if (ev.button === 2) buttonsDown.right = true;
}, true);
window.addEventListener('pointerup', function (ev) {
    if (ev.button === 0) buttonsDown.left = false;
    if (ev.button === 2) buttonsDown.right = false;
    onCanvasPointerUp(ev);
    if (suppressNextCanvasClick || suppressNextDocClick) {
        setTimeout(function () {
            suppressNextCanvasClick = false;
            suppressNextDocClick = false;
        }, 150);
    }
});
window.addEventListener('pointermove', function (ev) {
    if (groundDrag) {
        updateGroundDragAvatar(ev);
    }
});
window.addEventListener('pointercancel', function (ev) {
    if (ev.button === 0) buttonsDown.left = false;
    if (ev.button === 2) buttonsDown.right = false;
    suppressNextCanvasClick = false;
    suppressNextDocClick = false;
    if (groundDrag) {
        groundDrag = null;
        currentDrag = null;
        removeGroundDragAvatar();
    }
});

window.addEventListener('keydown', function (ev) {
    if (!self || downed) return;
    if (KeyWalk.isTypingTarget && KeyWalk.isTypingTarget(ev.target)) return;
    if (typeof EngineActionBarAssign !== 'undefined' && EngineActionBarAssign.isBusy && EngineActionBarAssign.isBusy()) return;
    const token = hotkeyToken(ev);
    const action = generalAction(token);
    function owned() {
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }
    if (ev.key === 'Escape') {
        // Settings closes itself. Escape does not close an open bag.
        ev.preventDefault();
        if (action === 'stopAutowalk') {
            keyWalk.reset();
            stopWalk();
        }
        hideCtx();
        if (groundDrag) {
            groundDrag = null;
            currentDrag = null;
            removeGroundDragAvatar();
        }
        if (talkNpc) send(C2S.TALK_CLOSE, u32buf(talkNpc));
        return;
    }
    if (action === 'stopAutowalk') {
        ev.preventDefault();
        keyWalk.reset();
        stopWalk();
        owned();
        return;
    }
    if (action === 'targetNext' || action === 'targetPrev') {
        ev.preventDefault();
        cycleTarget(action === 'targetPrev' ? -1 : 1);
        owned();
        return;
    }
    if (action === 'toggleAutoChase') {
        ev.preventDefault();
        setAutoChase(!autoChase);
        owned();
        return;
    }
    const dir = token && GeneralHotkeys && GeneralHotkeys.moveDir
        ? GeneralHotkeys.moveDir(token, generalHotkeys)
        : null;
    if (action && action.indexOf('move') === 0 && dir == null) {
        ev.preventDefault();
        owned();
        return;
    }
    if (ev.key === 'u' || ev.key === 'U') {
        ev.preventDefault();
        keyWalk.reset();
        stopWalk();
        send(C2S.USE_STAIR, new Uint8Array(0));
        return;
    }
    if (dir == null) return;
    ev.preventDefault();
    const now = nowMs();
    if (!keyWalk.keyDown(token, now)) return;
    cancelClickWalk();
    pumpKeyboardWalk(now);
    owned();
});

window.addEventListener('keyup', function (ev) {
    const token = hotkeyToken(ev);
    const dir = token && GeneralHotkeys && GeneralHotkeys.moveDir
        ? GeneralHotkeys.moveDir(token, generalHotkeys)
        : KeyWalk.dirOf(ev.code);
    if (dir == null) return;
    ev.preventDefault();
    keyWalk.keyUp(token || ev.code);
    if (!keyWalk.isHeld()) pumpChase();
});

window.addEventListener('blur', function () {
    keyWalk.reset();
    suppressNextCanvasClick = false;
    suppressNextDocClick = false;
    if (groundDrag) {
        groundDrag = null;
        currentDrag = null;
        removeGroundDragAvatar();
    }
});

document.addEventListener('click', function (ev) {
    if (suppressNextDocClick) {
        suppressNextDocClick = false;
        return;
    }
    const t = ev.target;
    const menu = $('ctx-menu');
    if (menu && !menu.hidden && !menu.contains(t)) hideCtx();
    const pop = $('item-popover');
    if (pop && !pop.hidden && pop.dataset.sticky === '1'
        && !pop.contains(t)
        && !(menu && menu.contains(t))) {
        hideItemPopover(true);
    }
});

function initCollapsiblePanels() {
    const panels = document.querySelectorAll('.panel-collapsible-section');
    const prefs = (typeof loadSidebarPanelsPrefs === 'function' ? loadSidebarPanelsPrefs() : null) || { collapsed: {}, heights: {} };

    panels.forEach(function (sec) {
        const panelId = sec.getAttribute('data-panel-id');
        const header = sec.querySelector('.panel-toggle-header');
        const content = sec.querySelector('.panel-collapsible-content');
        const icon = sec.querySelector('.panel-toggle-icon');
        const closeBtn = sec.querySelector('.panel-close-btn');
        const handle = sec.querySelector('.panel-resize-handle');
        const scroll = sec.querySelector('.panel-body-scroll');

        if (panelId && prefs.heights && prefs.heights[panelId] && scroll) {
            scroll.style.maxHeight = prefs.heights[panelId] + 'px';
        }

        if (panelId && prefs.collapsed && prefs.collapsed[panelId]) {
            sec.classList.add('panel-collapsed');
            if (content) content.style.display = 'none';
            if (handle) handle.style.display = 'none';
            if (icon) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-right');
            }
        }

        if (header) {
            header.addEventListener('click', function (ev) {
                const t = ev.target;
                if (t && (t.closest('button') || t.closest('.combat-sort-container') || t.closest('#combatSortDropdown') || t.closest('.panel-title-actions') || t.closest('select'))) {
                    return;
                }
                const isCollapsed = sec.classList.toggle('panel-collapsed');
                if (content) content.style.display = isCollapsed ? 'none' : '';
                if (handle) handle.style.display = isCollapsed ? 'none' : '';
                if (icon) {
                    if (isCollapsed) {
                        icon.classList.remove('fa-chevron-down');
                        icon.classList.add('fa-chevron-right');
                    } else {
                        icon.classList.remove('fa-chevron-right');
                        icon.classList.add('fa-chevron-down');
                    }
                }
                if (panelId && typeof saveSidebarPanelsPrefs === 'function') {
                    prefs.collapsed[panelId] = isCollapsed;
                    saveSidebarPanelsPrefs(prefs);
                }
            });
        }

        if (panelId && prefs.closed && prefs.closed[panelId]) {
            sec.hidden = true;
        }


        if (closeBtn) {
            closeBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                sec.hidden = true;
                if (panelId && typeof saveSidebarPanelsPrefs === 'function') {
                    if (!prefs.closed) prefs.closed = {};
                    prefs.closed[panelId] = true;
                    saveSidebarPanelsPrefs(prefs);
                }
                const bar = $('sidebarPanelToggles');
                if (bar && panelId) {
                    const toggleBtn = bar.querySelector('[data-panel-toggle="' + panelId + '"]');
                    if (toggleBtn) {
                        toggleBtn.classList.remove('is-open');
                        toggleBtn.classList.add('is-closed');
                        toggleBtn.setAttribute('aria-pressed', 'false');
                        const def = SIDEBAR_PANEL_TOGGLE_DEFS.find(function (d) { return d.id === panelId; });
                        toggleBtn.title = 'Open ' + (def ? def.label : panelId);
                    }
                }
            });
        }


        if (handle && scroll) {
            let startY = 0;
            let startH = 0;
            function onPointerMove(e) {
                const next = Math.max(72, Math.min(480, startH + (e.clientY - startY)));
                scroll.style.maxHeight = next + 'px';
                if (panelId) {
                    prefs.heights[panelId] = next;
                }
            }
            function onPointerUp() {
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                sec.classList.remove('is-resizing');
                if (panelId && typeof saveSidebarPanelsPrefs === 'function') {
                    saveSidebarPanelsPrefs(prefs);
                }
            }
            handle.addEventListener('pointerdown', function (e) {
                if (sec.classList.contains('panel-collapsed')) return;
                if (e.button != null && e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                startY = e.clientY;
                startH = scroll.offsetHeight || 210;
                sec.classList.add('is-resizing');
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
            });
        }
    });
}

const SIDEBAR_PANEL_TOGGLE_DEFS = [
    { id: 'backpack', btnId: 'toggleBackpackBtn', icon: 'fa-bag-shopping', label: 'Backpack' },
    { id: 'combat', btnId: 'toggleCombatBtn', icon: 'fa-hand-fist', label: 'Combat' },
    { id: 'skills', btnId: 'toggleSkillsBtn', icon: 'fa-chart-simple', label: 'Skills' }
];

function updateSidebarPanelToggles() {
    const bar = $('sidebarPanelToggles');
    if (!bar) return;
    SIDEBAR_PANEL_TOGGLE_DEFS.forEach(function (def) {
        const btn = bar.querySelector('[data-panel-toggle="' + def.id + '"]') || $(def.btnId);
        const sec = document.querySelector('.panel-collapsible-section[data-panel-id="' + def.id + '"]');
        if (!btn || !sec) return;
        const isOpen = !sec.hidden;
        btn.classList.toggle('is-open', isOpen);
        btn.classList.toggle('is-closed', !isOpen);
        btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
        btn.title = (isOpen ? 'Close ' : 'Open ') + def.label;
    });
}

function openSidebarPanel(panelId) {
    const sec = document.querySelector('.panel-collapsible-section[data-panel-id="' + panelId + '"]');
    if (sec) {
        sec.hidden = false;
        const prefs = typeof loadSidebarPanelsPrefs === 'function' ? loadSidebarPanelsPrefs() : { heights: {}, collapsed: {}, closed: {} };
        if (!prefs.closed) prefs.closed = {};
        prefs.closed[panelId] = false;
        if (typeof saveSidebarPanelsPrefs === 'function') {
            saveSidebarPanelsPrefs(prefs);
        }
        updateSidebarPanelToggles();
    }
}

function initSidebarPanels() {
    const bar = $('sidebarPanelToggles');
    if (!bar) return;
    SIDEBAR_PANEL_TOGGLE_DEFS.forEach(function (def) {
        let btn = bar.querySelector('[data-panel-toggle="' + def.id + '"]') || $(def.btnId);
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = def.btnId;
            btn.className = 'btn btn-xs panel-toggle-btn';
            btn.setAttribute('data-panel-toggle', def.id);
            btn.setAttribute('aria-label', 'Toggle ' + def.label);
            btn.innerHTML = '<i class="fa-solid ' + def.icon + '" aria-hidden="true"></i>';
            bar.appendChild(btn);
        }
        btn.onclick = function (ev) {
            ev.preventDefault();
            const sec = document.querySelector('.panel-collapsible-section[data-panel-id="' + def.id + '"]');
            if (!sec) return;
            const willOpen = sec.hidden;
            sec.hidden = !willOpen;
            const prefs = typeof loadSidebarPanelsPrefs === 'function' ? loadSidebarPanelsPrefs() : { heights: {}, collapsed: {}, closed: {} };
            if (!prefs.closed) prefs.closed = {};
            prefs.closed[def.id] = !willOpen;
            if (typeof saveSidebarPanelsPrefs === 'function') {
                saveSidebarPanelsPrefs(prefs);
            }
            updateSidebarPanelToggles();
        };
    });
    updateSidebarPanelToggles();
}

document.addEventListener('DOMContentLoaded', function () {
    const leave = $('leave');
    const leaveSide = $('leave-side');
    if (leave) leave.addEventListener('click', leaveWorld);
    if (leaveSide) leaveSide.addEventListener('click', leaveWorld);
    const sortEl = $('combat-sort');
    if (sortEl) sortEl.value = combatSort;
    const sortBtn = $('combatSortBtn');
    const sortDropdown = $('combatSortDropdown');
    const sortItems = document.querySelectorAll('.combat-sort-item');
    function setCombatSort(next) {
        combatSort = next;
        saveCombatSort(next);
        if (sortEl) sortEl.value = next;
        if (sortBtn) sortBtn.title = 'Sort: ' + next.replace(/_/g, ' ');
        if (sortItems) {
            sortItems.forEach(function (it) {
                it.classList.toggle('active', it.getAttribute('data-sort') === next);
            });
        }
        renderCombat();
    }
    if (sortEl) {
        sortEl.value = combatSort;
        sortEl.addEventListener('change', function () {
            setCombatSort(sortEl.value);
        });
    }
    if (sortBtn && sortDropdown) {
        sortBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (sortDropdown.hidden) placeCombatSortDropdown();
            else sortDropdown.hidden = true;
        });
        document.addEventListener('click', function (ev) {
            if (!sortDropdown.hidden) {
                const t = ev.target;
                if (
                    t &&
                    t.closest &&
                    (t.closest('.combat-sort-container') || t.closest('#combatSortDropdown'))
                ) {
                    return;
                }
                sortDropdown.hidden = true;
            }
        });
    }
    if (sortItems) {
        sortItems.forEach(function (item) {
            item.addEventListener('click', function (ev) {
                ev.stopPropagation();
                const k = item.getAttribute('data-sort');
                if (k) {
                    setCombatSort(k);
                    if (sortDropdown) sortDropdown.hidden = true;
                }
            });
        });
    }
    setCombatSort(combatSort);

    const fs = $('fullscreen-btn') || $('fullscreenToggleBtn');
    const wrap = $('gameCanvasContainer');
    if (fs && wrap) {
        fs.addEventListener('click', function () {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (fsEl) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
                if (exit) {
                    try {
                        const res = exit.call(document);
                        if (res && typeof res.catch === 'function') res.catch(function () {});
                    } catch (e) {}
                }
            } else {
                const req = wrap.requestFullscreen || wrap.webkitRequestFullscreen || wrap.mozRequestFullScreen;
                if (req) {
                    try {
                        const res = req.call(wrap);
                        if (res && typeof res.catch === 'function') res.catch(function () {});
                    } catch (e) {}
                }
            }
        });
        const onFsChange = function () {
            hideCtx();
            reparentFloatRoot();
            if (typeof EngineActionBarAssign !== 'undefined' && EngineActionBarAssign.closeAll) {
                EngineActionBarAssign.closeAll();
            }
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            const enterIcon = $('enterFullscreenIcon');
            const exitIcon = $('exitFullscreenIcon');
            if (enterIcon) enterIcon.style.display = isFs ? 'none' : 'block';
            if (exitIcon) exitIcon.style.display = isFs ? 'block' : 'none';
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
        document.addEventListener('mozfullscreenchange', onFsChange);
    }

    if (typeof EngineClientWindow !== 'undefined' && EngineClientWindow.attach) {
        const clientWindow = EngineClientWindow.attach({
            document: document,
            window: window,
            place: FloatPlace,
            getCharacter: function () { return characterView(); },
            root: inventoryFloatRoot()
        });
        if (clientWindow && clientWindow.bindControls) {
            clientWindow.bindControls({
                mouse: mouse,
                autoChase: autoChase,
                onMouse: function (next) {
                    mouse = saveMouseControls(next);
                    return mouse;
                },
                onAutoChase: function (on) {
                    setAutoChase(on);
                }
            });
        }
        loadGeneralHotkeyDoc();
        if (typeof EngineActionBars !== 'undefined' && EngineActionBars.setGeneralBridge) {
            EngineActionBars.setGeneralBridge({
                labelFor: function (hotkey) {
                    if (!GeneralHotkeys) return '';
                    const id = GeneralHotkeys.match(generalHotkeys, hotkey);
                    return id ? GeneralHotkeys.labelOf(id) : '';
                },
                release: function (hotkey) {
                    if (!GeneralHotkeys) return;
                    generalHotkeys = GeneralHotkeys.removeHotkey(generalHotkeys, hotkey);
                    persistGeneralHotkeys();
                }
            });
        }
    }

    if (typeof EngineActionBars !== 'undefined' && EngineActionBars.bindHost) {
        EngineActionBars.bindHost({
            send: send,
            protocol: EngineProtocol,
            cast: cast,
            getSelf: function () { return self; },
            getTargetId: function () { return targetId; },
            getOthers: function () { return others; },
            getBag: function () { return bag; },
            getOpenBag: function () { return openBag; },
            getOpenBags: function () {
                const out = [];
                openBags.forEach(function (rec) {
                    if (rec && rec.view) out.push(rec.view);
                });
                return out;
            },
            getEquipment: function () { return equipment; },
            getTick: function () { return lastTick; },
            getUps: function () { return ups; },
            isDowned: function () { return downed; },
            entityById: entityById,
            canvasTile: canvasTile,
            entityAtTile: function (tile) {
                const hit = hitFromTile(tile);
                return hit && hit.creature ? hit.creature : null;
            },
            fct: function (text, color) {
                const msg = text == null ? '' : String(text);
                if (!msg) return;
                if (color && self && typeof EngineCombatFx !== 'undefined'
                    && typeof EngineCombatFx.pushFct === 'function') {
                    EngineCombatFx.pushFct({
                        x: self.x,
                        y: self.y,
                        z: self.z,
                        text: msg,
                        color: color,
                        life: 1.2
                    });
                    return;
                }
                fct(msg);
            }
        });
    }
    initCollapsiblePanels();
    $('dialog-close') && $('dialog-close').addEventListener('click', function () {
        if (talkNpc) send(C2S.TALK_CLOSE, u32buf(talkNpc));
        hideFloat('npc-dialog');
    });
    $('shop-close') && $('shop-close').addEventListener('click', function () {
        hideFloat('npc-shop');
        shopNpc = 0;
        shopUiState = null;
        currentShop = null;
    });
    $('loot-close') && $('loot-close').addEventListener('click', function () {
        if (openCorpse) send(C2S.LOOT_CLOSE, u32buf(openCorpse));
        openCorpse = 0;
        hideFloat('loot-panel');
    });
    initFloatPanelDrag('npc-dialog');
    initFloatPanelDrag('npc-shop');
    initFloatPanelDrag('loot-panel');
    initSidebarPanels();
    if (MinimapView && typeof MinimapView.mount === 'function') {
        MinimapView.mount(document);
        if (typeof MinimapView.setTileClick === 'function') MinimapView.setTileClick(onMinimapClick);
    }
    renderEquipment();
    loadItemCatalog();
    loadVocationSprites();
    reparentFloatRoot();
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

if (typeof window !== 'undefined') {
    window.wireFloatHeaderDrag = wireFloatHeaderDrag;
    window.initFloatPanelDrag = initFloatPanelDrag;
    window.bringFloatToFront = bringFloatToFront;
}

