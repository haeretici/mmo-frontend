'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FRONTEND_ROOT = path.resolve(__dirname, '..');

function walk(dir, acc) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p, acc);
        else acc.push(p);
    }
    return acc;
}

function main() {
    const staticRoot = path.join(FRONTEND_ROOT, 'static');
    const files = walk(staticRoot, []);
    const html = files.filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(f, 'utf8'));
    const js = files.filter((f) => f.endsWith('.js')).map((f) => ({
        name: path.relative(staticRoot, f).replace(/\\/g, '/'),
        text: fs.readFileSync(f, 'utf8')
    }));
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    assert.ok(html.some((t) => t.includes('id="login-form"')));
    assert.ok(html.some((t) => t.includes('id="register-form"')));
    assert.ok(html.some((t) => t.includes('id="create-form"')));
    assert.ok(html.some((t) => t.includes('id="char-name"')));
    assert.ok(html.some((t) => t.includes('id="world"')));
    assert.ok(!html.some((t) => /id="name"/.test(t)));

    const prefs = js.find((f) => f.name === 'js/prefs.js');
    assert.ok(prefs, 'prefs.js');
    assert.ok(prefs.text.includes('deleteDatabase(LEGACY_CHAR_DB)') || prefs.text.includes("deleteDatabase('HuntDLClientDB')"));
    assert.ok(prefs.text.includes('HuntDLClientDB'));
    assert.ok(!/indexedDB\.open\s*\(/.test(prefs.text));
    assert.ok(!/createObjectStore/.test(all));
    assert.ok(!/indexedDB\.open\s*\(/.test(all));

    assert.ok(prefs.text.includes('engine.lastEmail'));
    assert.ok(prefs.text.includes('engine.playHandoff'));
    assert.ok(prefs.text.includes('sessionStorage'));
    assert.ok(!/localStorage\.setItem\([^)]*password/i.test(all));
    assert.ok(!/location\.search/.test(all));
    assert.ok(!/\?token=/.test(all));
    assert.ok(!/window\.name/.test(all));

    const account = js.find((f) => f.name === 'js/account.js');
    assert.ok(account);
    assert.ok(account.text.includes("location.href = '/play'"));
    assert.ok(account.text.includes('writePlayHandoff'));
    assert.ok(!account.text.includes('indexedDB'));

    const play = js.find((f) => f.name === 'js/play.js');
    assert.ok(play);
    assert.ok(play.text.includes('takePlayHandoff'));
    assert.ok(play.text.includes('processMouseAction'));
    assert.ok(play.text.includes('START_AUTOWALK'));
    assert.ok(play.text.includes('EngineVisual'));
    const visualJs = js.find((f) => f.name === 'js/visual_map.js');
    assert.ok(visualJs);
    assert.ok(visualJs.text.includes('/visual'));
    assert.ok(!/localStorage/.test(play.text));
    assert.ok(!/indexedDB/.test(play.text));
    assert.ok(!/Hunt Simulator/.test(play.text));
    assert.ok(!/huntSelect/.test(play.text));
    assert.ok(!/seedInput/.test(play.text));

    const playHtml = html.find((t) => t.includes('id="world"') && t.includes('play-shell'));
    assert.ok(playHtml, 'play three-column shell');
    assert.ok(playHtml.includes('id="activeEquipmentCard"'));
    assert.ok(playHtml.includes('id="backpackGrid"'));
    assert.ok(playHtml.includes('id="combatCreaturesList"'));
    assert.ok(playHtml.includes('id="skillsPanelList"'));
    assert.ok(playHtml.includes('visual_map.js'));
    assert.ok(playHtml.includes('tile_draw.js'));
    assert.ok(playHtml.includes('keyboard_walk.js'));
    assert.ok(playHtml.includes('entity_hud.js'));
    assert.ok(play.text.includes('EngineEntityHud'));
    assert.ok(playHtml.includes('ground_renderer.js'));
    assert.ok(play.text.includes('EngineGroundRenderer'));
    assert.ok(playHtml.includes('sprite_presentation.js'));
    assert.ok(play.text.includes('EngineSpritePresentation'));
    assert.ok(playHtml.includes('combat_fx.js'));
    assert.ok(play.text.includes('EngineCombatFx'));
    const keyWalkJs = js.find((f) => f.name === 'js/keyboard_walk.js');
    assert.ok(keyWalkJs);
    assert.ok(keyWalkJs.text.includes('AUTO_REPEAT_DELAY_MS'));
    assert.ok(play.text.includes('keyWalk.keyDown'));
    assert.ok(play.text.includes("addEventListener('keyup'"));
    assert.ok(playHtml.includes('id="npc-dialog"'));
    assert.ok(playHtml.includes('id="death-overlay"'));
    assert.ok(playHtml.includes('value="1" selected'));
    assert.ok(!playHtml.includes('id="huntSelect"'));
    assert.ok(!playHtml.includes('id="seedInput"'));
    assert.ok(!playHtml.includes('id="playBtn"'));

    const mouseJs = js.find((f) => f.name === 'js/mouse_dispatcher.js');
    assert.ok(mouseJs);
    assert.ok(mouseJs.text.includes('processMouseAction'));

    const prefsMouse = prefs.text.includes('engine.mouseControls');
    assert.ok(prefsMouse);

    // Phase 2: Top Menu & Global Shell Parity
    html.forEach((page) => {
        assert.ok(page.includes('class="editor-header-bar"'), 'has editor-header-bar');
        assert.ok(page.includes('class="brand"'), 'has brand');
        assert.ok(page.includes('fa-dragon'), 'has dragon brand icon');
        assert.ok(page.includes('class="menu-items"'), 'has menu-items');
    });

    assert.ok(playHtml.includes('editor-app-container'), 'play has editor-app-container');
    assert.ok(playHtml.includes('editor-workspace--split'), 'play has editor-workspace--split');
    assert.ok(playHtml.includes('id="sessionStateBadge"'), 'play has sessionStateBadge');
    assert.ok(playHtml.includes('id="leave"'), 'play has leave button');

    const indexHtml = html.find((t) => t.includes('Characters live on the server'));
    assert.ok(indexHtml && indexHtml.includes('menu-item active" href="/"'), 'index has active Home nav');

    const accountHtml = html.find((t) => t.includes('id="char-list"'));
    assert.ok(accountHtml && accountHtml.includes('menu-item active" href="/account"'), 'account has active Characters nav');
    assert.ok(accountHtml && accountHtml.includes('id="sessionStateBadge"'), 'account has sessionStateBadge');

    const wiki = html.find((t) => t.includes('Village notes'));
    assert.ok(wiki);
    assert.ok(!/loot\s*%/i.test(wiki));
    assert.ok(!/\(6,\s*12\)/.test(wiki));
    assert.ok(wiki.includes('menu-item active" href="/wiki"'), 'wiki has active Wiki nav');
    assert.ok(playHtml.includes('menu-item active" href="/play"'), 'play has active Play nav');

    // Phase 3: Sidebar, Telemetry & Panel Component Upgrades
    assert.ok(playHtml.includes('am-sidebar-section'), 'play has am-sidebar-section');
    assert.ok(playHtml.includes('label-retro'), 'play has label-retro');
    assert.ok(playHtml.includes('game-stat-value'), 'play has game-stat-value');
    assert.ok(playHtml.includes('card-retro'), 'play has card-retro');
    assert.ok(playHtml.includes('action-bars-layout'), 'play has action-bars-layout');
    assert.ok(playHtml.includes('actionBarDockTop'), 'play has actionBarDockTop');
    assert.ok(playHtml.includes('actionBarDockBottom'), 'play has actionBarDockBottom');
    assert.ok(playHtml.includes('enterFullscreenIcon'), 'play has enterFullscreenIcon');
    assert.ok(playHtml.includes('exitFullscreenIcon'), 'play has exitFullscreenIcon');
    assert.ok(playHtml.includes('game-live-section'), 'play has game-live-section');
    assert.ok(playHtml.includes('game-live-tile'), 'play has game-live-tile');
    assert.ok(playHtml.includes('combatSortDropdown'), 'play has combatSortDropdown');
    assert.ok(playHtml.includes('skills-panel-scroll'), 'play has skills-panel-scroll');
    assert.ok(playHtml.includes('panel-collapsible-section'), 'play has panel-collapsible-section');
    assert.ok(play.text.includes('entity-list-hp-bar-fill'), 'play.js has entity-list-hp-bar-fill');
    assert.ok(play.text.includes('skills-panel-grid'), 'play.js has skills-panel-grid');
    assert.ok(play.text.includes('renderCombatList'), 'play.js has renderCombatList');
    assert.ok(play.text.includes('initCollapsiblePanels'), 'play.js has initCollapsiblePanels');
    assert.ok(prefs.text.includes('engine.sidebarPanels'), 'prefs.js has engine.sidebarPanels');

    // Phase 4: Functional & Visual Inventory Engine
    assert.ok(playHtml.includes('id="sidebarPanelToggles"'), 'play has sidebarPanelToggles');
    assert.ok(playHtml.includes('id="toggleBackpackBtn"'), 'play has toggleBackpackBtn');
    assert.ok(playHtml.includes('id="toggleCombatBtn"'), 'play has toggleCombatBtn');
    assert.ok(playHtml.includes('id="toggleSkillsBtn"'), 'play has toggleSkillsBtn');
    assert.ok(playHtml.includes('id="activeEqStatusBar"'), 'play has activeEqStatusBar');
    assert.ok(playHtml.includes('fa-helmet-safety'), 'play has fontawesome helmet icon');
    assert.ok(playHtml.includes('fa-shoe-prints'), 'play has fontawesome boots icon');
    assert.ok(playHtml.includes('backpack-slot inv-slot'), 'play has pre-rendered backpack-slot inv-slot');
    assert.ok(playHtml.includes('id="openBagCount"'), 'play has openBagCount');
    assert.ok(play.text.includes('resolveItemSpriteUrl'), 'play.js has resolveItemSpriteUrl');
    assert.ok(play.text.includes('formatItemTooltip'), 'play.js has formatItemTooltip');
    assert.ok(play.text.includes('encodeMoveItem'), 'play.js has encodeMoveItem');
    assert.ok(play.text.includes('initSidebarPanels'), 'play.js has initSidebarPanels');
    assert.ok(play.text.includes('openSidebarPanel'), 'play.js has openSidebarPanel');
    assert.ok(play.text.includes('onEquipDrop'), 'play.js has onEquipDrop');
    assert.ok(play.text.includes('onContainerDrop'), 'play.js has onContainerDrop');

    console.log('ok static_pages');
}

main();
