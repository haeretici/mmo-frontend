'use strict';

const assert = require('assert');
const assign = require('../static/js/action_bar_assign.js');

assert.strictEqual(assign.TEXT_MAX_LEN, 255);
assert.strictEqual(assign.MULTI_DEPTH, 3);

const spells = assign.spellBookToList([
    { id: 'a', label: 'Zap', vocations: ['mystic'], level: 20, group: 'attack' },
    { id: 'b', label: 'Heal', vocations: ['guardian'], level: 5, group: 'healing' },
    { id: 'c', label: 'Common Bolt', level: 1, group: 'attack' },
    { id: 'd', label: 'Alpha', vocations: ['mystic'], level: 2, group: 'support' }
]);
const mystic = assign.filterSpells(spells, { vocation: 'mystic', showAll: false, sort: 'name' });
assert.deepStrictEqual(mystic.map((s) => s.id), ['d', 'c', 'a']);
const q = assign.filterSpells(spells, { query: 'heal', showAll: true });
assert.strictEqual(q.length, 1);
assert.strictEqual(q[0].id, 'b');
const byLvl = assign.filterSpells(spells, { showAll: true, sort: 'level' });
assert.strictEqual(byLvl[0].id, 'c');

assert.strictEqual(assign.isBlockedHotkey('ESCAPE'), true);
assert.strictEqual(assign.isBlockedHotkey('W'), true);
assert.strictEqual(assign.isBlockedHotkey('ARROWUP'), true);
assert.strictEqual(assign.isBlockedHotkey('F1'), false);
assert.strictEqual(assign.isBlockedHotkey('SHIFT+W'), false);
assert.strictEqual(assign.isBlockedHotkey('1'), false);

assert.strictEqual(
    assign.eventToHotkeyString({ key: 'f1', ctrlKey: true, shiftKey: false, altKey: false }),
    'CTRL+F1'
);
assert.strictEqual(
    assign.eventToHotkeyString({ key: ' ', ctrlKey: false, shiftKey: true, altKey: false }),
    'SHIFT+SPACE'
);
assert.strictEqual(assign.eventToHotkeyString({ key: 'Shift' }), '');

const draft = assign.draftMultiActions([
    { t: 'spell', id: 'snap_jab', m: 'self' }
]);
assert.strictEqual(draft.length, 3);
assert.strictEqual(draft[0].t, 'spell');
assert.strictEqual(draft[1].t, 'empty');
assert.strictEqual(assign.multiSubLabel(0), 'I');
assert.ok(assign.multiSubSummary(draft[0]).indexOf('snap_jab') >= 0);
assert.strictEqual(assign.slotFilled({ t: 'spell', id: 'snap_jab' }), true);
assert.strictEqual(assign.slotFilled({ t: 'empty' }), false);

console.log('ok action_bar_assign');
