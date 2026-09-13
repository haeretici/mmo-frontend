'use strict';

const assert = require('assert');
const Sprites = require('../static/js/sprites.js');

function main() {
    assert.strictEqual(Sprites.idToFileStem('simple_dead_tree'), 'Simple_Dead_Tree');
    assert.strictEqual(Sprites.idToFileStem('rat'), 'Rat');
    assert.strictEqual(
        Sprites.spritePath('rpg_fantasy', 'tiles', 'damp_wood_floor', 'icon'),
        '/sprites/rpg_fantasy/tiles/icon/Damp_Wood_Floor.png'
    );
    const urls = Sprites.spriteUrlCandidates({
        genre: 'rpg_fantasy',
        kind: 'creatures',
        id: 'rat',
        variant: 'small'
    });
    assert.ok(urls[0].endsWith('/small/Rat.png'));
    assert.ok(urls.some((u) => u.endsWith('/icon/Rat.png')));
    console.log('ok sprites');
}

main();
