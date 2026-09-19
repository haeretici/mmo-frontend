'use strict';

const assert = require('assert');
const {
    request,
    startMockGame,
    readJsonBody,
    sendMock,
    withFrontend
} = require('./helpers');

async function main() {
    const SID = 'ab'.repeat(32);
    const chars = [];
    const mock = await startMockGame((req, res) => {
        const pathname = new URL(req.url || '/', 'http://local').pathname;
        const cookie = String(req.headers.cookie || '');
        const authed = cookie.includes('sid=' + SID);

        const route = async () => {
            if (pathname === '/ready') {
                sendMock(res, 200, { ok: true, db: true, tick: { running: true } });
                return;
            }
            if (pathname === '/v1/register' && req.method === 'POST') {
                await readJsonBody(req);
                sendMock(res, 201, { id: 1, email: 'user@example.com', status: 'active' }, {
                    'Set-Cookie': `sid=${SID}; HttpOnly; Path=/; SameSite=Lax`
                });
                return;
            }
            if (pathname === '/v1/login' && req.method === 'POST') {
                await readJsonBody(req);
                sendMock(res, 200, { id: 1, email: 'user@example.com', status: 'active' }, {
                    'Set-Cookie': `sid=${SID}; HttpOnly; Path=/; SameSite=Lax`
                });
                return;
            }
            if (pathname === '/v1/logout' && req.method === 'POST') {
                sendMock(res, 200, { ok: true }, {
                    'Set-Cookie': 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
                });
                return;
            }
            if (!authed && pathname.startsWith('/v1/')) {
                sendMock(res, 401, { error: 'unauthorized' });
                return;
            }
            if (pathname === '/v1/me') {
                sendMock(res, 200, { id: 1, email: 'user@example.com', status: 'active' });
                return;
            }
            if (pathname === '/v1/characters' && req.method === 'GET') {
                sendMock(res, 200, { characters: chars });
                return;
            }
            if (pathname === '/v1/characters' && req.method === 'POST') {
                const body = await readJsonBody(req);
                const ch = {
                    id: chars.length + 1,
                    name: body.name,
                    vocation: body.vocation,
                    level: 1,
                    hp: 185,
                    hpMax: 185,
                    lastLogout: null
                };
                chars.push(ch);
                sendMock(res, 201, ch);
                return;
            }
            if (pathname === '/v1/play' && req.method === 'POST') {
                const body = await readJsonBody(req);
                sendMock(res, 200, {
                    token: 'cd'.repeat(32),
                    expiresAt: new Date(Date.now() + 45000).toISOString(),
                    characterId: body.characterId
                });
                return;
            }
            sendMock(res, 404, { error: 'not_found' });
        };
        Promise.resolve(route()).catch(() => {
            if (!res.headersSent) sendMock(res, 500, { error: 'internal' });
        });
    });

    try {
        await withFrontend(async ({ port }) => {
            const home = await request(port, { method: 'GET', path: '/' });
            assert.strictEqual(home.status, 200);
            assert.ok(home.text.includes('Characters live on the server'));
            assert.ok(home.headers['content-security-policy'].includes("script-src 'self'"));

            const login = await request(port, { method: 'GET', path: '/login' });
            assert.strictEqual(login.status, 200);
            assert.ok(login.text.includes('id="login-form"'));

            const cfg = await request(port, { method: 'GET', path: '/client-config.json' });
            assert.strictEqual(cfg.status, 200);
            assert.strictEqual(cfg.json.apiBase, '');
            assert.ok(cfg.json.wsUrl.startsWith('ws://'));
            assert.ok(!JSON.stringify(cfg.json).includes('mysql'));
            assert.ok(cfg.json.vocations.includes('scout'));
            assert.strictEqual(cfg.json.mapId, 'firstlight_isle');

            const health = await request(port, { method: 'GET', path: '/health' });
            assert.strictEqual(health.status, 200);
            assert.strictEqual(health.json.site, true);

            const ready = await request(port, { method: 'GET', path: '/ready' });
            assert.strictEqual(ready.status, 200);
            assert.strictEqual(ready.json.ok, true);

            const eq = await request(port, { method: 'GET', path: '/content/equipment.json' });
            assert.strictEqual(eq.status, 200);
            assert.ok(eq.headers['content-type'].includes('application/json'));
            assert.ok(Array.isArray(eq.json.items));
            assert.ok(eq.json.items.some((it) => it.id === 'iron_longsword'));

            const spellsUi = await request(port, { method: 'GET', path: '/content/spells-ui.json' });
            assert.strictEqual(spellsUi.status, 200);
            assert.ok(Array.isArray(spellsUi.json.spells));
            const jab = spellsUi.json.spells.find((s) => s.id === 'snap_jab');
            assert.ok(jab, 'spells-ui has snap_jab');
            assert.strictEqual(jab.cooldowns.primary.attack, 2);
            const patch = spellsUi.json.spells.find((s) => s.id === 'magic_patch');
            assert.ok(patch, 'spells-ui has magic_patch');
            assert.strictEqual(patch.selfTarget, true);
            assert.strictEqual(patch.kind, 'heal');
            const light = spellsUi.json.spells.find((s) => s.id === 'heal_light');
            assert.ok(light);
            assert.strictEqual(light.selfTarget, true);
            const friend = spellsUi.json.spells.find((s) => s.id === 'heal_friend');
            assert.ok(friend);
            assert.strictEqual(friend.allowOnSelf, false);
            assert.notStrictEqual(friend.selfTarget, true);
            assert.strictEqual(jab.powerCurve, undefined);
            assert.strictEqual(jab.basePower, undefined);
            assert.strictEqual(jab.damageAmplitude, undefined);
            const uiText = JSON.stringify(spellsUi.json);
            assert.ok(!uiText.includes('powerCurve'));
            assert.ok(!uiText.includes('basePower'));
            assert.ok(!uiText.includes('damageAmplitude'));

            const classesUi = await request(port, { method: 'GET', path: '/content/classes-ui.json' });
            assert.strictEqual(classesUi.status, 200);
            assert.ok(Array.isArray(classesUi.json.classes));
            const mystic = classesUi.json.classes.find((c) => c.id === 'mystic');
            assert.ok(mystic, 'classes-ui has mystic');
            assert.strictEqual(mystic.spells[0], 'snap_jab');
            assert.strictEqual(mystic.critChance, undefined);
            assert.strictEqual(mystic.baseHp, undefined);
            const classText = JSON.stringify(classesUi.json);
            assert.ok(!classText.includes('critChance'));
            assert.ok(!classText.includes('baseHp'));

            const wsHttp = await request(port, { method: 'GET', path: '/v1/ws' });
            assert.strictEqual(wsHttp.status, 404);

            const escape = await request(port, { method: 'GET', path: '/css/../../config/settings.json' });
            assert.strictEqual(escape.status, 404);

            const reg = await request(port, {
                method: 'POST',
                path: '/v1/register',
                body: { email: 'user@example.com', password: 'correct-horse' }
            });
            assert.strictEqual(reg.status, 201);
            assert.strictEqual(reg.json.email, 'user@example.com');
            assert.ok(reg.sid && reg.sid.length === 64);
            const cookie = `sid=${reg.sid}`;

            const me = await request(port, { method: 'GET', path: '/v1/me', cookie });
            assert.strictEqual(me.status, 200);
            assert.strictEqual(me.json.email, 'user@example.com');

            const created = await request(port, {
                method: 'POST',
                path: '/v1/characters',
                cookie,
                body: { name: 'Ash', vocation: 'scout' }
            });
            assert.strictEqual(created.status, 201);
            assert.strictEqual(created.json.name, 'Ash');

            const list = await request(port, { method: 'GET', path: '/v1/characters', cookie });
            assert.strictEqual(list.json.characters.length, 1);

            const play = await request(port, {
                method: 'POST',
                path: '/v1/play',
                cookie,
                body: { characterId: created.json.id }
            });
            assert.strictEqual(play.status, 200);
            assert.ok(/^[0-9a-f]{64}$/i.test(play.json.token));

            const visual = await request(port, {
                method: 'GET',
                path: '/visual?map=firstlight_isle&z=6&x=64&y=116&w=32&h=32'
            });
            assert.strictEqual(visual.status, 200, visual.text.slice(0, 200));
            assert.strictEqual(visual.json.ok, true);
            assert.strictEqual(visual.json.present, true);
            assert.strictEqual(visual.json.width, 32);
            assert.strictEqual(visual.json.height, 32);
            assert.ok(!Object.prototype.hasOwnProperty.call(visual.json, 'spawns'));
            assert.ok(!JSON.stringify(visual.json).includes('creatureId'));
            const layerBytes = Buffer.from(visual.json.layers.ground, 'base64').length;
            assert.strictEqual(layerBytes, 32 * 32 * 2);
            assert.ok(visual.raw.length < 400000, 'floor window, not the continent');

            const tooBig = await request(port, {
                method: 'GET',
                path: '/visual?map=firstlight_isle&z=6&x=0&y=0&w=200&h=200'
            });
            assert.strictEqual(tooBig.status, 400);

            const mapsLeak = await request(port, {
                method: 'GET',
                path: '/maps/firstlight_isle/hybrid/floor-06/map.json'
            });
            assert.strictEqual(mapsLeak.status, 404);

            const kitLeak = await request(port, { method: 'GET', path: '/pack/creatures/rat.json' });
            assert.strictEqual(kitLeak.status, 404);

            const sprite = await request(port, {
                method: 'GET',
                path: '/sprites/rpg_fantasy/creatures/icon/Rat.png'
            });
            assert.strictEqual(sprite.status, 200);
            assert.ok(String(sprite.headers['content-type'] || '').includes('image/png'));
            assert.strictEqual(sprite.raw[0], 0x89);

            const escapeSprite = await request(port, {
                method: 'GET',
                path: '/sprites/../../pack.json'
            });
            assert.strictEqual(escapeSprite.status, 404);

            const playPage = await request(port, { method: 'GET', path: '/play' });
            assert.strictEqual(playPage.status, 200);
            assert.ok(playPage.text.includes('id="world"'));
            assert.ok(playPage.text.includes('play.js'));
            assert.ok(playPage.text.includes('play-shell'));
            assert.ok(playPage.text.includes('mouse_dispatcher.js'));
            assert.ok(playPage.text.includes('id="activeEquipmentCard"'));
            assert.ok(!playPage.text.includes('id="huntSelect"'));
            assert.ok(!playPage.text.includes('HuntDLClientDB') || playPage.text.includes('No character IndexedDB'));

            assert.ok(home.text.includes('menu-item active" href="/"'));
            assert.ok(playPage.text.includes('menu-item active" href="/play"'));

            const accountPage = await request(port, { method: 'GET', path: '/account' });
            assert.strictEqual(accountPage.status, 200);
            assert.ok(accountPage.text.includes('menu-item active" href="/account"'));

            const registerPage = await request(port, { method: 'GET', path: '/register' });
            assert.strictEqual(registerPage.status, 200);
            assert.ok(registerPage.text.includes('id="register-form"'));

            const wiki = await request(port, { method: 'GET', path: '/wiki' });
            assert.strictEqual(wiki.status, 200);
            assert.ok(wiki.text.includes('menu-item active" href="/wiki"'));
            assert.ok(wiki.text.includes('guardian'));
        }, { gameOrigin: mock.origin });
    } finally {
        await mock.close();
    }

    const down = await startMockGame((req, res) => {
        req.resume();
        res.destroy();
    });
    try {
        await withFrontend(async ({ port }) => {
            const ready = await request(port, { method: 'GET', path: '/ready' });
            assert.strictEqual(ready.status, 503);
            const boom = await request(port, {
                method: 'POST',
                path: '/v1/login',
                body: { email: 'a@b.co', password: 'correct-horse' }
            });
            assert.ok(boom.status === 502 || boom.status === 504);
        }, { gameOrigin: down.origin });
    } finally {
        await down.close();
    }

    console.log('ok site_http');
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
