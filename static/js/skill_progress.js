'use strict';

/**
 * Display math for the /play skills panel.
 * Formulas match server/src/world/progression.js.
 * Rates match content/classes.json. classes-ui.json stays stripped.
 * This module does not grant tries and does not read swings or MP.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineSkillProgress = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SKILL_BASE = Object.freeze({
        fist: 50,
        club: 50,
        sword: 50,
        axe: 50,
        melee: 50,
        distance: 30,
        shielding: 100,
        shield: 100,
        fishing: 20
    });
    const MAGIC_MANA_BASE = 1600;
    const SKILL_FLOOR = 10;
    const MAGIC_FLOOR = 0;

    const VOCATION_SKILL_RATES = Object.freeze({
        guardian: Object.freeze({ melee: 1.1, fist: 1.1, distance: 1.4, shielding: 1.1, magic: 3 }),
        scout: Object.freeze({ melee: 1.2, fist: 1.2, distance: 1.1, shielding: 1.1, magic: 1.4 }),
        mystic: Object.freeze({ melee: 1.4, fist: 1.1, distance: 2, shielding: 1.15, magic: 1.25 }),
        adept: Object.freeze({ melee: 2, fist: 1.5, distance: 2, shielding: 1.5, magic: 1.1 }),
        warden: Object.freeze({ melee: 1.8, fist: 1.5, distance: 1.8, shielding: 1.5, magic: 1.1 }),
        adventurer: Object.freeze({ melee: 2, fist: 1.5, distance: 2, shielding: 1.5, magic: 4 })
    });

    function normalizeSkillKey(skill) {
        const k = skill != null ? String(skill).toLowerCase() : '';
        if (k === 'shield' || k === 'shielding') return 'shielding';
        if (k === 'sword' || k === 'axe' || k === 'club') return 'melee';
        if (k === 'magiclevel' || k === 'magic_level' || k === 'ml') return 'magic';
        return k;
    }

    function skillMultiplier(skill, rates) {
        const key = normalizeSkillKey(skill);
        const r = rates && typeof rates === 'object' ? rates : {};
        if (key === 'magic') {
            const m = r.magic != null ? Number(r.magic) : 1.1;
            return m > 1 ? m : 1.1;
        }
        if (key === 'fist') {
            const m = r.fist != null ? Number(r.fist) : r.melee != null ? Number(r.melee) : 1.1;
            return m > 1 ? m : 1.1;
        }
        if (key === 'distance') {
            const m = r.distance != null ? Number(r.distance) : 1.1;
            return m > 1 ? m : 1.1;
        }
        if (key === 'shielding') {
            const m = r.shielding != null ? Number(r.shielding) : 1.1;
            return m > 1 ? m : 1.1;
        }
        if (key === 'fishing') {
            const m = r.fishing != null ? Number(r.fishing) : 1.1;
            return m > 1 ? m : 1.1;
        }
        const m = r.melee != null ? Number(r.melee) : 1.1;
        return m > 1 ? m : 1.1;
    }

    function skillBase(skill) {
        const key = normalizeSkillKey(skill);
        if (key === 'magic') return MAGIC_MANA_BASE;
        return SKILL_BASE[key] != null ? SKILL_BASE[key] : SKILL_BASE.melee;
    }

    function getReqSkillTries(skill, skillLevel, rates) {
        const level = Math.floor(Number(skillLevel) || 0);
        if (level <= SKILL_FLOOR) return 0;
        const base = skillBase(skill);
        const m = skillMultiplier(skill, rates);
        return Math.floor(base * Math.pow(m, level - 11));
    }

    function getReqMana(magicLevel, rates) {
        const ml = Math.floor(Number(magicLevel) || 0);
        if (ml <= MAGIC_FLOOR) return 0;
        const mult = skillMultiplier('magic', rates);
        return Math.floor(MAGIC_MANA_BASE * Math.pow(mult, ml - 1));
    }

    function getExpForLevel(level) {
        const L = Math.floor(Number(level) || 0);
        if (L <= 1) return 0;
        return Math.floor((50 / 3) * (L * L * L - 6 * L * L + 17 * L - 12));
    }

    function ratesFor(vocation) {
        const key = vocation == null ? '' : String(vocation).trim().toLowerCase();
        return VOCATION_SKILL_RATES[key] || null;
    }

    function percentPair(rawPct) {
        const percent = Math.min(100, Math.max(0, Math.round(rawPct * 100) / 100));
        const percentToGo = Math.max(0, Math.min(100, Math.round((100 - percent) * 100) / 100));
        return {
            percent: percent,
            percentToGo: percentToGo,
            tooltip: 'You have ' + percentToGo.toFixed(2) + ' percent to go'
        };
    }

    function levelProgress(experience, level) {
        const lv = Math.max(1, Math.floor(Number(level) || 1));
        const curr = getExpForLevel(lv);
        const next = getExpForLevel(lv + 1);
        const span = next - curr;
        let raw = 0;
        if (span > 0) {
            const exp = Math.max(0, Number(experience) || 0);
            raw = (Math.max(0, exp - curr) * 100) / span;
        }
        return percentPair(raw);
    }

    function skillProgress(skill, skillLevel, counter, rates) {
        const key = skill != null ? String(skill).toLowerCase() : '';
        const level = Math.max(0, Math.floor(Number(skillLevel) || 0));
        const cur = Math.max(0, Number(counter) || 0);
        const need = key === 'magic'
            ? getReqMana(level + 1, rates)
            : getReqSkillTries(key, level + 1, rates);
        const raw = need > 0 ? (cur * 100) / need : 0;
        return percentPair(raw);
    }

    return {
        VOCATION_SKILL_RATES,
        ratesFor,
        getExpForLevel,
        getReqSkillTries,
        getReqMana,
        levelProgress,
        skillProgress
    };
});
