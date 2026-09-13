'use strict';

const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const PHP_BIN = process.env.PHP_BIN || 'php';

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const port = s.address().port;
            s.close((err) => (err ? reject(err) : resolve(port)));
        });
    });
}

function waitHealth(port, timeoutMs) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const once = () => {
            const req = http.get({
                hostname: '127.0.0.1',
                port,
                path: '/health',
                timeout: 400
            }, (res) => {
                res.resume();
                if (res.statusCode === 200) {
                    resolve();
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    reject(new Error('php health status ' + res.statusCode));
                    return;
                }
                setTimeout(once, 40);
            });
            req.on('timeout', () => {
                req.destroy();
                if (Date.now() - start > timeoutMs) reject(new Error('php -S timeout'));
                else setTimeout(once, 40);
            });
            req.on('error', () => {
                if (Date.now() - start > timeoutMs) reject(new Error('php -S timeout'));
                else setTimeout(once, 40);
            });
        };
        once();
    });
}

function request(port, { method, path: urlPath, body, cookie }) {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const headers = { Accept: 'application/json' };
    if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = payload.length;
    }
    if (cookie) headers.Cookie = cookie;
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: urlPath,
            headers
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks);
                const text = raw.toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch { /* ignore */ }
                const setCookie = res.headers['set-cookie'] && res.headers['set-cookie'][0];
                let sid = null;
                if (setCookie) {
                    const m = /sid=([0-9a-f]*)/i.exec(setCookie);
                    if (m) sid = m[1];
                }
                resolve({ status: res.statusCode, json, raw, text, setCookie, sid, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function startMockGame(handler) {
    const server = http.createServer(handler);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            const addr = server.address();
            resolve({
                port: addr.port,
                origin: `http://127.0.0.1:${addr.port}`,
                close() {
                    return new Promise((res, rej) => server.close((err) => (err ? rej(err) : res())));
                }
            });
        });
    });
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function sendMock(res, status, obj, extraHeaders) {
    const buf = Buffer.from(JSON.stringify(obj));
    const headers = Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': buf.length
    }, extraHeaders || {});
    res.writeHead(status, headers);
    res.end(buf);
}

async function startPhp(env) {
    const port = await freePort();
    const child = spawn(PHP_BIN, ['-S', `127.0.0.1:${port}`, 'index.php'], {
        cwd: FRONTEND_ROOT,
        env: Object.assign({}, process.env, env || {}, {
            FRONTEND_BIND: '127.0.0.1',
            FRONTEND_HTTP_PORT: String(port),
            FRONTEND_LOG_LEVEL: 'error'
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let err = '';
    child.stderr.on('data', (c) => { err += c.toString(); });
    try {
        await waitHealth(port, 8000);
    } catch (e) {
        child.kill('SIGKILL');
        throw new Error((e && e.message) + ' ' + err);
    }
    return {
        port,
        child,
        close() {
            return new Promise((resolve) => {
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
                setTimeout(() => {
                    try { child.kill('SIGKILL'); } catch { /* ignore */ }
                    resolve();
                }, 1000);
            });
        }
    };
}

async function withFrontend(fn, extra) {
    const env = {};
    if (extra && extra.gameOrigin) env.FRONTEND_GAME_ORIGIN = extra.gameOrigin;
    if (extra && extra.settings && extra.settings.gameOrigin) {
        env.FRONTEND_GAME_ORIGIN = extra.settings.gameOrigin;
    }
    const httpd = await startPhp(env);
    try {
        return await fn({ port: httpd.port });
    } finally {
        await httpd.close();
    }
}

module.exports = {
    request,
    startMockGame,
    readJsonBody,
    sendMock,
    withFrontend,
    FRONTEND_ROOT
};
