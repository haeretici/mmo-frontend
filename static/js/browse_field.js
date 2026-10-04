'use strict';

/**
 * Browse Field window. One float per tile. play.js sends, receives, and forwards.
 * Tile keys are `z:x:y` (server tileKey). Map ground keys in play.js stay `z,x,y`.
 * Slots are not bags: no data-container-uid, so a drop on this window is not a container drop.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineBrowseField = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const TITLE = 'Browse Field';
    const BROWSE_FIELD_CAPACITY = 30;
    const MAX_BROWSE_WINDOWS = 8;
    const BROWSE_FIELD_RANGE = 1;

    function tileKey(x, y, z) {
        return (z | 0) + ':' + (x | 0) + ':' + (y | 0);
    }

    function parseTileKey(key) {
        const parts = String(key || '').split(':');
        if (parts.length < 3) return null;
        return { z: parts[0] | 0, x: parts[1] | 0, y: parts[2] | 0 };
    }

    function chebyshevSameFloor(a, b) {
        if (!a || !b) return Infinity;
        if ((a.z | 0) !== (b.z | 0)) return Infinity;
        return Math.max(Math.abs((a.x | 0) - (b.x | 0)), Math.abs((a.y | 0) - (b.y | 0)));
    }

    function floorText(playerZ, tileZ) {
        if ((playerZ | 0) > (tileZ | 0)) return 'First go upstairs.';
        if ((playerZ | 0) < (tileZ | 0)) return 'First go downstairs.';
        return '';
    }

    function planOpen(player, tile, nearestApproach, isWalkable) {
        if (!player || !tile || tile.x == null || tile.y == null) {
            return { type: 'fct', text: 'There is no way.' };
        }
        const destTile = { x: tile.x | 0, y: tile.y | 0, z: tile.z | 0 };
        if ((player.z | 0) !== destTile.z) {
            return { type: 'fct', text: floorText(player.z, destTile.z) };
        }
        if (chebyshevSameFloor(player, destTile) <= BROWSE_FIELD_RANGE) {
            return { type: 'send', tile: destTile };
        }
        const dest = typeof nearestApproach === 'function'
            ? nearestApproach(player, destTile, BROWSE_FIELD_RANGE, isWalkable)
            : null;
        if (!dest) return { type: 'fct', text: 'There is no way.' };
        return {
            type: 'walk',
            dest: { x: dest.x | 0, y: dest.y | 0 },
            tile: destTile
        };
    }

    function createState() {
        return {
            order: [],
            slots: Object.create(null),
            pending: Object.create(null)
        };
    }

    function removeKey(state, key) {
        if (!state || !key) return;
        delete state.slots[key];
        delete state.pending[key];
        const i = state.order.indexOf(key);
        if (i >= 0) state.order.splice(i, 1);
    }

    function isUseWithItem(item) {
        const id = item && item.id ? String(item.id) : '';
        if (!id) return false;
        if (id === 'rope' || id === 'shovel') return true;
        return /(^|_)rope(_|$)/.test(id) || /(^|_)shovel(_|$)/.test(id);
    }

    function menuRows(it, deps) {
        const d = deps || {};
        const rows = [
            { label: 'Look', action: 'LOOK' },
            { label: 'Use', action: 'USE' }
        ];
        if (isUseWithItem(it)) rows.push({ label: 'Use with…', action: 'USE_WITH' });
        if (it && ((it.flags | 0) & 1)) rows.push({ label: 'Open', action: 'OPEN' });
        rows.push({ label: 'Pick up', action: 'PICKUP' });
        if (typeof d.tradeLabel === 'function') {
            const label = d.tradeLabel(it);
            if (label) rows.push({ label: String(label), action: 'TRADE' });
        }
        return rows;
    }

    function isBrowseSurface(node) {
        if (!node) return false;
        if (node.dataset && node.dataset.browseField != null && node.dataset.browseField !== '') {
            return true;
        }
        if (typeof node.closest !== 'function') return false;
        return !!node.closest('[data-browse-field], .browse-field-panel');
    }

    function dropPlan(node) {
        if (isBrowseSurface(node)) return { type: 'NONE' };
        return null;
    }

    function keysLeftRange(state, player) {
        const out = [];
        if (!state || !player) return out;
        for (let i = 0; i < state.order.length; i++) {
            const key = state.order[i];
            const rec = state.slots[key];
            if (rec && chebyshevSameFloor(player, rec) > BROWSE_FIELD_RANGE) out.push(key);
        }
        const pending = Object.keys(state.pending);
        for (let i = 0; i < pending.length; i++) {
            const rec = state.pending[pending[i]];
            if (rec && chebyshevSameFloor(player, rec) > BROWSE_FIELD_RANGE && out.indexOf(pending[i]) < 0) {
                out.push(pending[i]);
            }
        }
        return out;
    }

    function attach(deps) {
        const d = deps || {};
        const state = createState();
        const panels = Object.create(null);

        function sync() {
            if (typeof d.syncAria === 'function') d.syncAria();
        }

        function destroyPanel(key) {
            const panel = panels[key];
            if (panel && panel.el && panel.el.parentNode) panel.el.parentNode.removeChild(panel.el);
            delete panels[key];
        }

        function closeKey(key, send) {
            const pos = state.slots[key] || state.pending[key] || parseTileKey(key);
            removeKey(state, key);
            destroyPanel(key);
            if (send && pos && typeof d.sendClose === 'function') d.sendClose(pos.x, pos.y, pos.z);
            sync();
        }

        function closeAll(send) {
            const keys = state.order.slice();
            const pending = Object.keys(state.pending);
            for (let i = 0; i < pending.length; i++) {
                if (keys.indexOf(pending[i]) < 0) keys.push(pending[i]);
            }
            for (let i = 0; i < keys.length; i++) closeKey(keys[i], send);
        }

        function showSlotMenu(clientX, clientY, rec, it) {
            const el = typeof d.menuEl === 'function' ? d.menuEl() : null;
            if (!el) return;
            if (typeof d.hideChrome === 'function') d.hideChrome();
            el.textContent = '';
            const rows = menuRows(it, d);
            for (let i = 0; i < rows.length; i++) {
                const entry = rows[i];
                const b = el.ownerDocument.createElement('button');
                b.type = 'button';
                b.className = 'inv-context-item';
                b.textContent = entry.label;
                b.onclick = function (ev) {
                    if (typeof d.hideChrome === 'function') d.hideChrome();
                    if (entry.action === 'LOOK') {
                        if (typeof d.showLook === 'function') d.showLook(clientX, clientY, it.id, it.count);
                    } else if (entry.action === 'USE') {
                        if (typeof d.useItem === 'function') d.useItem(it.uid);
                    } else if (entry.action === 'USE_WITH') {
                        if (typeof d.armUseWith === 'function') d.armUseWith(it);
                    } else if (entry.action === 'OPEN') {
                        if (typeof d.openBag === 'function') d.openBag(it.uid, it.id);
                    } else if (entry.action === 'PICKUP') {
                        if (typeof d.pickup === 'function') d.pickup(rec, it, ev);
                    } else if (entry.action === 'TRADE') {
                        if (typeof d.armTrade === 'function') d.armTrade(rec, it);
                    }
                };
                el.appendChild(b);
            }
            el.hidden = false;
            if (typeof d.placeMenu === 'function') d.placeMenu(el, clientX, clientY);
        }

        function paint(panel, rec) {
            if (!panel || !panel.grid || !rec) return;
            const items = rec.slots || [];
            const cap = Math.max(BROWSE_FIELD_CAPACITY, items.length);
            const grid = panel.grid;
            const doc = grid.ownerDocument;
            while (grid.children.length < cap) {
                const s = doc.createElement('div');
                s.className = 'backpack-slot inv-slot';
                grid.appendChild(s);
            }
            while (grid.children.length > cap) grid.removeChild(grid.lastChild);
            if (panel.count) panel.count.textContent = '(' + items.length + '/' + cap + ')';
            for (let i = 0; i < cap; i++) {
                const slot = grid.children[i];
                const it = items[i] || null;
                slot.className = 'backpack-slot inv-slot';
                slot.removeAttribute('data-container-uid');
                slot.removeAttribute('data-open-bag-uid');
                if (slot.dataset) {
                    delete slot.dataset.containerUid;
                    delete slot.dataset.containerId;
                }
                slot.innerHTML = '';
                if (!it) {
                    slot.setAttribute('draggable', 'false');
                    slot.title = 'Empty slot';
                    if (typeof d.bindLook === 'function') d.bindLook(slot, null);
                    slot.onpointerdown = null;
                    slot.oncontextmenu = null;
                    slot.ondblclick = null;
                    continue;
                }
                slot.classList.add('is-filled');
                if ((it.flags | 0) & 1) slot.classList.add('is-container');
                slot.setAttribute('draggable', 'false');
                slot.title = it.id || '';
                if (typeof d.spriteUrl === 'function') {
                    const img = doc.createElement('img');
                    img.src = d.spriteUrl(it.id);
                    img.alt = typeof d.itemLabel === 'function' ? d.itemLabel(it.id) : String(it.id || '');
                    img.draggable = false;
                    slot.appendChild(img);
                }
                if ((it.count | 0) > 1) {
                    const badge = doc.createElement('span');
                    badge.className = 'inv-stack-count';
                    badge.textContent = String(it.count | 0);
                    slot.appendChild(badge);
                }
                if (typeof d.bindLook === 'function') d.bindLook(slot, it.id, it.count);
                slot.onpointerdown = function (ev) {
                    if (!ev || ev.button !== 0 || typeof d.beginDrag !== 'function') return;
                    d.beginDrag({
                        uid: it.uid,
                        x: rec.x,
                        y: rec.y,
                        z: rec.z,
                        stackIndex: it.stackIndex | 0,
                        item: { id: it.id, count: it.count | 0, flags: it.flags | 0, uid: it.uid }
                    }, ev);
                };
                slot.oncontextmenu = function (ev) {
                    if (ev && ev.preventDefault) ev.preventDefault();
                    showSlotMenu(ev.clientX, ev.clientY, rec, it);
                };
                slot.ondblclick = function (ev) {
                    if (ev && ev.preventDefault) ev.preventDefault();
                    if ((it.flags | 0) & 1) {
                        if (typeof d.openBag === 'function') d.openBag(it.uid, it.id);
                    } else if (typeof d.useItem === 'function') {
                        d.useItem(it.uid);
                    }
                };
            }
        }

        function createPanel(rec, key) {
            const root = typeof d.floatRoot === 'function' ? d.floatRoot() : null;
            const doc = d.doc || (typeof document !== 'undefined' ? document : null);
            if (!root || !doc || typeof doc.createElement !== 'function') return null;
            const el = doc.createElement('div');
            el.className = 'inv-float-panel browse-field-panel';
            el.dataset.browseField = '1';
            el.setAttribute('data-browse-key', key);
            el.setAttribute('aria-label', TITLE);

            const header = doc.createElement('div');
            header.className = 'inv-panel-header';
            const title = doc.createElement('span');
            title.className = 'inv-panel-title';
            title.textContent = TITLE;
            const count = doc.createElement('span');
            count.className = 'inv-panel-count';
            count.textContent = '(0/' + BROWSE_FIELD_CAPACITY + ')';
            const closeBtn = doc.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'inv-panel-close';
            closeBtn.setAttribute('aria-label', 'Close browse field');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                closeKey(key, true);
            });
            header.appendChild(title);
            header.appendChild(count);
            header.appendChild(closeBtn);

            const scroll = doc.createElement('div');
            scroll.className = 'backpack-grid-scroll inv-panel-scroll';
            const grid = doc.createElement('div');
            grid.className = 'backpack-grid inv-panel-grid';
            scroll.appendChild(grid);
            el.appendChild(header);
            el.appendChild(scroll);
            root.appendChild(el);
            if (typeof d.wireDrag === 'function') d.wireDrag(header, el);
            el.addEventListener('pointerdown', function () {
                if (typeof d.raise === 'function') d.raise(el);
            });
            if (typeof d.place === 'function') d.place(el, { x: rec.x, y: rec.y, z: rec.z });
            if (typeof d.raise === 'function') d.raise(el);
            return { el: el, grid: grid, count: count, key: key };
        }

        function reserveAndSend(x, y, z) {
            const key = tileKey(x, y, z);
            while (state.order.length + Object.keys(state.pending).length >= MAX_BROWSE_WINDOWS) {
                if (!state.order.length) break;
                closeKey(state.order[0], true);
            }
            state.pending[key] = { x: x | 0, y: y | 0, z: z | 0 };
            if (typeof d.sendBrowse === 'function') d.sendBrowse(x | 0, y | 0, z | 0);
        }

        function chooseTile(x, y, z) {
            const key = tileKey(x, y, z);
            if (state.slots[key] || state.pending[key]) {
                closeKey(key, true);
                return { action: 'close', key: key };
            }
            const player = typeof d.getPlayer === 'function' ? d.getPlayer() : null;
            const plan = planOpen(player, { x: x, y: y, z: z }, d.nearestApproach, d.isWalkable);
            if (plan.type === 'fct') {
                if (typeof d.fct === 'function') d.fct(plan.text);
                return plan;
            }
            if (plan.type === 'walk') {
                if (typeof d.startWalk === 'function') {
                    d.startWalk(plan.dest, {
                        type: 'BROWSE_FIELD',
                        x: plan.tile.x,
                        y: plan.tile.y,
                        z: plan.tile.z
                    });
                }
                return plan;
            }
            reserveAndSend(plan.tile.x, plan.tile.y, plan.tile.z);
            return { action: 'open', key: key };
        }

        function arrive(pending) {
            if (!pending) return { type: 'ignore' };
            const player = typeof d.getPlayer === 'function' ? d.getPlayer() : null;
            const plan = planOpen(player, pending, d.nearestApproach, d.isWalkable);
            if (plan.type !== 'send') {
                const text = plan.type === 'fct' ? plan.text : 'There is no way.';
                if (typeof d.fct === 'function') d.fct(text);
                return plan.type === 'fct' ? plan : { type: 'fct', text: text };
            }
            const key = tileKey(plan.tile.x, plan.tile.y, plan.tile.z);
            if (state.slots[key] || state.pending[key]) return { action: 'open', key: key };
            reserveAndSend(plan.tile.x, plan.tile.y, plan.tile.z);
            return { action: 'open', key: key };
        }

        function applySnapshot(msg) {
            if (!msg) return null;
            const key = tileKey(msg.x, msg.y, msg.z);
            const slots = Array.isArray(msg.slots) ? msg.slots : [];
            const n = msg.n != null ? (msg.n | 0) : slots.length;
            if (!n || !slots.length) {
                closeKey(key, false);
                return { key: key, closed: true };
            }
            const evicted = [];
            if (!state.slots[key]) {
                while (state.order.length >= MAX_BROWSE_WINDOWS) {
                    const old = state.order[0];
                    evicted.push(old);
                    closeKey(old, true);
                }
                state.order.push(key);
            }
            delete state.pending[key];
            const rec = {
                x: msg.x | 0,
                y: msg.y | 0,
                z: msg.z | 0,
                slots: slots.slice()
            };
            state.slots[key] = rec;
            let panel = panels[key];
            if (!panel) {
                panel = createPanel(rec, key);
                if (panel) panels[key] = panel;
            }
            if (panel) paint(panel, rec);
            sync();
            return {
                key: key,
                closed: false,
                evicted: evicted,
                top: slots[0],
                capacity: Math.max(BROWSE_FIELD_CAPACITY, slots.length)
            };
        }

        function onPlayerMoved(prev, player) {
            if (!player) return;
            if (!prev || (prev.z | 0) !== (player.z | 0)) {
                closeAll(true);
                return;
            }
            const gone = keysLeftRange(state, player);
            for (let i = 0; i < gone.length; i++) closeKey(gone[i], true);
        }

        function reset() {
            closeAll(false);
        }

        return {
            chooseTile: chooseTile,
            arrive: arrive,
            applySnapshot: applySnapshot,
            onPlayerMoved: onPlayerMoved,
            reset: reset,
            closeAll: closeAll,
            isBrowseSurface: isBrowseSurface,
            isOpen: function (x, y, z) { return !!state.slots[tileKey(x, y, z)]; },
            isAnyOpen: function () { return state.order.length > 0; },
            openCount: function () { return state.order.length; }
        };
    }

    return {
        TITLE: TITLE,
        BROWSE_FIELD_CAPACITY: BROWSE_FIELD_CAPACITY,
        MAX_BROWSE_WINDOWS: MAX_BROWSE_WINDOWS,
        BROWSE_FIELD_RANGE: BROWSE_FIELD_RANGE,
        tileKey: tileKey,
        floorText: floorText,
        planOpen: planOpen,
        keysLeftRange: keysLeftRange,
        isBrowseSurface: isBrowseSurface,
        dropPlan: dropPlan,
        isUseWithItem: isUseWithItem,
        menuRows: menuRows,
        attach: attach
    };
});
