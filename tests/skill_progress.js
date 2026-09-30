'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const progress = require('../static/js/skill_progress.js');
const server = require('../../server/src/world/progression.js');

function main() {
    const classes = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../../content/classes.json'),
        'utf8'
    ));
    const rows = classes.classes || [];
    assert.strictEqual(rows.length, 6);
    for (let i = 0; i < rows.length; i++) {
        const id = rows[i].id;
        const rates = progress.ratesFor(id);
        assert.ok(rates, id);
        assert.strictEqual(rates.melee, rows[i].skillRates.melee, id + ' melee');
        assert.strictEqual(rates.fist, rows[i].skillRates.fist, id + ' fist');
        assert.strictEqual(rates.distance, rows[i].skillRates.distance, id + ' distance');
        assert.strictEqual(rates.shielding, rows[i].skillRates.shielding, id + ' shielding');
        assert.strictEqual(rates.magic, rows[i].skillRates.magic, id + ' magic');
    }
    assert.strictEqual(progress.ratesFor('unknown'), null);

    assert.strictEqual(progress.getExpForLevel(5000), server.getExpForLevel(5000));
    assert.strictEqual(progress.getExpForLevel(5000), 2080834749800);
    const guardian = progress.ratesFor('guardian');
    assert.strictEqual(
        progress.getReqSkillTries('sword', 12, guardian),
        server.getReqSkillTries('sword', 12, guardian)
    );
    assert.strictEqual(
        progress.getReqSkillTries('sword', 12, guardian),
        progress.getReqSkillTries('club', 12, guardian)
    );
    assert.strictEqual(
        progress.getReqMana(16, guardian),
        server.getReqMana(16, guardian)
    );

    const level = progress.levelProgress(2080834749800, 5000);
    assert.strictEqual(level.percent, 0);
    assert.strictEqual(level.percentToGo, 100);
    assert.strictEqual(level.tooltip, 'You have 100.00 percent to go');

    const span = server.getExpForLevel(3) - server.getExpForLevel(2);
    const mid = progress.levelProgress(server.getExpForLevel(2) + span / 2, 2);
    assert.strictEqual(mid.percent, 50);
    assert.strictEqual(mid.tooltip, 'You have 50.00 percent to go');

    const sword = progress.skillProgress('sword', 11, 25, guardian);
    const need = progress.getReqSkillTries('sword', 12, guardian);
    assert.strictEqual(need, 55);
    assert.strictEqual(sword.percent, Math.round((25 * 100 / need) * 100) / 100);

    const magic = progress.skillProgress('magic', 0, 800, guardian);
    assert.strictEqual(progress.getReqMana(1, guardian), 1600);
    assert.strictEqual(magic.percent, 50);
    assert.strictEqual(magic.tooltip, 'You have 50.00 percent to go');

    const play = fs.readFileSync(path.join(__dirname, '../static/js/play.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../static/play.html'), 'utf8');
    assert.ok(play.includes('S2C.SKILL_PROGRESS'));
    assert.ok(play.includes('linear-gradient(to right, #31582f '));
    assert.ok(play.includes('#0a0d12'));
    assert.ok(play.includes('rgba(0, 0, 0, 0.25)'));
    assert.ok(play.includes('SkillProgress.levelProgress'));
    assert.ok(play.includes('SkillProgress.skillProgress'));
    const htmlMod = html.indexOf('/js/skill_progress.js');
    const htmlPlay = html.indexOf('/js/play.js');
    assert.ok(htmlMod > 0 && htmlMod < htmlPlay, 'skill_progress.js loads before play.js');

    console.log('skill_progress ok');
}

main();
