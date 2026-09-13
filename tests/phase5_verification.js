'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const PROTOCOL_JS = path.join(FRONTEND_ROOT, 'static/js/protocol.js');
const PLAY_JS = path.join(FRONTEND_ROOT, 'static/js/play.js');
const SPRITES_JS = path.join(FRONTEND_ROOT, 'static/js/sprites.js');
const APP_CSS = path.join(FRONTEND_ROOT, 'static/css/app.css');
const SERVER_DIR = path.join(FRONTEND_ROOT, '../server');

const feProto = require(PROTOCOL_JS);
const Sprites = require(SPRITES_JS);

function testTopMenuIndicators() {
    const staticDir = path.join(FRONTEND_ROOT, 'static');
    const pages = [
        { file: 'index.html', activeNav: '/', label: 'Home' },
        { file: 'account.html', activeNav: '/account', label: 'Characters' },
        { file: 'play.html', activeNav: '/play', label: 'Play' },
        { file: 'wiki.html', activeNav: '/wiki', label: 'Wiki' },
        { file: 'login.html', activeNav: null, activeAction: '/login' },
        { file: 'register.html', activeNav: null, activeAction: '/register' }
    ];

    pages.forEach((p) => {
        const filePath = path.join(staticDir, p.file);
        assert.ok(fs.existsSync(filePath), `file exists: ${p.file}`);
        const content = fs.readFileSync(filePath, 'utf8');

        // Header bar structure
        assert.ok(content.includes('class="editor-header-bar"'), `${p.file} has editor-header-bar`);
        assert.ok(content.includes('class="brand"'), `${p.file} has brand`);
        assert.ok(content.includes('fa-dragon'), `${p.file} has brand icon`);
        assert.ok(content.includes('class="menu-items"'), `${p.file} has menu-items`);

        // Menu items present
        assert.ok(content.includes('href="/"'), `${p.file} links Home`);
        assert.ok(content.includes('href="/account"'), `${p.file} links Characters`);
        assert.ok(content.includes('href="/play"'), `${p.file} links Play`);
        assert.ok(content.includes('href="/wiki"'), `${p.file} links Wiki`);

        // Extract menu-items block
        const menuMatch = content.match(/<nav class="menu-items">([\s\S]*?)<\/nav>/);
        assert.ok(menuMatch, `${p.file} has <nav class="menu-items">`);
        const navBlock = menuMatch[1];

        // Match active items in menu
        const activeMatches = [...navBlock.matchAll(/class="menu-item active"[^>]*href="([^"]+)"/g)];

        if (p.activeNav) {
            assert.strictEqual(activeMatches.length, 1, `${p.file} must have exactly one active menu-item`);
            assert.strictEqual(activeMatches[0][1], p.activeNav, `${p.file} active menu-item matches ${p.activeNav}`);
            assert.ok(navBlock.includes(`href="${p.activeNav}" aria-current="page"`), `${p.file} has aria-current="page" on active item`);
        } else {
            assert.strictEqual(activeMatches.length, 0, `${p.file} must have 0 active items in main menu`);
            if (p.activeAction) {
                assert.ok(
                    content.includes(`href="${p.activeAction}" class="btn btn-retro btn-primary btn-sm active"`),
                    `${p.file} has active action button for ${p.activeAction}`
                );
            }
        }
    });

    // Verify CSS styles active state
    assert.ok(fs.existsSync(APP_CSS), 'app.css exists');
    const css = fs.readFileSync(APP_CSS, 'utf8');
    assert.ok(css.includes('.menu-item.active'), 'app.css styles .menu-item.active');
    console.log('  ok phase 5: top menu active indicators across all pages');
}

function testResponsiveAndFullscreen() {
    const playHtml = fs.readFileSync(path.join(FRONTEND_ROOT, 'static/play.html'), 'utf8');
    const playJs = fs.readFileSync(PLAY_JS, 'utf8');
    const css = fs.readFileSync(APP_CSS, 'utf8');

    // Layout containers
    assert.ok(playHtml.includes('editor-app-container'), 'play.html has editor-app-container');
    assert.ok(playHtml.includes('editor-workspace--split'), 'play.html has editor-workspace--split');
    assert.ok(playHtml.includes('play-shell'), 'play.html has play-shell');
    assert.ok(playHtml.includes('game-sidebar'), 'play.html has game-sidebar');
    assert.ok(playHtml.includes('game-main'), 'play.html has game-main');
    assert.ok(playHtml.includes('play-inventory'), 'play.html has play-inventory');

    // Action bar dock wrappers
    assert.ok(playHtml.includes('id="actionBarDockTop"'), 'play.html has actionBarDockTop');
    assert.ok(playHtml.includes('id="actionBarDockBottom"'), 'play.html has actionBarDockBottom');
    assert.ok(playHtml.includes('id="actionBarDockLeft"'), 'play.html has actionBarDockLeft');
    assert.ok(playHtml.includes('id="actionBarDockRight"'), 'play.html has actionBarDockRight');

    // Fullscreen elements
    assert.ok(playHtml.includes('id="fullscreen-btn"'), 'play.html has fullscreen-btn');
    assert.ok(playHtml.includes('id="enterFullscreenIcon"'), 'play.html has enterFullscreenIcon');
    assert.ok(playHtml.includes('id="exitFullscreenIcon"'), 'play.html has exitFullscreenIcon');

    // Fullscreen JS handling
    assert.ok(playJs.includes('fullscreen-btn'), 'play.js handles fullscreen-btn');
    assert.ok(playJs.includes('requestFullscreen'), 'play.js calls requestFullscreen');
    assert.ok(playJs.includes('exitFullscreen'), 'play.js calls exitFullscreen');
    assert.ok(playJs.includes('fullscreenchange'), 'play.js listens to fullscreenchange');
    assert.ok(playJs.includes('enterFullscreenIcon'), 'play.js toggles enterFullscreenIcon');
    assert.ok(playJs.includes('exitFullscreenIcon'), 'play.js toggles exitFullscreenIcon');

    // CSS Fullscreen & Responsive
    assert.ok(css.includes(':fullscreen'), 'app.css has :fullscreen container rules');
    assert.ok(css.includes('@media'), 'app.css has responsive @media rules');
    assert.ok(css.includes('.play-shell'), 'app.css styles .play-shell');

    console.log('  ok phase 5: responsive layout & fullscreen toggle behavior');
}

function testInventoryActions() {
    const playJs = fs.readFileSync(PLAY_JS, 'utf8');

    // Opcode definitions
    assert.strictEqual(feProto.C2S.EQUIP, 40, 'C2S.EQUIP is 40');
    assert.strictEqual(feProto.C2S.UNEQUIP, 41, 'C2S.UNEQUIP is 41');
    assert.strictEqual(feProto.C2S.MOVE_ITEM, 42, 'C2S.MOVE_ITEM is 42');
    assert.strictEqual(feProto.C2S.USE_ITEM, 43, 'C2S.USE_ITEM is 43');
    assert.strictEqual(feProto.C2S.OPEN_BAG, 44, 'C2S.OPEN_BAG is 44');

    // Server-side decoders parity (if server exists)
    const serverMessagesPath = path.join(SERVER_DIR, 'src/protocol/messages.js');
    let serverMessages = null;
    if (fs.existsSync(serverMessagesPath)) {
        serverMessages = require(serverMessagesPath);
    }

    // 1. Equipping Action
    const equipPayload = feProto.encodeEquip('root', 3, 'shield');
    assert.ok(equipPayload instanceof Uint8Array, 'encodeEquip returns Uint8Array');
    if (serverMessages) {
        const decodedEquip = serverMessages.decodeEquip(equipPayload);
        assert.strictEqual(decodedEquip.containerId, 'root');
        assert.strictEqual(decodedEquip.index, 3);
        assert.strictEqual(decodedEquip.slot, 'shield');
    }
    assert.ok(playJs.includes('C2S.EQUIP'), 'play.js dispatches C2S.EQUIP');
    assert.ok(playJs.includes('encodeEquip'), 'play.js uses encodeEquip');

    // 2. Unequipping Action
    const unequipPayload = feProto.encodeUnequip('head');
    assert.ok(unequipPayload instanceof Uint8Array, 'encodeUnequip returns Uint8Array');
    if (serverMessages) {
        const decodedUnequip = serverMessages.decodeUnequip(unequipPayload);
        assert.strictEqual(decodedUnequip, 'head');
    }
    assert.ok(playJs.includes('C2S.UNEQUIP'), 'play.js dispatches C2S.UNEQUIP');
    assert.ok(playJs.includes('encodeUnequip'), 'play.js uses encodeUnequip');

    // 3. Using Consumables Action
    const usePayload = feProto.encodeContainerSlot('root', 2);
    assert.ok(usePayload instanceof Uint8Array, 'encodeContainerSlot returns Uint8Array');
    if (serverMessages) {
        const decodedUse = serverMessages.decodeContainerSlot(usePayload);
        assert.strictEqual(decodedUse.containerId, 'root');
        assert.strictEqual(decodedUse.index, 2);
    }
    assert.ok(playJs.includes('C2S.USE_ITEM'), 'play.js dispatches C2S.USE_ITEM');

    // 4. Opening Nested Bags Action
    const openBagPayload = feProto.encodeContainerSlot('bag-sub-1', 0);
    assert.ok(openBagPayload instanceof Uint8Array, 'encodeContainerSlot for open bag');
    if (serverMessages) {
        const decodedOpen = serverMessages.decodeContainerSlot(openBagPayload);
        assert.strictEqual(decodedOpen.containerId, 'bag-sub-1');
        assert.strictEqual(decodedOpen.index, 0);
    }
    assert.ok(playJs.includes('C2S.OPEN_BAG'), 'play.js dispatches C2S.OPEN_BAG');
    assert.ok(playJs.includes('openBagPanel'), 'play.js manages openBagPanel');
    assert.ok(playJs.includes('openBagCount'), 'play.js updates openBagCount');
    assert.ok(playJs.includes('openBagClose'), 'play.js wires openBagClose');

    // 5. Moving Items Action
    // Container to Container
    const moveC2C = feProto.encodeMoveItem(
        { kind: 'container', containerUid: 'root', index: 1 },
        { kind: 'container', containerUid: 'root', index: 5 },
        2
    );
    assert.ok(moveC2C instanceof Uint8Array, 'encodeMoveItem returns Uint8Array');
    if (serverMessages) {
        const decodedMove = serverMessages.decodeMoveItem(moveC2C);
        assert.strictEqual(decodedMove.from.kind, 'container');
        assert.strictEqual(decodedMove.from.containerUid, 'root');
        assert.strictEqual(decodedMove.from.index, 1);
        assert.strictEqual(decodedMove.to.kind, 'container');
        assert.strictEqual(decodedMove.to.containerUid, 'root');
        assert.strictEqual(decodedMove.to.index, 5);
        assert.strictEqual(decodedMove.count, 2);
    }

    // Equipment to Equipment
    const moveE2E = feProto.encodeMoveItem(
        { kind: 'equipment', slot: 'weapon' },
        { kind: 'equipment', slot: 'shield' },
        1
    );
    if (serverMessages) {
        const decodedE2E = serverMessages.decodeMoveItem(moveE2E);
        assert.strictEqual(decodedE2E.from.kind, 'equipment');
        assert.strictEqual(decodedE2E.from.slot, 'weapon');
        assert.strictEqual(decodedE2E.to.kind, 'equipment');
        assert.strictEqual(decodedE2E.to.slot, 'shield');
    }
    assert.ok(playJs.includes('C2S.MOVE_ITEM'), 'play.js dispatches C2S.MOVE_ITEM');
    assert.ok(playJs.includes('encodeMoveItem'), 'play.js uses encodeMoveItem');

    // 6. Tooltips & Sprites
    const swordSprite = Sprites.resolveItemSpriteUrl('iron_longsword', 'rpg_fantasy');
    assert.strictEqual(swordSprite, '/sprites/rpg_fantasy/equipment/alpha/Iron_Longsword.png');

    const shieldSprite = Sprites.resolveItemSpriteUrl({ id: 'oak_shield' });
    assert.strictEqual(shieldSprite, '/sprites/rpg_fantasy/equipment/alpha/Oak_Shield.png');

    assert.ok(playJs.includes('formatItemTooltip'), 'play.js defines formatItemTooltip');
    assert.ok(playJs.includes('resolveItemSpriteUrl'), 'play.js defines resolveItemSpriteUrl');
    assert.ok(playJs.includes('SLOT_PLACEHOLDERS'), 'play.js defines SLOT_PLACEHOLDERS');
    assert.ok(playJs.includes('fa-helmet-safety'), 'play.js includes helmet placeholder icon');
    assert.ok(playJs.includes('fa-shoe-prints'), 'play.js includes boots placeholder icon');

    console.log('  ok phase 5: inventory actions (equip, unequip, use, open bag, move, tooltips, sprites)');
}

function main() {
    console.log('Starting Phase 5: Verification & Quality Gate:');
    testTopMenuIndicators();
    testResponsiveAndFullscreen();
    testInventoryActions();
    console.log('ok phase5_verification');
}

main();
