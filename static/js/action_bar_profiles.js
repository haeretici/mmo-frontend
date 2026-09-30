'use strict';

/**
 * Action-bar profile map for /play.
 * resolveProfile is pure: character name, then vocation label (class id
 * alias), then lastProfileId, then one new vocation-labeled profile.
 * General hotkeys are not part of this map. IndexedDB lives in prefs.js.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineActionBarProfiles = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function text(value) {
        return value == null ? '' : String(value).trim();
    }

    function fold(value) {
        return text(value).toLowerCase();
    }

    /**
     * Catalog label for a class id. Same rule as client_window vocationLabel:
     * the row's label when it is a non-empty string, otherwise the id.
     */
    function classLabel(vocationId, catalog) {
        const id = vocationId == null ? '' : String(vocationId);
        const list = catalog && Array.isArray(catalog.classes)
            ? catalog.classes
            : (Array.isArray(catalog) ? catalog : []);
        const lower = id.toLowerCase();
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row || row.id == null) continue;
            if (String(row.id).toLowerCase() !== lower) continue;
            if (row.label) return String(row.label);
            return id;
        }
        return id;
    }

    function findProfileKey(profiles, name) {
        const want = fold(name);
        if (!want || !profiles || typeof profiles !== 'object') return '';
        const keys = Object.keys(profiles);
        for (let i = 0; i < keys.length; i++) {
            if (fold(keys[i]) === want) return keys[i];
        }
        return '';
    }

    function copyMap(profiles) {
        const out = {};
        if (!profiles || typeof profiles !== 'object') return out;
        const keys = Object.keys(profiles);
        for (let i = 0; i < keys.length; i++) out[keys[i]] = profiles[keys[i]];
        return out;
    }

    function cloneDoc(doc) {
        if (!doc || typeof doc !== 'object') return { v: 1, bars: [] };
        return JSON.parse(JSON.stringify(doc));
    }

    /**
     * @param {object} opts
     * @param {string} [opts.characterName]
     * @param {string} [opts.vocationId]
     * @param {string} [opts.vocationLabel]
     * @param {object} [opts.profiles]
     * @param {string} [opts.lastProfileId]
     * @param {object} [opts.seedDoc] bar document stored when a profile is created
     * @returns {{ id: string, created: boolean, profiles: object }}
     */
    function resolveProfile(opts) {
        const o = opts || {};
        const profiles = copyMap(o.profiles);
        const characterKey = findProfileKey(profiles, o.characterName);
        if (characterKey) return { id: characterKey, created: false, profiles: profiles };

        const vocationLabel = text(o.vocationLabel);
        const vocationId = text(o.vocationId);
        let vocationKey = vocationLabel ? findProfileKey(profiles, vocationLabel) : '';
        if (!vocationKey && vocationId) vocationKey = findProfileKey(profiles, vocationId);
        if (vocationKey) return { id: vocationKey, created: false, profiles: profiles };

        const lastKey = findProfileKey(profiles, o.lastProfileId);
        if (lastKey) return { id: lastKey, created: false, profiles: profiles };

        const createdName = vocationLabel || vocationId;
        if (!createdName) return { id: '', created: false, profiles: profiles };
        profiles[createdName] = cloneDoc(o.seedDoc);
        return { id: createdName, created: true, profiles: profiles };
    }

    function reject(profiles, reason) {
        return { ok: false, reason: reason, id: '', profiles: copyMap(profiles), nextId: '' };
    }

    function addProfile(profiles, name, seedDoc) {
        const id = text(name);
        if (!id) return reject(profiles, 'empty');
        const clash = findProfileKey(profiles, id);
        if (clash) return reject(profiles, 'exists');
        const next = copyMap(profiles);
        next[id] = cloneDoc(seedDoc);
        return { ok: true, reason: '', id: id, profiles: next, nextId: id };
    }

    function copyProfile(profiles, sourceName, name) {
        const sourceKey = findProfileKey(profiles, sourceName);
        if (!sourceKey) return reject(profiles, 'missing');
        const id = text(name);
        if (!id) return reject(profiles, 'empty');
        if (findProfileKey(profiles, id)) return reject(profiles, 'exists');
        const next = copyMap(profiles);
        next[id] = cloneDoc(profiles[sourceKey]);
        return { ok: true, reason: '', id: id, profiles: next, nextId: id };
    }

    function renameProfile(profiles, sourceName, name) {
        const sourceKey = findProfileKey(profiles, sourceName);
        if (!sourceKey) return reject(profiles, 'missing');
        const id = text(name);
        if (!id) return reject(profiles, 'empty');
        const clash = findProfileKey(profiles, id);
        if (clash && clash !== sourceKey) return reject(profiles, 'exists');
        if (id === sourceKey) {
            return { ok: true, reason: '', id: sourceKey, profiles: copyMap(profiles), nextId: sourceKey };
        }
        const next = {};
        const keys = Object.keys(profiles || {});
        for (let i = 0; i < keys.length; i++) {
            next[keys[i] === sourceKey ? id : keys[i]] = profiles[keys[i]];
        }
        return { ok: true, reason: '', id: id, profiles: next, nextId: id };
    }

    /**
     * Removes one profile. The last remaining profile stays.
     * nextId is the first remaining key, matching legacy removeHotkeySet.
     */
    function removeProfile(profiles, name) {
        const keys = profiles && typeof profiles === 'object' ? Object.keys(profiles) : [];
        const sourceKey = findProfileKey(profiles, name);
        if (!sourceKey) return reject(profiles, 'missing');
        if (keys.length <= 1) {
            const kept = reject(profiles, 'last');
            kept.id = sourceKey;
            kept.nextId = sourceKey;
            return kept;
        }
        const next = copyMap(profiles);
        delete next[sourceKey];
        const remain = Object.keys(next);
        return {
            ok: true,
            reason: '',
            id: sourceKey,
            profiles: next,
            nextId: remain.length ? remain[0] : ''
        };
    }

    return {
        classLabel: classLabel,
        findProfileKey: findProfileKey,
        resolveProfile: resolveProfile,
        addProfile: addProfile,
        copyProfile: copyProfile,
        renameProfile: renameProfile,
        removeProfile: removeProfile
    };
});
