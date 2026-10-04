'use strict';

/**
 * Player trade window and the “Trade with …” aim.
 * Backpack, equipment, open bags, ground items, and Browse Field rows arm it.
 * A battle-list row is an aim target. Rows in the Trade window are virtual:
 * not a drag source and not a drop target.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineTradeUi = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MENU_LABEL = 'Trade with …';
    const TITLE = 'Trade';
    const PARTNER_RANGE = 2;
    const ITEM_RANGE = 1;
    const WALK_HOPS = 2;

    function withTradeEntry(entries, item) {
        const rows = Array.isArray(entries) ? entries.slice() : [];
        if (!item || item.empty || item.id == null || item.id === '') return rows;
        rows.push({ label: MENU_LABEL, action: 'TRADE' });
        return rows;
    }

    /**
     * Map click while the crosshair is armed.
     * A player, monster, NPC, or empty tile sends TRADE_OFFER.
     * partnerId is the creature id, or 0 on an empty tile.
     * A corpse, world pin, ground item, or a click with no tile sends nothing.
     */
    function mapAim(hit, selfId) {
        if (!hit || hit.x == null || hit.y == null) {
            return { send: false, partnerId: 0 };
        }
        const creature = hit.creature;
        if (creature && creature.id != null && creature.id !== '') {
            return { send: true, partnerId: creature.id >>> 0 };
        }
        if (hit.isPlayerTile && selfId != null && selfId !== '') {
            return { send: true, partnerId: selfId >>> 0 };
        }
        if (hit.corpse || hit.corpseId || hit.worldPin || hit.groundMoveUid || hit.groundLookUid) {
            return { send: false, partnerId: 0 };
        }
        return { send: true, partnerId: 0 };
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

    /** Sidebar backpack and an open bag window. Equipment uses its own menu. */
    function containerAllowsTrade(kind) {
        return kind === 'bag' || kind === 'nested';
    }

    /**
     * Canvas ground item. Corpses, world pins, and fields are not items,
     * so a hit with none of the ground stacks returns null.
     */
    function groundOffer(hit) {
        if (!hit || hit.x == null || hit.y == null) return null;
        const item = hit.groundMoveItem || hit.pickableItem || hit.groundUseItem || null;
        if (!item || item.id == null || item.id === '') return null;
        return {
            from: {
                kind: 'tile',
                x: hit.x | 0,
                y: hit.y | 0,
                z: hit.z | 0,
                stackIndex: item.stackIndex != null ? (item.stackIndex | 0) : 0
            },
            item: { id: String(item.id), count: item.count | 0 }
        };
    }

    function itemTileOf(from) {
        if (!from || (from.kind !== 'tile' && from.kind !== 2)) return null;
        if (from.x == null || from.y == null) return null;
        return { x: from.x | 0, y: from.y | 0, z: from.z | 0 };
    }

    function partnerIdOf(partner) {
        if (!partner || partner.id == null || partner.id === '') return 0;
        return partner.id >>> 0;
    }

    /** Only a real player with a position is walked toward. Monsters and NPCs send at once. */
    function partnerTile(partner) {
        if (!partner || !partner.player) return null;
        if (partner.x == null || partner.y == null) return null;
        return { x: partner.x | 0, y: partner.y | 0, z: partner.z | 0 };
    }

    /**
     * One step before TRADE_OFFER. In range: send. Same floor and too far:
     * walk. Another floor, or no stand tile: a sentence and no packet.
     * A ground item is checked before the partner. The caller sends only
     * when type is send, after a walk arrives.
     */
    function planOffer(player, from, partner, nearestApproach) {
        if (!player || !from) return { type: 'fct', text: 'There is no way.' };
        const partnerId = partnerIdOf(partner);
        const itemTile = itemTileOf(from);
        const who = partnerTile(partner);
        if (itemTile && (player.z | 0) !== itemTile.z) {
            return { type: 'fct', text: floorText(player.z, itemTile.z) };
        }
        if (who && (player.z | 0) !== who.z) {
            return { type: 'fct', text: floorText(player.z, who.z) };
        }
        const itemFar = !!(itemTile && chebyshevSameFloor(player, itemTile) > ITEM_RANGE);
        const partnerFar = !!(who && chebyshevSameFloor(player, who) > PARTNER_RANGE);
        if (!itemFar && !partnerFar) {
            return { type: 'send', from: from, partnerId: partnerId };
        }
        const target = itemFar ? itemTile : who;
        const range = itemFar ? ITEM_RANGE : PARTNER_RANGE;
        const dest = typeof nearestApproach === 'function'
            ? nearestApproach(player, target, range)
            : null;
        if (!dest || dest.x == null || dest.y == null) {
            return { type: 'fct', text: 'There is no way.' };
        }
        if ((dest.x | 0) === (player.x | 0) && (dest.y | 0) === (player.y | 0)) {
            return { type: 'fct', text: 'There is no way.' };
        }
        return {
            type: 'walk',
            dest: { x: dest.x | 0, y: dest.y | 0 },
            from: from,
            partnerId: partnerId
        };
    }

    function copyItems(items) {
        const src = Array.isArray(items) ? items : [];
        const out = [];
        for (let i = 0; i < src.length; i++) {
            const it = src[i] || {};
            out.push({
                id: it.id != null ? String(it.id) : '',
                count: it.count | 0,
                flags: it.flags | 0
            });
        }
        return out;
    }

    function createSession() {
        return {
            open: false,
            ownName: '',
            ownItems: [],
            counterName: '',
            counterItems: [],
            accepted: false
        };
    }

    function applySnapshot(session, msg) {
        const current = session || createSession();
        if (!msg) return current;
        const side = msg.side | 0;
        if (side === 1 && !current.open) return current;
        const next = {
            open: current.open,
            ownName: current.ownName,
            ownItems: current.ownItems,
            counterName: current.counterName,
            counterItems: current.counterItems,
            accepted: current.accepted
        };
        const items = copyItems(msg.items);
        if (side === 0) {
            next.open = true;
            next.ownName = msg.name != null ? String(msg.name) : '';
            next.ownItems = items;
            return next;
        }
        if (side === 1) {
            next.counterName = msg.name != null ? String(msg.name) : '';
            next.counterItems = items;
            return next;
        }
        return current;
    }

    function acceptEnabled(session) {
        return !!(session && session.open && session.counterItems && session.counterItems.length && !session.accepted);
    }

    function pressAccept(session) {
        if (!acceptEnabled(session)) return { session: session, send: false };
        return {
            session: {
                open: session.open,
                ownName: session.ownName,
                ownItems: session.ownItems,
                counterName: session.counterName,
                counterItems: session.counterItems,
                accepted: true
            },
            send: true
        };
    }

    function attach(opts) {
        const o = opts || {};
        const doc = o.document || (typeof document !== 'undefined' ? document : null);
        let session = createSession();
        let panel = null;
        let placed = false;
        let ownLabel = null;
        let counterLabel = null;
        let ownGrid = null;
        let counterGrid = null;
        let acceptBtn = null;

        function emitVisibility() {
            if (typeof o.onVisibility === 'function') o.onVisibility(!!session.open);
        }

        function makeSlot(item) {
            const slot = doc.createElement('button');
            slot.type = 'button';
            slot.className = 'inv-trade-slot';
            slot.draggable = false;
            slot.setAttribute('draggable', 'false');
            slot.setAttribute('data-count', String(item.count | 0));
            slot.setAttribute('data-item-id', item.id || '');
            const img = doc.createElement('img');
            img.draggable = false;
            img.alt = typeof o.itemLabel === 'function' ? (o.itemLabel(item.id) || item.id) : (item.id || '');
            img.src = typeof o.spriteUrl === 'function' ? (o.spriteUrl(item.id) || '') : '';
            slot.appendChild(img);
            const badge = doc.createElement('span');
            badge.className = 'inv-stack-count';
            badge.textContent = String(item.count | 0);
            slot.appendChild(badge);
            slot.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (typeof o.onLook === 'function') {
                    o.onLook(ev && ev.clientX || 0, ev && ev.clientY || 0, item.id, item.count | 0);
                }
            });
            slot.addEventListener('dragstart', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
            });
            return slot;
        }

        function fillGrid(grid, items) {
            if (!grid) return;
            grid.textContent = '';
            const list = items || [];
            for (let i = 0; i < list.length; i++) grid.appendChild(makeSlot(list[i]));
        }

        function paint() {
            if (ownLabel) ownLabel.textContent = session.ownName || '';
            if (counterLabel) counterLabel.textContent = session.counterName || '';
            fillGrid(ownGrid, session.ownItems);
            fillGrid(counterGrid, session.counterItems);
            if (acceptBtn) acceptBtn.disabled = !acceptEnabled(session);
        }

        function ensurePanel() {
            if (panel || !doc) return panel;
            panel = doc.createElement('div');
            panel.id = 'trade-window';
            panel.className = 'inv-float-panel inv-trade-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', TITLE);

            const header = doc.createElement('div');
            header.className = 'inv-panel-header';
            const title = doc.createElement('span');
            title.className = 'inv-panel-title';
            title.textContent = TITLE;
            const closeBtn = doc.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'inv-panel-close';
            closeBtn.setAttribute('aria-label', 'Close trade');
            closeBtn.textContent = '\u00d7';
            closeBtn.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (ev && ev.stopPropagation) ev.stopPropagation();
                cancel();
            });
            header.appendChild(title);
            header.appendChild(closeBtn);

            const columns = doc.createElement('div');
            columns.className = 'inv-trade-columns';
            function column() {
                const col = doc.createElement('div');
                col.className = 'inv-trade-col';
                const label = doc.createElement('div');
                label.className = 'inv-trade-label';
                const grid = doc.createElement('div');
                grid.className = 'inv-trade-grid';
                col.appendChild(label);
                col.appendChild(grid);
                columns.appendChild(col);
                return { label: label, grid: grid };
            }
            const own = column();
            const counter = column();
            ownLabel = own.label;
            ownGrid = own.grid;
            counterLabel = counter.label;
            counterGrid = counter.grid;

            const actions = doc.createElement('div');
            actions.className = 'inv-trade-actions';
            acceptBtn = doc.createElement('button');
            acceptBtn.type = 'button';
            acceptBtn.className = 'inv-trade-accept';
            acceptBtn.textContent = 'Accept';
            acceptBtn.disabled = true;
            acceptBtn.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                const result = pressAccept(session);
                session = result.session;
                if (result.send && typeof o.onAccept === 'function') o.onAccept();
                paint();
            });
            const rejectBtn = doc.createElement('button');
            rejectBtn.type = 'button';
            rejectBtn.className = 'inv-trade-reject';
            rejectBtn.textContent = 'Reject';
            rejectBtn.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                cancel();
            });
            actions.appendChild(acceptBtn);
            actions.appendChild(rejectBtn);

            panel.appendChild(header);
            panel.appendChild(columns);
            panel.appendChild(actions);

            const rootEl = typeof o.floatRoot === 'function' ? o.floatRoot() : null;
            if (rootEl && rootEl.appendChild) rootEl.appendChild(panel);
            if (typeof o.wireDrag === 'function') o.wireDrag(header, panel);
            if (!placed && typeof o.place === 'function') {
                o.place(panel);
                placed = true;
            }
            if (typeof o.raise === 'function') {
                panel.addEventListener('pointerdown', function () { o.raise(panel); });
            }
            return panel;
        }

        function render() {
            if (!session.open) {
                if (panel && panel.parentNode && panel.parentNode.removeChild) {
                    panel.parentNode.removeChild(panel);
                }
                panel = null;
                placed = false;
                ownLabel = null;
                counterLabel = null;
                ownGrid = null;
                counterGrid = null;
                acceptBtn = null;
                emitVisibility();
                return;
            }
            if (!doc) {
                emitVisibility();
                return;
            }
            ensurePanel();
            paint();
            emitVisibility();
        }

        function cancel() {
            if (!session.open) return;
            if (typeof o.onCancel === 'function') o.onCancel();
            session = createSession();
            render();
        }

        return {
            applySnapshot: function (msg) {
                session = applySnapshot(session, msg);
                render();
                return session;
            },
            applyClose: function () {
                session = createSession();
                render();
            },
            isOpen: function () { return !!session.open; },
            state: function () { return session; },
            panel: function () { return panel; }
        };
    }

    return {
        MENU_LABEL: MENU_LABEL,
        TITLE: TITLE,
        PARTNER_RANGE: PARTNER_RANGE,
        ITEM_RANGE: ITEM_RANGE,
        WALK_HOPS: WALK_HOPS,
        withTradeEntry: withTradeEntry,
        containerAllowsTrade: containerAllowsTrade,
        groundOffer: groundOffer,
        floorText: floorText,
        planOffer: planOffer,
        mapAim: mapAim,
        createSession: createSession,
        applySnapshot: applySnapshot,
        acceptEnabled: acceptEnabled,
        pressAccept: pressAccept,
        attach: attach
    };
});
