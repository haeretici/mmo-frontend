'use strict';

const assert = require('assert');
const { listActiveStatusIcons, renderStatusBar } = require('../static/js/status_icons.js');

function fakeDocument() {
    function el() {
        return {
            className: '',
            style: {},
            hidden: false,
            children: [],
            attrs: {},
            setAttribute(name, value) { this.attrs[name] = value; },
            appendChild(child) { this.children.push(child); }
        };
    }
    return { createElement: el };
}

function main() {
    const icons = listActiveStatusIcons({
        inProtectionZone: true,
        hungry: true,
        conditions: [
            { kind: 'poison' },
            { kind: 'burning' },
            { kind: 'fire' },
            { type: 'paralyzed' }
        ]
    });
    assert.deepStrictEqual(
        icons.map((row) => row.kind),
        ['protection_zone', 'hungry', 'poison', 'fire', 'slow']
    );
    assert.strictEqual(icons[0].icon, 'fa-house');
    assert.strictEqual(icons[0].title, 'You are within a protection zone');
    assert.strictEqual(icons[1].icon, 'fa-drumstick-bite');
    assert.strictEqual(icons[1].title, 'You are hungry');
    const burn = icons.find((row) => row.kind === 'fire');
    assert.strictEqual(burn.icon, 'fa-fire');
    assert.strictEqual(burn.title, 'You are burning');
    assert.strictEqual(listActiveStatusIcons(null).length, 0);
    assert.strictEqual(listActiveStatusIcons({ conditions: [] }).length, 0);
    assert.strictEqual(
        listActiveStatusIcons({ foodSeconds: 0, conditions: [{ kind: 'food' }] }).length,
        0,
        'the food clock is not a condition icon unless hungry is set'
    );

    const prev = global.document;
    global.document = fakeDocument();
    const bar = {
        dataset: {},
        hidden: true,
        _text: 'stale',
        attrs: {},
        children: [],
        get textContent() { return this._text; },
        set textContent(value) {
            this._text = value;
            if (value === '') this.children.length = 0;
        },
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { this.children.push(child); }
    };
    renderStatusBar(bar, { inProtectionZone: true, conditions: [{ kind: 'poison' }] });
    assert.strictEqual(bar.hidden, false);
    assert.strictEqual(bar.attrs['aria-hidden'], 'false');
    assert.strictEqual(bar.children.length, 2);
    assert.strictEqual(bar.children[0].attrs['data-status'], 'protection_zone');
    assert.strictEqual(bar.children[1].attrs['data-status'], 'poison');
    assert.ok(String(bar.children[1].title).indexOf('poisoned') >= 0);
    const painted = bar.children.length;
    renderStatusBar(bar, { inProtectionZone: true, conditions: [{ kind: 'poison' }] });
    assert.strictEqual(bar.children.length, painted, 'unchanged signature does not repaint');
    renderStatusBar(bar, { conditions: [] });
    assert.strictEqual(bar.hidden, true);
    assert.strictEqual(bar.children.length, 0);
    global.document = prev;

    console.log('ok status_icons');
}

main();
