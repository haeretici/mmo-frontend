'use strict';

const LAST_EMAIL_KEY = 'engine.lastEmail';
const PLAY_HANDOFF_KEY = 'engine.playHandoff';
const MOUSE_CONTROLS_KEY = 'engine.mouseControls';
const AUTO_CHASE_KEY = 'engine.autoChase';
const COMBAT_SORT_KEY = 'engine.combatSort';
const LEGACY_CHAR_DB = 'HuntDLClientDB';
const PREFS_DB_NAME = 'engine.prefs';
const PREFS_DB_VERSION = 1;
const ACTION_BARS_STORE = 'actionBars';
const actionBarsMem = Object.create(null);

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

function openPrefsDb() {
    return new Promise(function (resolve, reject) {
        if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
            reject(new Error('no indexedDB'));
            return;
        }
        const req = indexedDB.open(PREFS_DB_NAME, PREFS_DB_VERSION);
        req.onupgradeneeded = function () {
            const db = req.result;
            if (!db.objectStoreNames.contains(ACTION_BARS_STORE)) {
                db.createObjectStore(ACTION_BARS_STORE);
            }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('prefs db')); };
    });
}

function loadActionBars(characterId) {
    const id = String(characterId || '');
    if (!id) return Promise.resolve(null);
    if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
        const row = actionBarsMem[id];
        return Promise.resolve(row ? JSON.parse(JSON.stringify(row)) : null);
    }
    return openPrefsDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(ACTION_BARS_STORE, 'readonly');
            const req = tx.objectStore(ACTION_BARS_STORE).get(id);
            req.onsuccess = function () {
                const v = req.result;
                resolve(v && typeof v === 'object' ? v : null);
            };
            req.onerror = function () { reject(req.error); };
        });
    }).catch(function () {
        const row = actionBarsMem[id];
        return row ? JSON.parse(JSON.stringify(row)) : null;
    });
}

function saveActionBars(characterId, doc) {
    const id = String(characterId || '');
    if (!id) return Promise.resolve();
    const payload = doc && typeof doc === 'object' ? JSON.parse(JSON.stringify(doc)) : {};
    actionBarsMem[id] = payload;
    if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
        return Promise.resolve();
    }
    return openPrefsDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(ACTION_BARS_STORE, 'readwrite');
            const req = tx.objectStore(ACTION_BARS_STORE).put(payload, id);
            req.onsuccess = function () { resolve(); };
            req.onerror = function () { reject(req.error); };
        });
    }).catch(function () { /* private mode / quota: RAM copy kept */ });
}

function clearActionBarsMem() {
    const keys = Object.keys(actionBarsMem);
    for (let i = 0; i < keys.length; i++) delete actionBarsMem[keys[i]];
}

deleteLegacyCharacterStore();

const EnginePrefs = {
    LAST_EMAIL_KEY: LAST_EMAIL_KEY,
    PLAY_HANDOFF_KEY: PLAY_HANDOFF_KEY,
    MOUSE_CONTROLS_KEY: MOUSE_CONTROLS_KEY,
    PREFS_DB_NAME: PREFS_DB_NAME,
    ACTION_BARS_STORE: ACTION_BARS_STORE,
    getLastEmail: getLastEmail,
    setLastEmail: setLastEmail,
    writePlayHandoff: writePlayHandoff,
    takePlayHandoff: takePlayHandoff,
    loadMouseControls: loadMouseControls,
    saveMouseControls: saveMouseControls,
    loadAutoChase: loadAutoChase,
    saveAutoChase: saveAutoChase,
    loadCombatSort: loadCombatSort,
    saveCombatSort: saveCombatSort,
    loadSidebarPanelsPrefs: loadSidebarPanelsPrefs,
    saveSidebarPanelsPrefs: saveSidebarPanelsPrefs,
    loadActionBars: loadActionBars,
    saveActionBars: saveActionBars,
    clearActionBarsMem: clearActionBarsMem
};

if (typeof module === 'object' && module.exports) {
    module.exports = EnginePrefs;
} else if (typeof globalThis !== 'undefined') {
    globalThis.EnginePrefs = EnginePrefs;
}
