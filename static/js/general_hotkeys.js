'use strict';

/**
 * One global general-hotkey document for every character and profile.
 * Movement actions, including the four diagonals, drive keyboard_walk.
 * Two held cardinals combine into a diagonal on the walk layer.
 * This module does not touch IndexedDB.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineGeneralHotkeys = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const ACTION_LIST = Object.freeze([
        Object.freeze({ id: 'moveNorth', label: 'Move North', group: 'Movement', dir: 0 }),
        Object.freeze({ id: 'moveEast', label: 'Move East', group: 'Movement', dir: 1 }),
        Object.freeze({ id: 'moveSouth', label: 'Move South', group: 'Movement', dir: 2 }),
        Object.freeze({ id: 'moveWest', label: 'Move West', group: 'Movement', dir: 3 }),
        Object.freeze({ id: 'moveNorthEast', label: 'Move North-East', group: 'Movement', dir: 7 }),
        Object.freeze({ id: 'moveSouthEast', label: 'Move South-East', group: 'Movement', dir: 5 }),
        Object.freeze({ id: 'moveSouthWest', label: 'Move South-West', group: 'Movement', dir: 4 }),
        Object.freeze({ id: 'moveNorthWest', label: 'Move North-West', group: 'Movement', dir: 6 }),
        Object.freeze({ id: 'targetNext', label: 'Target Next', group: 'Targeting', dir: null }),
        Object.freeze({ id: 'targetPrev', label: 'Target Previous', group: 'Targeting', dir: null }),
        Object.freeze({ id: 'toggleAutoChase', label: 'Toggle Auto Chase', group: 'Targeting', dir: null }),
        Object.freeze({ id: 'stopAutowalk', label: 'Stop Autowalk', group: 'Targeting', dir: null })
    ]);

    const DEFAULTS = Object.freeze({
        moveNorth: Object.freeze(['ARROWUP', 'W']),
        moveEast: Object.freeze(['ARROWRIGHT', 'D']),
        moveSouth: Object.freeze(['ARROWDOWN', 'S']),
        moveWest: Object.freeze(['ARROWLEFT', 'A']),
        moveNorthEast: Object.freeze([]),
        moveSouthEast: Object.freeze([]),
        moveSouthWest: Object.freeze([]),
        moveNorthWest: Object.freeze([]),
        targetNext: Object.freeze(['SPACE']),
        targetPrev: Object.freeze(['SHIFT+SPACE']),
        toggleAutoChase: Object.freeze([]),
        stopAutowalk: Object.freeze(['ESCAPE'])
    });

    function normKey(str) {
        if (!str) return '';
        return String(str).trim().toUpperCase().replace(/\s+/g, '');
    }

    function actionById(id) {
        for (let i = 0; i < ACTION_LIST.length; i++) {
            if (ACTION_LIST[i].id === id) return ACTION_LIST[i];
        }
        return null;
    }

    function keysOf(raw, id) {
        const fallback = DEFAULTS[id] ? DEFAULTS[id].slice() : [];
        if (!raw || !Object.prototype.hasOwnProperty.call(raw, id) || !Array.isArray(raw[id])) {
            return fallback;
        }
        const uniq = [];
        for (let i = 0; i < raw[id].length; i++) {
            const key = normKey(raw[id][i]);
            if (key && uniq.indexOf(key) < 0) uniq.push(key);
        }
        return uniq;
    }

    function normalize(raw) {
        const src = raw && raw.actions && typeof raw.actions === 'object' && !Array.isArray(raw.actions)
            ? raw.actions
            : null;
        const actions = {};
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const id = ACTION_LIST[i].id;
            actions[id] = keysOf(src, id);
        }
        return { v: 1, actions: actions };
    }

    function defaults() {
        return normalize(null);
    }

    function cloneActions(doc) {
        const base = normalize(doc);
        const actions = {};
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const id = ACTION_LIST[i].id;
            actions[id] = base.actions[id].slice();
        }
        return actions;
    }

    function setKey(doc, actionId, hotkey, index) {
        const act = actionById(actionId);
        const key = normKey(hotkey);
        const actions = cloneActions(doc);
        if (!act || !key) return { v: 1, actions: actions };
        const list = actions[actionId].slice();
        const at = index == null || index < 0 || index >= list.length ? list.length : (index | 0);
        if (at === list.length) list.push(key);
        else list[at] = key;
        const seen = Object.create(null);
        actions[actionId] = [];
        for (let i = 0; i < list.length; i++) {
            const item = normKey(list[i]);
            if (!item || seen[item]) continue;
            seen[item] = true;
            actions[actionId].push(item);
        }
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const id = ACTION_LIST[i].id;
            if (id === actionId) continue;
            actions[id] = actions[id].filter(function (item) { return item !== key; });
        }
        return { v: 1, actions: actions };
    }

    function removeAt(doc, actionId, index) {
        const actions = cloneActions(doc);
        if (!actions[actionId]) return { v: 1, actions: actions };
        const list = actions[actionId].slice();
        const at = index | 0;
        if (at >= 0 && at < list.length) list.splice(at, 1);
        actions[actionId] = list;
        return { v: 1, actions: actions };
    }

    function removeHotkey(doc, hotkey) {
        const key = normKey(hotkey);
        const actions = cloneActions(doc);
        if (!key) return { v: 1, actions: actions };
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const id = ACTION_LIST[i].id;
            actions[id] = actions[id].filter(function (item) { return item !== key; });
        }
        return { v: 1, actions: actions };
    }

    function match(doc, hotkey) {
        const key = normKey(hotkey);
        if (!key) return '';
        const actions = normalize(doc).actions;
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const id = ACTION_LIST[i].id;
            if (actions[id].indexOf(key) >= 0) return id;
        }
        return '';
    }

    function moveDir(hotkey, doc) {
        const id = match(doc, hotkey);
        const act = id ? actionById(id) : null;
        if (!act || act.dir == null) return null;
        const dir = act.dir | 0;
        return dir >= 0 && dir <= 7 ? dir : null;
    }

    function labelOf(id) {
        const act = actionById(id);
        return act ? act.label : (id == null ? '' : String(id));
    }

    function rows(doc) {
        const actions = normalize(doc).actions;
        const out = [];
        for (let i = 0; i < ACTION_LIST.length; i++) {
            const act = ACTION_LIST[i];
            out.push({
                id: act.id,
                label: act.label,
                group: act.group,
                keys: actions[act.id].slice()
            });
        }
        return out;
    }

    return {
        ACTION_LIST: ACTION_LIST,
        normKey: normKey,
        normalize: normalize,
        defaults: defaults,
        setKey: setKey,
        removeAt: removeAt,
        removeHotkey: removeHotkey,
        match: match,
        moveDir: moveDir,
        cardinalDir: moveDir,
        labelOf: labelOf,
        rows: rows
    };
});
