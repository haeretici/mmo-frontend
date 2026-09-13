'use strict';

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/;

function formatWhen(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'never';
    return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function renderChars(cfg, list) {
    const host = document.getElementById('char-list');
    host.textContent = '';
    if (!list.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'No characters yet.';
        host.appendChild(p);
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'cards';
    list.forEach(function (ch) {
        const card = document.createElement('article');
        card.className = 'card';
        const h = document.createElement('h3');
        h.textContent = ch.name;
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = ch.vocation + ' · L' + ch.level +
            ' · ' + ch.hp + '/' + ch.hpMax + ' hp' +
            ' · last logout ' + formatWhen(ch.lastLogout);
        const play = document.createElement('button');
        play.type = 'button';
        play.textContent = 'Play';
        play.addEventListener('click', function () { onPlay(ch); });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'danger';
        del.textContent = 'Delete';
        del.addEventListener('click', function () { onDelete(ch); });
        card.appendChild(h);
        card.appendChild(meta);
        card.appendChild(play);
        card.appendChild(del);
        grid.appendChild(card);
    });
    host.appendChild(grid);
    const create = document.getElementById('create-form');
    const atCap = list.length >= cfg.limits.maxChars;
    if (create) {
        Array.prototype.forEach.call(create.querySelectorAll('input, select, button'), function (el) {
            el.disabled = atCap;
        });
    }
    const cap = document.getElementById('cap-hint');
    if (cap) {
        cap.textContent = atCap
            ? 'Maximum ' + cfg.limits.maxChars + ' characters on this account.'
            : (list.length + ' / ' + cfg.limits.maxChars);
    }
}

function onPlay(ch) {
    const status = document.getElementById('status');
    setStatus(status, 'Requesting play token…');
    api('POST', '/v1/play', { characterId: ch.id })
        .then(function (play) {
            writePlayHandoff({
                token: play.token,
                expiresAt: play.expiresAt,
                characterId: play.characterId
            });
            location.href = '/play';
        })
        .catch(function (e) {
            setStatus(status, e.message, 'err');
        });
}

function onDelete(ch) {
    if (!window.confirm('Delete ' + ch.name + '? This cannot be undone.')) return;
    const status = document.getElementById('status');
    api('DELETE', '/v1/characters/' + ch.id)
        .then(function () { return reload(); })
        .catch(function (e) { setStatus(status, e.message, 'err'); });
}

function onCreate(ev) {
    ev.preventDefault();
    const status = document.getElementById('status');
    const nameEl = document.getElementById('char-name');
    const vocEl = document.getElementById('char-voc');
    const name = nameEl.value.trim();
    if (!NAME_RE.test(name)) {
        setStatus(status, 'Name: 3–20 letters/digits, spaces between words.', 'err');
        return;
    }
    api('POST', '/v1/characters', { name: name, vocation: vocEl.value })
        .then(function () {
            nameEl.value = '';
            return reload();
        })
        .catch(function (e) {
            setStatus(status, e.message, 'err');
        });
}

function fillVocations(cfg) {
    const sel = document.getElementById('char-voc');
    if (!sel) return;
    sel.textContent = '';
    (cfg.vocations || []).forEach(function (v) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
}

function reload() {
    const status = document.getElementById('status');
    return loadConfig().then(function (cfg) {
        fillVocations(cfg);
        return api('GET', '/v1/characters').then(function (data) {
            renderChars(cfg, data.characters || []);
            setStatus(status, '');
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const out = document.getElementById('logout-link');
    if (out) {
        out.addEventListener('click', function (ev) {
            ev.preventDefault();
            api('POST', '/v1/logout', {}).then(function () {
                location.href = '/';
            }).catch(function () { location.href = '/'; });
        });
    }
    const form = document.getElementById('create-form');
    if (form) form.addEventListener('submit', onCreate);
    const who = document.getElementById('who');
    api('GET', '/v1/me')
        .then(function (me) {
            if (who) who.textContent = me.email;
            return reload();
        })
        .catch(function () {
            location.href = '/login';
        });
});
