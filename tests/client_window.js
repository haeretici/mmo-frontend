#!/usr/bin/env node
/**
 * Settings shell and Character float.
 * One instance, second icon press focuses and raises, Escape closes
 * Settings, the Controls page lists the five play controls, Hotkeys
 * lists action-bar profiles, dock slots, and general hotkeys. The character card lists
 * name, vocation, level, pools, experience, food, and capacity without
 * Bootstrap .modal / .show.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const place = require('../static/js/float_panel_place.js');
const { mount, vocationLabel } = require('../static/js/client_window.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log('ok', name);
    } catch (err) {
        failed += 1;
        console.error('FAIL', name);
        console.error(err && err.stack ? err.stack : err);
    }
}

function tokens(el) {
    return String(el.className || '').split(/\s+/).filter(Boolean);
}

function matchSimple(el, sel) {
    if (!el || !sel) return false;
    if (sel.charAt(0) === '.') return tokens(el).indexOf(sel.slice(1)) >= 0;
    if (sel.charAt(0) === '#') return el.id === sel.slice(1);
    const attr = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) {
        const val = el.getAttribute(attr[1]);
        if (attr[2] === undefined) return val != null;
        return val === attr[2];
    }
    return String(el.tagName || '').toUpperCase() === sel.toUpperCase();
}

function descendants(node, out) {
    const list = out || [];
    const kids = node && node.childNodes ? node.childNodes : [];
    for (let i = 0; i < kids.length; i++) {
        list.push(kids[i]);
        descendants(kids[i], list);
    }
    return list;
}

function queryGroup(root, sel) {
    const parts = String(sel || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    let pool = descendants(root).filter((el) => matchSimple(el, parts[0]));
    for (let i = 1; i < parts.length; i++) {
        const next = [];
        pool.forEach((el) => {
            descendants(el).forEach((child) => {
                if (matchSimple(child, parts[i])) next.push(child);
            });
        });
        pool = next;
    }
    return pool;
}

function queryAll(root, sel) {
    const found = [];
    String(sel || '').split(',').forEach((group) => {
        queryGroup(root, group.trim()).forEach((el) => {
            if (found.indexOf(el) < 0) found.push(el);
        });
    });
    return found;
}

function makeNode(tag, doc) {
    const listeners = {};
    const attrs = {};
    const node = {
        tagName: String(tag || 'div').toUpperCase(),
        className: '',
        id: '',
        style: {},
        hidden: false,
        tabIndex: 0,
        type: '',
        childNodes: [],
        parentNode: null,
        ownerDocument: doc,
        offsetLeft: 0,
        offsetTop: 0,
        offsetWidth: 240,
        offsetHeight: 180,
        _text: '',
        _focused: false,
        get children() {
            return this.childNodes;
        },
        get textContent() {
            if (this.childNodes.length === 0) return this._text;
            return this.childNodes.map((child) => child.textContent).join('');
        },
        set textContent(value) {
            this.childNodes = [];
            this._text = value == null ? '' : String(value);
        },
        appendChild(child) {
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        },
        setAttribute(name, value) {
            attrs[name] = String(value);
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        dispatchEvent(ev) {
            const event = ev || {};
            event.target = event.target || this;
            const list = (listeners[event.type] || []).slice();
            list.forEach((fn) => fn(event));
        },
        querySelectorAll(sel) {
            return queryAll(this, sel);
        },
        querySelector(sel) {
            return queryAll(this, sel)[0] || null;
        },
        closest(sel) {
            const parts = String(sel || '').split(',').map((part) => part.trim());
            let current = this;
            while (current && current.nodeType !== 'document') {
                if (parts.some((part) => matchSimple(current, part))) return current;
                current = current.parentNode;
            }
            return null;
        },
        focus() {
            this._focused = true;
            if (doc) doc.activeElement = this;
        },
        setPointerCapture() {},
        getBoundingClientRect() {
            if (this.id === 'inventoryFloatRoot') {
                return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
            }
            const left = parseFloat(this.style.left) || this.offsetLeft || 0;
            const top = parseFloat(this.style.top) || this.offsetTop || 0;
            const width = this.offsetWidth || 0;
            const height = this.offsetHeight || 0;
            return { left, top, right: left + width, bottom: top + height, width, height };
        }
    };
    node.classList = {
        add() {
            const set = tokens(node);
            for (let i = 0; i < arguments.length; i++) {
                if (set.indexOf(arguments[i]) < 0) set.push(arguments[i]);
            }
            node.className = set.join(' ');
        },
        remove() {
            const drop = Array.prototype.slice.call(arguments);
            node.className = tokens(node).filter((name) => drop.indexOf(name) < 0).join(' ');
        },
        toggle(name, force) {
            const has = tokens(node).indexOf(name) >= 0;
            const on = arguments.length > 1 ? !!force : !has;
            if (on) this.add(name);
            else this.remove(name);
            return on;
        },
        contains(name) {
            return tokens(node).indexOf(name) >= 0;
        }
    };
    return node;
}

function makeDocument() {
    const doc = {
        nodeType: 'document',
        childNodes: [],
        activeElement: null,
        createElement(tag) {
            return makeNode(tag, doc);
        },
        getElementById(id) {
            return descendants(doc).find((el) => el.id === id) || null;
        },
        querySelectorAll(sel) {
            return queryAll(doc, sel);
        },
        querySelector(sel) {
            return queryAll(doc, sel)[0] || null;
        }
    };
    const body = makeNode('body', doc);
    body.parentNode = doc;
    doc.childNodes.push(body);
    doc.body = body;
    return doc;
}

function makeWindow() {
    const listeners = {};
    return {
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        emit(ev) {
            (listeners[ev.type] || []).forEach((fn) => fn(ev));
        }
    };
}

function click(el) {
    el.dispatchEvent({
        type: 'click',
        target: el,
        button: 0,
        preventDefault() {},
        stopPropagation() {}
    });
}

function pointer(el, type, x, y) {
    el.dispatchEvent({
        type,
        target: el,
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 1,
        preventDefault() {},
        stopPropagation() {}
    });
}

function boot(extra) {
    const doc = makeDocument();
    const win = makeWindow();
    const root = makeNode('div', doc);
    root.id = 'inventoryFloatRoot';
    doc.body.appendChild(root);

    const bag = makeNode('div', doc);
    bag.className = 'inv-float-panel';
    bag.style.left = '40px';
    bag.style.top = '60px';
    root.appendChild(bag);

    const shop = makeNode('div', doc);
    shop.id = 'npc-shop';
    shop.className = 'float-panel';
    shop.style.left = '12px';
    shop.style.top = '14px';
    doc.body.appendChild(shop);

    const loot = makeNode('div', doc);
    loot.id = 'loot-panel';
    loot.className = 'float-panel';
    loot.style.left = '18px';
    loot.style.top = '22px';
    doc.body.appendChild(loot);

    const characterBtn = makeNode('button', doc);
    characterBtn.id = 'toggleCharacterBtn';
    doc.body.appendChild(characterBtn);

    const settingsBtn = makeNode('button', doc);
    settingsBtn.id = 'toggleSettingsBtn';
    doc.body.appendChild(settingsBtn);

    let who = extra && Object.prototype.hasOwnProperty.call(extra, 'who') ? extra.who : null;
    const ui = mount({
        document: doc,
        window: win,
        place,
        root,
        getCharacter() { return who; },
        classes: {
            classes: [
                { id: 'guardian', label: 'Guardian' },
                { id: 'mystic', label: 'Mystic' }
            ]
        }
    });
    return {
        doc,
        win,
        ui,
        bag,
        shop,
        loot,
        characterBtn,
        settingsBtn,
        setWho(next) { who = next; },
        getWho() { return who; }
    };
}

test('vocation label uses the catalog label and falls back to the class id', () => {
    const catalog = { classes: [{ id: 'guardian', label: 'Guardian' }, { id: 'scout' }] };
    assert.strictEqual(vocationLabel('guardian', catalog), 'Guardian');
    assert.strictEqual(vocationLabel('Guardian', catalog), 'Guardian');
    assert.strictEqual(vocationLabel('scout', catalog), 'scout');
    assert.strictEqual(vocationLabel('adept', catalog), 'adept');
    assert.strictEqual(vocationLabel('guardian', null), 'guardian');
});

test('play.html puts Character and Settings on the toggle row and drops the old card', () => {
    const html = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');
    const skillsAt = html.indexOf('id="toggleSkillsBtn"');
    const characterAt = html.indexOf('id="toggleCharacterBtn"');
    const settingsAt = html.indexOf('id="toggleSettingsBtn"');
    assert.ok(skillsAt >= 0 && characterAt > skillsAt && settingsAt > characterAt);
    assert.ok(html.includes('title="Character"'));
    assert.ok(html.includes('title="Settings"'));
    assert.ok(html.includes('aria-label="Character"'));
    assert.ok(html.includes('aria-label="Settings"'));
    assert.ok(html.includes('/js/client_window.js'));
    assert.ok(!html.includes('id="openEngineSettingsBtn"'));
    assert.ok(!html.includes('id="equipment-details"'));
    assert.ok(!html.includes('id="profile-modal"'));
    assert.ok(!html.includes('id="profile-body"'));
    assert.ok(!html.includes('id="mouse-mode"'));
    assert.ok(!html.includes('id="move-stack"'));
    assert.ok(!html.includes('>Controls</h2>'));
    assert.ok(html.includes('>Runtime</h2>'));
    assert.ok(html.includes('>Log</h2>'));
    assert.ok(html.includes('id="log"'));
    assert.ok(html.includes('id="leave-side"'));
    const scss = fs.readFileSync(path.join(__dirname, '../scss/app.scss'), 'utf8');
    assert.ok(scss.includes('.float-panel.client-window'));
    assert.ok(scss.includes('.client-window-settings'));
    assert.ok(scss.includes('.client-window-character'));
});

test('one Settings window; a second press focuses and raises it; Escape and close hide it', () => {
    const env = boot();
    click(env.settingsBtn);
    const panel = env.ui.settingsEl();
    assert.strictEqual(env.doc.querySelectorAll('.client-window-settings').length, 1);
    assert.strictEqual(panel.hidden, false);
    assert.ok(panel.classList.contains('is-focused'));
    assert.ok(!panel.classList.contains('modal'));
    assert.ok(!panel.classList.contains('show'));
    assert.notStrictEqual(panel.style.display, 'none');
    const z1 = Number(panel.style.zIndex);
    assert.ok(z1 > 0);
    click(env.settingsBtn);
    assert.strictEqual(env.doc.querySelectorAll('.client-window-settings').length, 1);
    assert.strictEqual(panel.hidden, false);
    assert.ok(panel.classList.contains('is-focused'));
    assert.strictEqual(panel._focused, true);
    assert.ok(Number(panel.style.zIndex) > z1);

    env.win.emit({ type: 'keydown', key: 'Escape', target: env.doc.body });
    assert.strictEqual(panel.hidden, true);
    assert.ok(!panel.classList.contains('is-focused'));

    click(env.settingsBtn);
    assert.strictEqual(panel.hidden, false);
    click(panel.querySelector('.panel-close-btn'));
    assert.strictEqual(panel.hidden, true);
});

test('the Controls page lists the five controls and Hotkeys lists profiles', () => {
    const env = boot();
    click(env.settingsBtn);
    const panel = env.ui.settingsEl();
    const controls = panel.querySelector('[data-pane="controls"]');
    const hotkeys = panel.querySelector('[data-pane="hotkeys"]');
    assert.strictEqual(controls.hidden, false);
    assert.strictEqual(hotkeys.hidden, true);
    assert.ok(hotkeys.querySelector('#action-bar-profile'));
    assert.ok(hotkeys.querySelector('#action-bar-profile-add'));
    assert.ok(hotkeys.querySelector('#action-bar-profile-copy'));
    assert.ok(hotkeys.querySelector('#action-bar-profile-rename'));
    assert.ok(hotkeys.querySelector('#action-bar-profile-remove'));
    assert.ok(hotkeys.textContent.includes('Profile'));
    assert.ok(hotkeys.textContent.includes('Action bars'));
    assert.ok(hotkeys.textContent.includes('General hotkeys'));
    assert.ok(!hotkeys.textContent.includes('Auto-Switch'));
    const dock = hotkeys.querySelector('#action-bar-dock');
    assert.ok(dock.textContent.includes('Bottom'));
    assert.ok(dock.textContent.includes('Left'));
    assert.ok(dock.textContent.includes('Right'));
    assert.ok(!dock.textContent.includes('Top'));
    assert.ok(hotkeys.querySelector('#action-bar-count-bottom'));
    assert.ok(hotkeys.querySelector('#action-bar-count-left'));
    assert.ok(hotkeys.querySelector('#action-bar-count-right'));
    assert.strictEqual(hotkeys.querySelector('#action-bar-count-bottom').value, '1');
    assert.strictEqual(hotkeys.querySelector('#action-bar-count-left').value, '0');
    assert.strictEqual(hotkeys.querySelector('#action-bar-count-right').value, '0');
    assert.ok(!hotkeys.querySelector('#action-bar-count-top'));
    assert.ok(hotkeys.textContent.includes('Up to 3 bars'));
    const text = controls.textContent;
    assert.ok(text.includes('Control'));
    assert.ok(text.includes('Regular'));
    assert.ok(text.includes('Classic'));
    assert.ok(text.includes('Smart Left'));
    assert.ok(text.includes('Loot: Right'));
    assert.ok(text.includes('Loot: SHIFT+Right'));
    assert.ok(text.includes('Loot: Left'));
    assert.ok(text.includes('Talk on right-click'));
    assert.ok(text.includes('Move stack without dialog'));
    assert.ok(text.includes('Auto Chase'));
    const mode = panel.querySelector('#mouse-mode');
    assert.strictEqual(mode.value, '1');
    assert.strictEqual(panel.querySelector('#loot-mode-wrap').hidden, false);
    assert.strictEqual(panel.querySelector('#talk-right-wrap').hidden, true);
    assert.ok(panel.querySelector('#loot-mode'));
    assert.ok(panel.querySelector('#talk-right'));
    assert.ok(panel.querySelector('#move-stack'));
    assert.ok(panel.querySelector('#auto-chase'));
    assert.ok(String(panel.querySelector('#move-stack').getAttribute('title')).includes('Shift always moves 1'));
    click(panel.querySelector('[data-page="hotkeys"]'));
    assert.strictEqual(controls.hidden, true);
    assert.strictEqual(hotkeys.hidden, false);
    assert.ok(panel.querySelector('[data-page="hotkeys"]').classList.contains('is-active'));
    click(panel.querySelector('[data-page="controls"]'));
    assert.strictEqual(controls.hidden, false);
    assert.strictEqual(hotkeys.hidden, true);

    const chosen = [];
    env.ui.setProfiles({
        ids: ['Mystic', 'Aldric'],
        activeId: 'Mystic',
        onChange: function (id) { chosen.push(id); }
    });
    const select = panel.querySelector('#action-bar-profile');
    assert.strictEqual(select.value, 'Mystic');
    assert.ok(select.textContent.includes('Aldric'));
    select.value = 'Aldric';
    select.dispatchEvent({ type: 'change' });
    assert.deepStrictEqual(chosen, ['Aldric']);
    assert.strictEqual(panel.hidden, false);

    const added = [];
    env.ui.setProfiles({
        ids: ['Mystic'],
        activeId: 'Mystic',
        onAdd: function (name) { added.push(name); return true; }
    });
    assert.strictEqual(panel.querySelector('#action-bar-profile-remove').disabled, true);
    const name = panel.querySelector('#action-bar-profile-name');
    name.value = 'Iria';
    click(panel.querySelector('#action-bar-profile-add'));
    assert.deepStrictEqual(added, ['Iria']);
    assert.strictEqual(name.value, '');

    const selected = [];
    env.ui.setSlots({
        dock: 'bottom',
        barId: 1,
        bars: [{ id: 1, label: 'Bar 1' }, { id: 2, label: 'Bar 2' }, { id: 3, label: 'Bar 3' }],
        slots: [{ i: 0, k: 'F1', label: 'Spell snap_jab' }],
        selected: 0,
        onSelect: function (index) { selected.push(index); }
    });
    assert.ok(hotkeys.textContent.includes('Spell snap_jab'));
    assert.ok(hotkeys.textContent.includes('F1'));
    click(hotkeys.querySelector('.client-window-slot'));
    assert.deepStrictEqual(selected, [0]);

    const counts = [];
    env.ui.setSlots({
        dock: 'left',
        barId: 4,
        bars: [{ id: 4, label: 'Bar 4' }],
        slots: [{ i: 12, k: '', label: 'Empty' }],
        counts: { bottom: 2, left: 1, right: 0 },
        selected: 12,
        onCount: function (dockName, n) { counts.push([dockName, n]); }
    });
    assert.strictEqual(hotkeys.querySelector('#action-bar-count-bottom').value, '2');
    assert.strictEqual(hotkeys.querySelector('#action-bar-count-left').value, '1');
    assert.ok(hotkeys.textContent.includes('13'));
    const leftCount = hotkeys.querySelector('#action-bar-count-left');
    leftCount.value = '3';
    leftCount.dispatchEvent({ type: 'change' });
    assert.deepStrictEqual(counts, [['left', 3]]);

    const generalAdds = [];
    env.ui.setGeneralHotkeys({
        rows: [{ id: 'moveNorth', label: 'Move North', group: 'Movement', keys: ['ARROWUP', 'W'] }],
        onAdd: function (id) { generalAdds.push(id); }
    });
    assert.ok(hotkeys.textContent.includes('Move North'));
    assert.ok(hotkeys.textContent.includes('ARROWUP'));
    click(hotkeys.querySelector('.client-window-key-add'));
    assert.deepStrictEqual(generalAdds, ['moveNorth']);
    assert.strictEqual(panel.hidden, false);
});

test('control changes reveal loot or talk, save the bag, and survive a reopen', () => {
    const env = boot();
    const seen = [];
    let chaseCalls = 0;
    env.ui.bindControls({
        mouse: {
            mouseControlMode: 2,
            lootControlMode: 1,
            talkOnRightClick: true,
            moveStack: false
        },
        autoChase: true,
        onMouse(next) {
            seen.push(next);
            return next;
        },
        onAutoChase() { chaseCalls += 1; }
    });
    const panel = env.ui.settingsEl();
    const mode = panel.querySelector('#mouse-mode');
    const lootWrap = panel.querySelector('#loot-mode-wrap');
    const talkWrap = panel.querySelector('#talk-right-wrap');
    const stack = panel.querySelector('#move-stack');
    const chase = panel.querySelector('#auto-chase');
    assert.strictEqual(mode.value, '2');
    assert.strictEqual(panel.querySelector('#loot-mode').value, '1');
    assert.strictEqual(lootWrap.hidden, true);
    assert.strictEqual(talkWrap.hidden, true);
    assert.strictEqual(panel.querySelector('#talk-right').checked, true);
    assert.strictEqual(chase.checked, true);
    assert.strictEqual(chaseCalls, 0);

    mode.value = '1';
    mode.dispatchEvent({ type: 'change' });
    assert.strictEqual(lootWrap.hidden, false);
    assert.strictEqual(talkWrap.hidden, true);
    assert.strictEqual(seen[seen.length - 1].mouseControlMode, 1);
    assert.strictEqual(seen[seen.length - 1].lootControlMode, 1);

    mode.value = '0';
    mode.dispatchEvent({ type: 'change' });
    assert.strictEqual(lootWrap.hidden, true);
    assert.strictEqual(talkWrap.hidden, false);
    assert.strictEqual(seen[seen.length - 1].talkOnRightClick, true);

    let blurred = 0;
    stack.blur = function () { blurred += 1; };
    stack.checked = true;
    stack.dispatchEvent({ type: 'change' });
    assert.strictEqual(seen[seen.length - 1].moveStack, true);
    assert.strictEqual(blurred, 1);

    chase.checked = false;
    chase.dispatchEvent({ type: 'change' });
    assert.strictEqual(chaseCalls, 1);

    panel.hidden = true;
    click(env.settingsBtn);
    assert.strictEqual(panel.hidden, false);
    assert.strictEqual(mode.value, '0');
    assert.strictEqual(stack.checked, true);
    assert.strictEqual(talkWrap.hidden, false);
    assert.strictEqual(lootWrap.hidden, true);
});

test('Character stays closed until a character exists, then lists food and capacity', () => {
    const env = boot();
    click(env.characterBtn);
    const panel = env.ui.characterEl();
    assert.strictEqual(panel.hidden, true);
    assert.strictEqual(env.doc.querySelectorAll('.client-window-character').length, 1);

    env.setWho({
        name: 'Aria',
        vocation: 'guardian',
        level: 12,
        hp: 80,
        hpMax: 100,
        mp: 30,
        mpMax: 50,
        experience: 400
    });
    click(env.characterBtn);
    assert.strictEqual(panel.hidden, false);
    assert.ok(!panel.classList.contains('modal'));
    assert.ok(!panel.classList.contains('show'));
    assert.notStrictEqual(panel.style.display, 'none');
    const text = panel.textContent;
    assert.ok(text.includes('Aria'));
    assert.ok(text.includes('Guardian'));
    assert.ok(text.includes('Level'));
    assert.ok(text.includes('12'));
    assert.ok(text.includes('HP'));
    assert.ok(text.includes('80/100'));
    assert.ok(text.includes('MP'));
    assert.ok(text.includes('30/50'));
    assert.ok(text.includes('Experience'));
    assert.ok(text.includes('400'));
    assert.ok(text.includes('Food'));
    assert.ok(text.includes('00:00'));
    assert.ok(text.includes('Capacity'));
    assert.ok(text.includes('—'));
    const food = panel.querySelector('[data-field="food"]');
    const cap = panel.querySelector('[data-field="capacity"]');
    assert.ok(food.parentNode.classList.contains('is-hungry'));
    assert.strictEqual(food.parentNode.getAttribute('title'), 'You are hungry');
    assert.ok(!cap.parentNode.classList.contains('is-low'));
    assert.strictEqual(cap.parentNode.getAttribute('title'), '');

    env.getWho().foodSeconds = 180;
    env.getWho().cap = 350;
    env.getWho().capMax = 600;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('03:00'));
    assert.ok(!panel.textContent.includes('00:00'));
    assert.ok(panel.textContent.includes('350/600'));
    assert.ok(!food.parentNode.classList.contains('is-hungry'));
    assert.strictEqual(food.parentNode.getAttribute('title'), 'Food');
    assert.strictEqual(cap.parentNode.getAttribute('title'), 'You have 350 of 600 capacity left');
    assert.ok(!cap.parentNode.classList.contains('is-low'));

    env.getWho().foodSeconds = 65;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('01:05'));
    assert.ok(!food.parentNode.classList.contains('is-hungry'));

    env.getWho().foodSeconds = 0;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('00:00'));
    assert.ok(food.parentNode.classList.contains('is-hungry'));

    env.getWho().cap = 120;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('120/600'));
    assert.ok(cap.parentNode.classList.contains('is-low'));

    env.getWho().cap = 0;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('0/600'));
    assert.ok(cap.parentNode.classList.contains('is-low'));

    const z1 = Number(panel.style.zIndex);
    click(env.characterBtn);
    assert.strictEqual(env.doc.querySelectorAll('.client-window-character').length, 1);
    assert.strictEqual(panel.hidden, false);
    assert.ok(Number(panel.style.zIndex) > z1);
    assert.ok(panel.classList.contains('is-focused'));

    env.getWho().hp = 55;
    env.ui.syncCharacter(env.getWho());
    assert.ok(panel.textContent.includes('55/100'));
    assert.ok(panel.textContent.includes('Aria'));

    env.ui.setClasses({ classes: [{ id: 'guardian' }] });
    assert.ok(panel.textContent.includes('guardian'));
    assert.ok(!panel.textContent.includes('Guardian'));

    click(env.settingsBtn);
    assert.strictEqual(env.ui.settingsEl().hidden, false);
    env.win.emit({ type: 'keydown', key: 'Escape', target: env.doc.body });
    assert.strictEqual(env.ui.settingsEl().hidden, true);
    assert.strictEqual(panel.hidden, false);

    env.ui.syncCharacter(null);
    assert.strictEqual(panel.hidden, true);
});

test('opening either window leaves bags, the shop, and loot where they are', () => {
    const env = boot();
    env.setWho({
        name: 'Aria',
        vocation: 'mystic',
        level: 4,
        hp: 10,
        hpMax: 20,
        mp: 5,
        mpMax: 15,
        experience: 9
    });
    click(env.settingsBtn);
    click(env.characterBtn);
    assert.strictEqual(env.bag.style.left, '40px');
    assert.strictEqual(env.bag.style.top, '60px');
    assert.strictEqual(env.shop.style.left, '12px');
    assert.strictEqual(env.shop.style.top, '14px');
    assert.strictEqual(env.loot.style.left, '18px');
    assert.strictEqual(env.loot.style.top, '22px');
    assert.ok(env.ui.characterEl().textContent.includes('Mystic'));
});

test('title-bar drag moves the window and the viewport clamp keeps it inside', () => {
    const env = boot();
    click(env.settingsBtn);
    const panel = env.ui.settingsEl();
    const header = panel.querySelector('.panel-title-bar');
    const left0 = parseFloat(panel.style.left);
    const top0 = parseFloat(panel.style.top);
    pointer(header, 'pointerdown', 10, 10);
    pointer(header, 'pointermove', 50, 28);
    pointer(header, 'pointerup', 50, 28);
    assert.strictEqual(parseFloat(panel.style.left), left0 + 40);
    assert.strictEqual(parseFloat(panel.style.top), top0 + 18);

    env.win.innerWidth = 300;
    env.win.innerHeight = 300;
    panel.offsetWidth = 240;
    panel.offsetHeight = 180;
    const left1 = parseFloat(panel.style.left);
    const top1 = parseFloat(panel.style.top);
    pointer(header, 'pointerdown', 0, 0);
    pointer(header, 'pointermove', 5000, 5000);
    pointer(header, 'pointerup', 5000, 5000);
    const maxLeft = (300 - 8) - 240;
    const maxTop = (300 - 8) - 180;
    assert.strictEqual(parseFloat(panel.style.left), Math.min(maxLeft, left1 + 5000));
    assert.strictEqual(parseFloat(panel.style.top), Math.min(maxTop, top1 + 5000));
    assert.ok(parseFloat(panel.style.left) + panel.offsetWidth <= 300 - 8);
    assert.ok(parseFloat(panel.style.top) + panel.offsetHeight <= 300 - 8);
});

test('dragging and closing Settings leaves the bag, shop, loot, and assign modal', () => {
    const env = boot();
    const slot = makeNode('div', env.doc);
    slot.className = 'inv-slot';
    slot.textContent = 'rope';
    env.bag.appendChild(slot);
    env.bag.hidden = false;
    env.bag.style.zIndex = '1001';
    env.shop.hidden = false;
    env.loot.hidden = false;

    const assign = makeNode('div', env.doc);
    assign.className = 'action-bar-assign-modal';
    assign.style.left = '70px';
    assign.style.top = '80px';
    env.doc.body.appendChild(assign);

    click(env.settingsBtn);
    const panel = env.ui.settingsEl();
    assert.ok(Number(panel.style.zIndex) > 1001);
    const header = panel.querySelector('.panel-title-bar');
    const left0 = parseFloat(panel.style.left);
    const top0 = parseFloat(panel.style.top);
    pointer(header, 'pointerdown', 10, 10);
    pointer(header, 'pointermove', 40, 28);
    pointer(header, 'pointerup', 40, 28);
    assert.strictEqual(parseFloat(panel.style.left), left0 + 30);
    assert.strictEqual(parseFloat(panel.style.top), top0 + 18);
    assert.strictEqual(env.bag.style.left, '40px');
    assert.strictEqual(env.bag.style.top, '60px');
    assert.strictEqual(env.bag.hidden, false);
    assert.strictEqual(slot.parentNode, env.bag);
    assert.strictEqual(slot.textContent, 'rope');
    assert.strictEqual(env.shop.style.left, '12px');
    assert.strictEqual(env.shop.style.top, '14px');
    assert.strictEqual(env.loot.style.left, '18px');
    assert.strictEqual(env.loot.style.top, '22px');
    assert.strictEqual(assign.style.left, '70px');
    assert.strictEqual(assign.style.top, '80px');
    assert.strictEqual(assign.parentNode, env.doc.body);

    click(panel.querySelector('.panel-close-btn'));
    assert.strictEqual(panel.hidden, true);
    assert.strictEqual(env.bag.hidden, false);
    assert.strictEqual(env.bag.style.left, '40px');
    assert.strictEqual(env.shop.style.left, '12px');
    assert.strictEqual(env.loot.style.left, '18px');

    click(env.settingsBtn);
    assert.strictEqual(panel.hidden, false);
    env.win.emit({ type: 'keydown', key: 'Escape', target: env.doc.body });
    assert.strictEqual(panel.hidden, true);
    assert.strictEqual(env.bag.hidden, false);
    assert.strictEqual(env.bag.style.left, '40px');
    assert.strictEqual(env.bag.style.top, '60px');
    assert.strictEqual(env.shop.hidden, false);
    assert.strictEqual(env.shop.style.left, '12px');
    assert.strictEqual(env.loot.hidden, false);
    assert.strictEqual(env.loot.style.left, '18px');
    assert.strictEqual(assign.style.left, '70px');
});

test('a narrow viewport still opens Settings inside the workspace', () => {
    const html = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');
    const toggles = html.slice(html.indexOf('id="sidebarPanelToggles"'), html.indexOf('game-backpack-panel'));
    assert.ok(toggles.includes('id="toggleSettingsBtn"'));
    const scss = fs.readFileSync(path.join(__dirname, '../scss/app.scss'), 'utf8');
    assert.ok(scss.includes('.sidebar-panel-toggles'));
    assert.ok(/\.sidebar-panel-toggles\s*\{[^}]*display:\s*flex/.test(scss));
    assert.ok(!/#toggleSettingsBtn[^{]*\{[^}]*display:\s*none/.test(scss));

    const env = boot();
    env.win.innerWidth = 320;
    env.win.innerHeight = 480;
    click(env.settingsBtn);
    const panel = env.ui.settingsEl();
    assert.strictEqual(panel.hidden, false);
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    assert.ok(left >= 8);
    assert.ok(top >= 8);
    assert.ok(left + panel.offsetWidth <= 320 - 8);
    assert.ok(top + panel.offsetHeight <= 480 - 8);
});

if (failed > 0) {
    console.error(failed + ' failed, ' + passed + ' passed');
    process.exit(1);
}
console.log(passed + ' passed');
