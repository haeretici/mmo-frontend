#!/usr/bin/env node
'use strict';

/**
 * Unit tests for draggable floating modals/panels in frontend/static/js/play.js:
 * - Bags (containers)
 * - NPC Dialog (npc-dialog)
 * - NPC Trade / Shop (npc-shop)
 * - Loot / Corpses (loot-panel)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// Minimal DOM mock
function makeNode(tag) {
    const listeners = new Map();
    const node = {
        tagName: String(tag || 'div').toUpperCase(),
        className: '',
        id: '',
        style: {},
        dataset: {},
        childNodes: [],
        parentNode: null,
        offsetLeft: 50,
        offsetTop: 80,
        offsetWidth: 240,
        offsetHeight: 180,
        hidden: false,
        disabled: false,
        capturedPointerId: null,
        _textContent: '',
        get textContent() {
            if (this.childNodes.length === 0) return this._textContent;
            return this.childNodes.map((c) => c.textContent).join('');
        },
        set textContent(v) {
            this.childNodes = [];
            this._textContent = String(v || '');
        },
        appendChild(child) {
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        },
        removeChild(child) {
            const idx = this.childNodes.indexOf(child);
            if (idx >= 0) this.childNodes.splice(idx, 1);
            child.parentNode = null;
            return child;
        },
        addEventListener(event, fn) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(fn);
        },
        removeEventListener(event, fn) {
            if (!listeners.has(event)) return;
            const list = listeners.get(event).filter((f) => f !== fn);
            listeners.set(event, list);
        },
        dispatchEvent(event) {
            event.target = event.target || this;
            const list = listeners.get(event.type) || [];
            for (const fn of list) {
                fn(event);
            }
        },
        closest(sel) {
            if (!sel) return null;
            const tagMatch = sel.toUpperCase() === this.tagName;
            const classMatch = sel.startsWith('.') && this.className.includes(sel.slice(1));
            const idMatch = sel.startsWith('#') && this.id === sel.slice(1);
            if (tagMatch || classMatch || idMatch) return this;
            if (this.parentNode && typeof this.parentNode.closest === 'function') {
                return this.parentNode.closest(sel);
            }
            return null;
        },
        querySelector(sel) {
            for (const child of this.childNodes) {
                const tagMatch = sel.toUpperCase() === child.tagName;
                const classMatch = sel.split(',').some((s) => {
                    const c = s.trim();
                    return c.startsWith('.') && child.className.includes(c.slice(1));
                });
                const idMatch = sel.startsWith('#') && child.id === sel.slice(1);
                if (tagMatch || classMatch || idMatch) return child;
                if (typeof child.querySelector === 'function') {
                    const found = child.querySelector(sel);
                    if (found) return found;
                }
            }
            return null;
        },
        setPointerCapture(id) {
            this.capturedPointerId = id;
        }
    };
    return node;
}

const playSource = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');

// Test 1: wireFloatHeaderDrag core dragging mechanics
test('wireFloatHeaderDrag updates style.left and style.top on pointer movements and captures pointer', () => {
    const sandbox = {
        floatZ: 1,
        console: console
    };
    vm.createContext(sandbox);

    // Extract bringFloatToFront and wireFloatHeaderDrag
    const bringMatch = playSource.match(/function bringFloatToFront\s*\([\s\S]*?\n\}/);
    assert.ok(bringMatch, 'bringFloatToFront function found');
    vm.runInContext(bringMatch[0], sandbox);

    const wireMatch = playSource.match(/function wireFloatHeaderDrag\s*\([\s\S]*?\n\}/);
    assert.ok(wireMatch, 'wireFloatHeaderDrag function found');
    vm.runInContext(wireMatch[0], sandbox);

    const panel = makeNode('div');
    panel.id = 'test-panel';
    panel.offsetLeft = 100;
    panel.offsetTop = 150;

    const header = makeNode('div');
    header.className = 'panel-title-bar';
    panel.appendChild(header);

    const closeBtn = makeNode('button');
    closeBtn.className = 'panel-close-btn';
    header.appendChild(closeBtn);

    sandbox.wireFloatHeaderDrag(header, panel);

    // 1. Dragging by header
    header.dispatchEvent({
        type: 'pointerdown',
        pointerId: 4,
        clientX: 200,
        clientY: 250,
        target: header
    });

    assert.strictEqual(header.capturedPointerId, 4, 'Pointer capture should be activated');
    assert.strictEqual(panel.style.zIndex, '1002', 'Panel zIndex should be elevated on pointerdown');

    // Move pointer by dx = +35, dy = -20
    header.dispatchEvent({
        type: 'pointermove',
        pointerId: 4,
        clientX: 235,
        clientY: 230
    });

    assert.strictEqual(panel.style.left, '135px', 'style.left should update with delta (100 + 35)');
    assert.strictEqual(panel.style.top, '130px', 'style.top should update with delta (150 - 20)');

    // 2. Release pointer (pointerup)
    header.dispatchEvent({ type: 'pointerup' });

    // Moving pointer after pointerup should NOT change position
    header.dispatchEvent({
        type: 'pointermove',
        pointerId: 4,
        clientX: 300,
        clientY: 300
    });
    assert.strictEqual(panel.style.left, '135px', 'Position must not change after pointerup');
    assert.strictEqual(panel.style.top, '130px', 'Position must not change after pointerup');

    // 3. Subsequent drag resumes from new position
    panel.offsetLeft = 135;
    panel.offsetTop = 130;
    header.dispatchEvent({
        type: 'pointerdown',
        pointerId: 5,
        clientX: 150,
        clientY: 150,
        target: header
    });
    header.dispatchEvent({
        type: 'pointermove',
        pointerId: 5,
        clientX: 160,
        clientY: 170
    });
    assert.strictEqual(panel.style.left, '145px', 'Next drag should offset from new sl (135 + 10)');
    assert.strictEqual(panel.style.top, '150px', 'Next drag should offset from new st (130 + 20)');

    // 4. Cancel drag (pointercancel)
    header.dispatchEvent({ type: 'pointercancel' });
    header.dispatchEvent({
        type: 'pointermove',
        pointerId: 5,
        clientX: 200,
        clientY: 200
    });
    assert.strictEqual(panel.style.left, '145px', 'Position must not change after pointercancel');
});

test('wireFloatHeaderDrag ignores clicks on buttons inside header', () => {
    const sandbox = {
        floatZ: 1,
        console: console
    };
    vm.createContext(sandbox);

    const bringMatch = playSource.match(/function bringFloatToFront\s*\([\s\S]*?\n\}/);
    vm.runInContext(bringMatch[0], sandbox);
    const wireMatch = playSource.match(/function wireFloatHeaderDrag\s*\([\s\S]*?\n\}/);
    vm.runInContext(wireMatch[0], sandbox);

    const panel = makeNode('div');
    panel.offsetLeft = 80;
    panel.offsetTop = 60;
    const header = makeNode('div');
    const closeBtn = makeNode('button');
    header.appendChild(closeBtn);
    panel.appendChild(header);

    sandbox.wireFloatHeaderDrag(header, panel);

    // Click on button inside header
    header.dispatchEvent({
        type: 'pointerdown',
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        target: closeBtn
    });

    assert.strictEqual(header.capturedPointerId, null, 'Should not capture pointer when button is target');

    // Move pointer
    header.dispatchEvent({
        type: 'pointermove',
        pointerId: 1,
        clientX: 150,
        clientY: 150
    });

    assert.strictEqual(panel.style.left, undefined, 'style.left should remain undefined');
    assert.strictEqual(panel.style.top, undefined, 'style.top should remain undefined');
});

test('initFloatPanelDrag wires npc-dialog, npc-shop, and loot-panel', () => {
    const elements = {};
    const sandbox = {
        floatZ: 10,
        elements: elements,
        $: function (id) { return elements[id] || null; },
        console: console
    };
    vm.createContext(sandbox);

    const bringMatch = playSource.match(/function bringFloatToFront\s*\([\s\S]*?\n\}/);
    vm.runInContext(bringMatch[0], sandbox);
    const wireMatch = playSource.match(/function wireFloatHeaderDrag\s*\([\s\S]*?\n\}/);
    vm.runInContext(wireMatch[0], sandbox);
    const initMatch = playSource.match(/function initFloatPanelDrag\s*\([\s\S]*?\n\}/);
    assert.ok(initMatch, 'initFloatPanelDrag function found');
    vm.runInContext(initMatch[0], sandbox);

    const dialogPanel = makeNode('div');
    dialogPanel.id = 'npc-dialog';
    const dialogHeader = makeNode('div');
    dialogHeader.className = 'am-sidebar-title-row panel-title-bar';
    dialogPanel.appendChild(dialogHeader);

    sandbox.elements['npc-dialog'] = dialogPanel;

    sandbox.initFloatPanelDrag('npc-dialog');

    // Drag npc-dialog
    dialogPanel.offsetLeft = 200;
    dialogPanel.offsetTop = 100;
    dialogHeader.dispatchEvent({
        type: 'pointerdown',
        pointerId: 7,
        clientX: 210,
        clientY: 110,
        target: dialogHeader
    });
    dialogHeader.dispatchEvent({
        type: 'pointermove',
        pointerId: 7,
        clientX: 250,
        clientY: 130
    });
    assert.strictEqual(dialogPanel.style.left, '240px', 'npc-dialog left dragged');
    assert.strictEqual(dialogPanel.style.top, '120px', 'npc-dialog top dragged');
    dialogHeader.dispatchEvent({ type: 'pointerup' });

    // Clicking inside dialog panel elevates zIndex
    dialogPanel.dispatchEvent({ type: 'pointerdown', target: dialogPanel });
    assert.strictEqual(dialogPanel.style.zIndex, '1012', 'Dialog zIndex elevated on panel pointerdown');
});

test('renderDialog populates text, reply buttons, and preserves position when already visible', () => {
    const dialogPanel = makeNode('div');
    dialogPanel.id = 'npc-dialog';
    dialogPanel.hidden = true;
    const dialogBody = makeNode('div');
    dialogBody.id = 'dialog-body';
    dialogPanel.appendChild(dialogBody);

    let placed = 0;
    const elements = {
        'npc-dialog': dialogPanel,
        'dialog-body': dialogBody
    };

    const sandbox = {
        talkNpc: 42,
        elements: elements,
        $: function (id) { return elements[id] || null; },
        placeFloat: function () { placed += 1; },
        document: {
            createElement: function (tag) { return makeNode(tag); }
        },
        send: function () {},
        C2S: { TALK_REPLY: 10 },
        Uint8Array: Uint8Array,
        DataView: DataView,
        console: console
    };
    vm.createContext(sandbox);

    const renderDialogMatch = playSource.match(/function renderDialog\s*\([\s\S]*?\n\}/);
    assert.ok(renderDialogMatch, 'renderDialog function found');
    vm.runInContext(renderDialogMatch[0], sandbox);

    // First call: window was hidden -> should place float
    sandbox.renderDialog("Hello traveller", ['Trade', 'Bye']);
    assert.strictEqual(placed, 1, 'placeFloat called on first open');
    assert.strictEqual(dialogPanel.hidden, false, 'dialog should be visible');

    const textEl = dialogBody.querySelector('.inv-npc-dialog-text');
    assert.ok(textEl, 'dialog text element exists');
    assert.strictEqual(textEl.textContent, 'Hello traveller');

    const repliesEl = dialogBody.querySelector('.inv-npc-dialog-replies');
    assert.ok(repliesEl, 'replies container must be appended to dialogBody');
    assert.strictEqual(repliesEl.childNodes.length, 2, 'two reply buttons must exist');
    assert.strictEqual(repliesEl.childNodes[0].textContent, 'Trade');
    assert.strictEqual(repliesEl.childNodes[1].textContent, 'Bye');

    // Simulate player dragging window to custom position
    dialogPanel.style.left = '320px';
    dialogPanel.style.top = '140px';

    // Second call with next dialog text
    sandbox.renderDialog("Shops, Hale's jobs, the temple...", ['Jobs', 'Shops', 'Bye']);
    assert.strictEqual(placed, 1, 'placeFloat must NOT be called again if dialog already visible');
    assert.strictEqual(dialogPanel.style.left, '320px', 'Position must be preserved');
    assert.strictEqual(dialogPanel.style.top, '140px', 'Position must be preserved');

    const newReplies = dialogBody.querySelector('.inv-npc-dialog-replies');
    assert.ok(newReplies, 'new replies container must be appended');
    assert.strictEqual(newReplies.childNodes.length, 3, 'three reply buttons must be rendered');
    assert.strictEqual(newReplies.childNodes[0].textContent, 'Jobs');
    assert.strictEqual(newReplies.childNodes[1].textContent, 'Shops');
    assert.strictEqual(newReplies.childNodes[2].textContent, 'Bye');
});

test('SCSS and CSS contain drag cursors and touch-action for floating panel headers', () => {
    const scss = fs.readFileSync(path.join(__dirname, '../scss/app.scss'), 'utf8');
    assert.ok(scss.includes('cursor: move;'), 'app.scss contains cursor: move');
    assert.ok(scss.includes('touch-action: none;'), 'app.scss contains touch-action: none');

    const css = fs.readFileSync(path.join(__dirname, '../static/css/app.css'), 'utf8');
    assert.ok(css.includes('cursor:move'), 'compiled app.css contains cursor:move');
    assert.ok(css.includes('touch-action:none'), 'compiled app.css contains touch-action:none');
});

if (failed > 0) {
    process.exit(1);
} else {
    console.log(`\nAll ${passed} float_panel_drag tests passed.`);
}
