'use strict';

const LAST_EMAIL_KEY = 'engine.lastEmail';
const PLAY_HANDOFF_KEY = 'engine.playHandoff';
const MOUSE_CONTROLS_KEY = 'engine.mouseControls';
const AUTO_CHASE_KEY = 'engine.autoChase';
const COMBAT_SORT_KEY = 'engine.combatSort';
const LEGACY_CHAR_DB = 'HuntDLClientDB';

const DEFAULT_MOUSE_CONTROLS = Object.freeze({
    mouseControlMode: 1,
    lootControlMode: 0,
    talkOnRightClick: false,
    moveStack: false
});

function deleteLegacyCharacterStore() {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.deleteDatabase !== 'function') {
        return;
    }
    try {
        const req = indexedDB.deleteDatabase(LEGACY_CHAR_DB);
        req.onerror = function () {};
        req.onblocked = function () {};
    } catch (e) {
        /* leftover lab DB is best-effort */
    }
}

function getLastEmail() {
    try {
        return localStorage.getItem(LAST_EMAIL_KEY) || '';
    } catch (e) {
        return '';
    }
}

function setLastEmail(email) {
    if (typeof email !== 'string') return;
    try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
    } catch (e) {
        /* ignore quota / private mode */
    }
}

function writePlayHandoff(payload) {
    sessionStorage.setItem(PLAY_HANDOFF_KEY, JSON.stringify(payload));
}

function takePlayHandoff() {
    let raw = null;
    try {
        raw = sessionStorage.getItem(PLAY_HANDOFF_KEY);
        sessionStorage.removeItem(PLAY_HANDOFF_KEY);
    } catch (e) {
        return null;
    }
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj.token !== 'string') return null;
        return obj;
    } catch (e) {
        return null;
    }
}

function normalizeMouseControls(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = Math.floor(Number(src.mouseControlMode));
    const loot = Math.floor(Number(src.lootControlMode));
    return {
        mouseControlMode: mode === 0 || mode === 2 ? mode : 1,
        lootControlMode: loot === 1 || loot === 2 ? loot : 0,
        talkOnRightClick: src.talkOnRightClick === true,
        moveStack: src.moveStack === true
    };
}

function loadMouseControls() {
    try {
        const raw = localStorage.getItem(MOUSE_CONTROLS_KEY);
        if (!raw) return Object.assign({}, DEFAULT_MOUSE_CONTROLS);
        return normalizeMouseControls(JSON.parse(raw));
    } catch (e) {
        return Object.assign({}, DEFAULT_MOUSE_CONTROLS);
    }
}

function saveMouseControls(bag) {
    const next = normalizeMouseControls(bag);
    try {
        localStorage.setItem(MOUSE_CONTROLS_KEY, JSON.stringify(next));
    } catch (e) {
        /* ignore quota / private mode */
    }
    return next;
}

function loadAutoChase() {
    try {
        return localStorage.getItem(AUTO_CHASE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function saveAutoChase(on) {
    try {
        localStorage.setItem(AUTO_CHASE_KEY, on ? '1' : '0');
    } catch (e) {
        /* ignore */
    }
}

function loadCombatSort() {
    try {
        return localStorage.getItem(COMBAT_SORT_KEY) || 'display_time_asc';
    } catch (e) {
        return 'display_time_asc';
    }
}

function saveCombatSort(id) {
    try {
        localStorage.setItem(COMBAT_SORT_KEY, String(id || 'display_time_asc'));
    } catch (e) {
        /* ignore */
    }
}

const SIDEBAR_PANELS_KEY = 'engine.sidebarPanels';

function loadSidebarPanelsPrefs() {
    try {
        const raw = localStorage.getItem(SIDEBAR_PANELS_KEY);
        if (!raw) return { closed: {}, collapsed: {}, heights: {} };
        const parsed = JSON.parse(raw);
        return {
            closed: (parsed && typeof parsed.closed === 'object' && parsed.closed) || {},
            collapsed: (parsed && typeof parsed.collapsed === 'object' && parsed.collapsed) || {},
            heights: (parsed && typeof parsed.heights === 'object' && parsed.heights) || {}
        };
    } catch (e) {
        return { closed: {}, collapsed: {}, heights: {} };
    }
}

function saveSidebarPanelsPrefs(prefs) {
    try {
        const payload = {
            closed: (prefs && typeof prefs.closed === 'object' && prefs.closed) || {},
            collapsed: (prefs && typeof prefs.collapsed === 'object' && prefs.collapsed) || {},
            heights: (prefs && typeof prefs.heights === 'object' && prefs.heights) || {}
        };
        localStorage.setItem(SIDEBAR_PANELS_KEY, JSON.stringify(payload));
    } catch (e) {
        /* ignore */
    }
}


deleteLegacyCharacterStore();
