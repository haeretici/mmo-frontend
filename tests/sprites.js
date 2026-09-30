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
    assert.strictEqual(
        Sprites.spritePath('rpg_fantasy', 'tiles', 'ref_water_fill', 'icon', 1),
        '/sprites/rpg_fantasy/tiles/icon/Ref_Water_Fill_1.png'
    );
    const classes = {
        classes: [
            { id: 'guardian', baseSprite: 'iron_hill_giant_executioner' },
            { id: 'scout', baseSprite: 'rune_glacier_dwarf_archer', baseSpriteGenre: 'steampunk' },
            { id: 'adventurer' }
        ]
    };
    assert.deepStrictEqual(
        Sprites.resolveVocationSprite('guardian', classes),
        { id: 'iron_hill_giant_executioner', genre: null }
    );
    assert.deepStrictEqual(
        Sprites.resolveVocationSprite('Scout', classes),
        { id: 'rune_glacier_dwarf_archer', genre: 'steampunk' }
    );
    assert.deepStrictEqual(
        Sprites.resolveVocationSprite('adventurer', classes),
        { id: 'adventurer', genre: null }
    );
    assert.deepStrictEqual(
        Sprites.resolveVocationSprite('rat', classes),
        { id: 'rat', genre: null }
    );
    const playerArt = Sprites.entitySpriteCandidates(
        { look: 'guardian', vocation: 'guardian' },
        { classes: classes, genre: 'rpg_fantasy', player: true }
    );
    assert.deepStrictEqual(playerArt, [
        { id: 'iron_hill_giant_executioner', genre: 'rpg_fantasy' },
        { id: 'adventurer', genre: 'rpg_fantasy' }
    ]);
    const scoutArt = Sprites.entitySpriteCandidates(
        { look: 'scout' },
        { classes: classes, genre: 'rpg_fantasy', player: true }
    );
    assert.strictEqual(scoutArt[0].id, 'rune_glacier_dwarf_archer');
    assert.strictEqual(scoutArt[0].genre, 'steampunk');
    const mobArt = Sprites.entitySpriteCandidates(
        { look: 'rat' },
        { classes: classes, genre: 'rpg_fantasy', player: false }
    );
    assert.deepStrictEqual(mobArt, [{ id: 'rat', genre: 'rpg_fantasy' }]);
    const img = { naturalWidth: 48, naturalHeight: 32 };
    const a = Sprites.getCachedImageSize(img);
    assert.deepStrictEqual(a, { iw: 48, ih: 32 });
    img.naturalWidth = 1;
    img.naturalHeight = 1;
    const b = Sprites.getCachedImageSize(img);
    assert.deepStrictEqual(b, { iw: 48, ih: 32 }, 'size is cached on the drawable');
    console.log('ok sprites');
}

main();

