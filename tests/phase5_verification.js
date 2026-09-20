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
    assert.ok(playHtml.includes('/js/action_bars.js'), 'play.html loads action_bars.js');
    assert.ok(playHtml.includes('/js/action_bar_assign.js'), 'play.html loads action_bar_assign.js');
    assert.ok(playHtml.includes('/js/inventory_mouse.js'), 'play.html loads inventory_mouse.js');
    assert.ok(playJs.includes('data-item-id') || playJs.includes('dataset.itemId'), 'play.js stamps data-item-id for assign pick');
    assert.ok(playJs.includes('tryHandleSlotDrop'), 'play.js drop fallback binds action-bar slots');
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

    // System FCT is canvas text over the player, not a flex HUD box.
    // #fct / death overlay the canvas; they must not sit beside it.
    assert.ok(/function fct\([\s\S]{0,500}CombatFx\.pushFct/.test(playJs), 'fct() uses canvas CombatFx');
    assert.ok(playJs.includes("color: '#f59e0b'"), 'fct() uses system-float color');
    assert.ok(/\.fct\{[^}]*position:absolute/.test(css), 'app.css overlays .fct');
    assert.ok(/\.death-overlay\{[^}]*position:absolute/.test(css), 'app.css overlays death-overlay');
    // RMB menu is HuntDL-style: position:fixed at the cursor, hosted on body.
    assert.ok(/\.ctx-menu\{[^}]*position:fixed/.test(css), 'app.css floats ctx-menu');
    assert.ok(playJs.includes('function placeCtxMenu'), 'play.js places ctx-menu at cursor');
    assert.ok(/function showInvMenu\([\s\S]{0,4000}placeCtxMenu\(el, clientX, clientY\)/.test(playJs), 'inventory RMB uses placeCtxMenu');
    assert.ok(/function showCanvasMenu\([\s\S]{0,4000}placeCtxMenu\(el, clientX, clientY\)/.test(playJs), 'canvas RMB uses placeCtxMenu');
    assert.ok(/function showEquipMenu\([\s\S]{0,4000}placeCtxMenu\(el, clientX, clientY\)/.test(playJs), 'equip RMB uses placeCtxMenu');
    assert.ok(playJs.includes('function placeCombatSortDropdown'), 'play.js places combat sort via placeCtxMenu');
    assert.ok(/function placeCombatSortDropdown\([\s\S]{0,600}placeCtxMenu\(el, r\.right, r\.bottom/.test(playJs), 'combat sort dropdown right-aligns then flips');
    assert.ok(/\.combat-sort-dropdown-menu\{[^}]*position:fixed/.test(css), 'combat sort dropdown is viewport-fixed');
    assert.ok(!playJs.includes('canvasOverlayRoot'), 'ctx-menu is not canvas-wrapper absolute');
    assert.ok(playJs.includes('suppressNextCanvasClick'), 'play.js defines suppressNextCanvasClick');
    assert.ok(playJs.includes('suppressNextDocClick'), 'play.js defines suppressNextDocClick');
    assert.ok(/buttonsDown\.left[\s\S]{0,120}suppressNextCanvasClick = true/.test(playJs), 'showCanvasMenu sets suppressNextCanvasClick when buttonsDown.left');
    assert.ok(/document\.addEventListener\('click'[\s\S]{0,120}if \(suppressNextDocClick\)/.test(playJs), 'document click listener checks suppressNextDocClick');
    assert.ok(playHtml.includes('id="ctx-menu"'), 'play.html has ctx-menu');
    assert.ok(!/canvas-center-wrapper[\s\S]{0,800}id="ctx-menu"/.test(playHtml), 'ctx-menu is not inside canvas-center-wrapper');

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
    assert.strictEqual(feProto.C2S.CLOSE_BAG, 45, 'C2S.CLOSE_BAG is 45');

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
    assert.ok(playJs.includes('inventoryFloatRoot'), 'play.js hosts bag floats in inventoryFloatRoot');
    assert.ok(playJs.includes('inv-float-panel'), 'play.js builds .inv-float-panel windows');
    assert.ok(playJs.includes('function focusOpenBagWindow'), 'second Open focuses the existing window');
    assert.ok(playJs.includes('function findExistingOpenBagUid'), 'one window per uid (equipment slot maps to instance)');
    assert.ok(playJs.includes('function placeNewFloat'), 'play.js places floats with the HuntDL algorithm');
    assert.ok(playJs.includes('function gridCapacity'), 'open-container grids use BAG capacity, not a 20-slot pad');
    assert.ok(!/Math\.max\(\s*20\s*,\s*\(view && view\.capacity\)/.test(playJs),
        'paintGrid does not force every container to 20 slots');
    {
        const m = playJs.match(/function gridCapacity\(view\) \{[\s\S]*?\n\}/);
        assert.ok(m, 'gridCapacity is a closed function');
        const gridCapacity = new Function('BACKPACK_SLOTS', m[0] + '\nreturn gridCapacity;')(20);
        assert.strictEqual(gridCapacity({ capacity: 6 }), 6, 'quiver-sized container stays 6 slots');
        assert.strictEqual(gridCapacity({ capacity: 12 }), 12, 'unicorn quiver stays 12 slots');
        assert.strictEqual(gridCapacity({ capacity: 32 }), 32, 'big bag is not capped at 20');
        assert.strictEqual(gridCapacity({ capacity: 0 }), 0, 'capacity 0 is a close signal, not 20 slots');
        assert.strictEqual(gridCapacity({ capacity: 20 }), 20, 'typical backpack is 20');
        assert.strictEqual(gridCapacity(null), 20, 'missing view falls back to backpack default');
    }
    assert.ok(playJs.includes('function openEquippedContainer'), 'play.js opens equipped containers');
    assert.ok(playJs.includes('function equipItemIsContainer'), 'play.js reads equipment container flags');
    assert.ok(playJs.includes('requestOpenBag(slotKey, 0'), 'OPEN_BAG from paperdoll uses designer slot');
    assert.ok(playJs.includes('C2S.CLOSE_BAG'), 'play.js dispatches C2S.CLOSE_BAG');
    assert.strictEqual(typeof feProto.encodeCloseBag, 'function', 'protocol.js encodes CLOSE_BAG str');
    assert.ok(playJs.includes('encodeCloseBag'), 'play.js uses encodeCloseBag');
    assert.ok(playJs.includes('function requestOpenBag'), 'play.js opens from parent containerId');
    assert.ok(playJs.includes('function requestCloseBag'), 'play.js close sends CLOSE_BAG');
    assert.ok(playJs.includes('getOpenBags:'), 'play.js exposes every open BAG view to action bars');
    assert.ok(playJs.includes('processInventoryAction'), 'play.js uses the inventory mouse matrix');
    assert.ok(playJs.includes('processCombatRowAction'), 'play.js uses the combat-list mouse matrix');
    assert.ok(playJs.includes('function showCombatMenu'), 'combat-list RMB is Attack/Look/Chase');
    assert.ok(playJs.includes('function enableAutoChaseAndTarget'), 'Chase menu item still enables the stance');
    assert.ok(playJs.includes('function chaseApproachRange'), 'chase stand-off is not weapon range');
    assert.ok(!playJs.includes('function chaseRange'), 'weapon-range chase helper is gone');
    assert.ok(playJs.includes('CHASE_APPROACH_RANGE'), 'chase uses path_walk adjacent stand-off');
    assert.ok(playJs.includes('isTypingTarget'), 'WASD ignores checkbox focus, not every INPUT');
    if (serverMessages) {
        assert.strictEqual(serverMessages.decodeCloseBag(feProto.encodeCloseBag('')), '');
        assert.strictEqual(serverMessages.decodeCloseBag(feProto.encodeCloseBag('i9')), 'i9');
    }
    assert.ok(!playJs.includes('cloneNode(true)'), 'nested bags no longer clone the sidebar panel');
    assert.ok(playJs.includes('itemLabel(rec.itemId)'), 'open bag title uses catalog label');
    assert.ok(!playJs.includes("kind === 'nested' ? 'open-bag'"), 'OPEN_BAG does not fall back to open-bag');
    assert.ok(!playJs.includes("kind === 'bag' ? 'root'") && !playJs.includes("kind === 'nested' ? 'open-bag' : 'root'"),
        'OPEN_BAG does not fall back to root/open-bag');

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
    assert.strictEqual(feProto.LOC_KIND.TILE, 2);
    assert.strictEqual(feProto.S2C.GROUND, 136);
    const moveTile = feProto.encodeMoveItem(
        { kind: 'tile', x: 8, y: 9, z: 0, stackIndex: 0 },
        { kind: 'container', containerUid: 'root', index: 0 },
        0
    );
    if (serverMessages) {
        const decodedTile = serverMessages.decodeMoveItem(moveTile);
        assert.strictEqual(decodedTile.from.kind, 'tile');
        assert.strictEqual(decodedTile.from.x, 8);
        assert.strictEqual(decodedTile.to.kind, 'container');
    }
    assert.ok(playJs.includes('S2C.GROUND'), 'play.js handles GROUND');
    assert.ok(playJs.includes('function sendPickup') || playJs.includes('sendPickup('), 'play.js pickup dest is backpack');
    assert.ok(playJs.includes('allowGroundLmbDrag'), 'play.js gates Smart ground drag');

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
    assert.ok(playJs.includes('function entityPresentPx'), 'HUD/sprite share bob+recoil origin');
    assert.ok(playJs.includes('function showItemPopover'), 'item popover from equipment.json');
    assert.ok(playJs.includes('function showStackSplitModal'), 'split-count drag modal');
    assert.ok(playJs.includes('function resolveStackMoveAmount'), 'split-count modifiers');
    assert.ok(playJs.includes('mouse.moveStack'), 'split drag reads moveStack pref');
    assert.ok(playJs.includes("('move-stack')"), 'play.js wires the moveStack checkbox');
    assert.ok(playJs.includes('function makeItemRow'), 'loot/shop rows use item sprites');
    assert.ok(playJs.includes("pin.kind === 'door' && (pin.flags & 1)"), 'closed door blocking bit matches server flags');

    const playHtml = fs.readFileSync(path.join(FRONTEND_ROOT, 'static/play.html'), 'utf8');
    assert.ok(playHtml.includes('id="item-popover"'), 'play.html has item-popover');
    assert.ok(playHtml.includes('id="move-stack"'), 'play.html has move-stack checkbox');
    const css = fs.readFileSync(APP_CSS, 'utf8');
    assert.ok(/\.item-popover\{[^}]*position:fixed/.test(css), 'item-popover is viewport-fixed');
    assert.ok(css.includes('.inv-stack-split-modal'), 'split modal CSS landed');
    assert.ok(css.includes('.inv-item-row'), 'loot/shop sprite row CSS landed');

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
