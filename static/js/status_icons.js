'use strict';

/**
 * Equipment status strip. Kinds and tooltips follow the legacy client
 * player-state flags (poison, burn, protection zone, hungry). Icons are the
 * Font Awesome strip used by the engine equipment card.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineStatusIcons = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STATUS_ICON_META = Object.freeze({
        protection_zone: {
            icon: 'fa-house',
            color: '#22c55e',
            label: 'Protection Zone',
            title: 'You are within a protection zone'
        },
        hungry: {
            icon: 'fa-drumstick-bite',
            color: '#f59e0b',
            label: 'Hungry',
            title: 'You are hungry'
        },
        poison: {
            icon: 'fa-skull-crossbones',
            color: '#6bcb3f',
            label: 'Poisoned',
            title: 'You are poisoned'
        },
        fire: {
            icon: 'fa-fire',
            color: '#ff6b35',
            label: 'Burning',
            title: 'You are burning'
        },
        ice: {
            icon: 'fa-snowflake',
            color: '#7ec8ff',
            label: 'Freezing',
            title: 'You are freezing'
        },
        energy: {
            icon: 'fa-bolt',
            color: '#f0d030',
            label: 'Electrified',
            title: 'You are electrified'
        },
        bleed: {
            icon: 'fa-droplet',
            color: '#c41e3a',
            label: 'Bleeding',
            title: 'You are bleeding'
        },
        curse: {
            icon: 'fa-ghost',
            color: '#9b59b6',
            label: 'Cursed',
            title: 'You are cursed'
        },
        holy: {
            icon: 'fa-sun',
            color: '#ffe066',
            label: 'Dazzled',
            title: 'You are dazzled'
        },
        slow: {
            icon: 'fa-person-running',
            color: '#e74c3c',
            label: 'Slowed',
            title: 'You are paralysed'
        },
        haste: {
            icon: 'fa-person-running',
            color: '#2ecc71',
            label: 'Hasted',
            title: 'You are hasted'
        },
        invisible: {
            icon: 'fa-eye-slash',
            color: '#a0aec0',
            label: 'Invisible',
            title: 'You are invisible'
        },
        regen: {
            icon: 'fa-heart-pulse',
            color: '#48bb78',
            label: 'Regenerating',
            title: 'You are regenerating'
        },
        attributes: {
            icon: 'fa-dumbbell',
            color: '#63b3ed',
            label: 'Strengthened',
            title: 'You are strengthened'
        },
        mana_shield: {
            icon: 'fa-shield-halved',
            color: '#22d3ee',
            label: 'Magic Shield',
            title: 'You are protected by a magic shield'
        }
    });

    const STATUS_ICON_ORDER = Object.freeze([
        'protection_zone',
        'hungry',
        'poison',
        'fire',
        'energy',
        'bleed',
        'ice',
        'holy',
        'curse',
        'slow',
        'haste',
        'invisible',
        'mana_shield',
        'regen',
        'attributes'
    ]);

    const KIND_ALIAS = Object.freeze({
        burning: 'fire',
        poisoned: 'poison',
        freezing: 'ice',
        electrified: 'energy',
        electrification: 'energy',
        electrify: 'energy',
        bleeding: 'bleed',
        cursed: 'curse',
        dazzled: 'holy',
        dazzle: 'holy',
        paralyzed: 'slow',
        paralysed: 'slow',
        paralyze: 'slow',
        invisibility: 'invisible',
        manashield: 'mana_shield',
        'mana-shield': 'mana_shield',
        magic_shield: 'mana_shield',
        regeneration: 'regen',
        hot: 'regen',
        recovery: 'regen',
        attribute: 'attributes',
        stance: 'attributes',
        strengthened: 'attributes'
    });

    function canonicalKind(raw) {
        let kind = String(raw || '')
            .toLowerCase()
            .replace(/^condition_/, '')
            .trim();
        if (KIND_ALIAS[kind]) kind = KIND_ALIAS[kind];
        return kind;
    }

    /**
     * @param {object|null|undefined} source
     * @returns {{ kind: string, icon: string, color: string, label: string, title: string }[]}
     */
    function listActiveStatusIcons(source) {
        if (!source || typeof source !== 'object') return [];
        const kinds = new Set();
        const list = Array.isArray(source.conditions) ? source.conditions : [];
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row || typeof row !== 'object') continue;
            const kind = canonicalKind(row.kind || row.type || row.id);
            if (!kind || kind === 'food') continue;
            kinds.add(kind);
        }
        if (source.inProtectionZone) kinds.add('protection_zone');
        if (source.hungry) kinds.add('hungry');

        const out = [];
        for (let i = 0; i < STATUS_ICON_ORDER.length; i++) {
            const kind = STATUS_ICON_ORDER[i];
            if (!kinds.has(kind)) continue;
            const meta = STATUS_ICON_META[kind];
            if (!meta) continue;
            out.push({
                kind: kind,
                icon: meta.icon,
                color: meta.color,
                label: meta.label,
                title: meta.title
            });
            kinds.delete(kind);
        }
        const rest = Array.from(kinds).sort();
        for (let i = 0; i < rest.length; i++) {
            const kind = rest[i];
            out.push({
                kind: kind,
                icon: 'fa-circle-exclamation',
                color: '#cbd5e0',
                label: kind,
                title: kind
            });
        }
        return out;
    }

    function statusIconsSignature(source) {
        const icons = listActiveStatusIcons(source);
        if (!icons.length) return '';
        return icons.map(function (row) { return row.kind; }).join(',');
    }

    /**
     * Paint the strip under Soul/Cap. Skips the DOM write when the set is unchanged.
     * @param {HTMLElement|null} barEl
     * @param {object|null|undefined} source
     */
    function renderStatusBar(barEl, source) {
        if (!barEl) return;
        const icons = listActiveStatusIcons(source);
        const sig = icons.map(function (row) { return row.kind + ':' + row.title; }).join('|');
        if (barEl.dataset && barEl.dataset.statusSig === sig) return;
        if (barEl.dataset) barEl.dataset.statusSig = sig;
        barEl.textContent = '';
        if (!icons.length) {
            barEl.hidden = true;
            barEl.setAttribute('aria-hidden', 'true');
            return;
        }
        barEl.hidden = false;
        barEl.setAttribute('aria-hidden', 'false');
        for (let i = 0; i < icons.length; i++) {
            const ic = icons[i];
            const icon = document.createElement('span');
            icon.className = 'eq-status-icon' + (ic.kind === 'hungry' ? ' is-hungry' : '');
            icon.setAttribute('data-status', ic.kind);
            icon.style.color = ic.color;
            icon.title = ic.title;
            icon.setAttribute('aria-label', ic.label);
            const mark = document.createElement('i');
            mark.className = 'fa-solid ' + ic.icon;
            mark.setAttribute('aria-hidden', 'true');
            icon.appendChild(mark);
            barEl.appendChild(icon);
        }
    }

    return {
        STATUS_ICON_META: STATUS_ICON_META,
        STATUS_ICON_ORDER: STATUS_ICON_ORDER,
        listActiveStatusIcons: listActiveStatusIcons,
        statusIconsSignature: statusIconsSignature,
        renderStatusBar: renderStatusBar
    };
});
