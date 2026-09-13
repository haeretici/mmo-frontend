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
    assert.strictEqual(
        Sprites.resolveItemSpriteUrl('iron_longsword', 'rpg_fantasy'),
        '/sprites/rpg_fantasy/equipment/alpha/Iron_Longsword.png'
    );
    assert.strictEqual(
        Sprites.resolveItemSpriteUrl({ id: 'oak_shield' }),
        '/sprites/rpg_fantasy/equipment/alpha/Oak_Shield.png'
    );
    assert.strictEqual(
        Sprites.resolveItemSpriteUrl({ customSprite: 'steel_helm' }),
        '/sprites/rpg_fantasy/equipment/alpha/Steel_Helm.png'
    );
    console.log('ok sprites');
}

main();

