'use strict';

const ERROR_TEXT = {
    invalid_credentials: 'Invalid email or password.',
    locked: 'This account is locked. Try again later.',
    too_many_requests: 'Too many tries. Wait and retry.',
    conflict: 'That email or name is already taken.',
    unprocessable: 'Check the form and try again.',
    unauthorized: 'Please log in.',
    limit: 'Character limit reached.',
    forbidden: 'Not allowed.',
    not_found: 'Not found.',
    bad_gateway: 'The game server is not reachable.',
    gateway_timeout: 'The game server timed out.',
    payload_too_large: 'Request too large.'
};

let _cfg = null;

function loadConfig() {
    if (_cfg) return Promise.resolve(_cfg);
    return fetch('/client-config.json', { credentials: 'same-origin' })
        .then(function (r) {
            if (!r.ok) throw new Error('config');
            return r.json();
        })
        .then(function (cfg) {
            _cfg = cfg;
            return cfg;
        });
}

function humanError(code, fallback) {
    return ERROR_TEXT[code] || fallback || 'Something went wrong.';
}

function api(method, path, body) {
    return loadConfig().then(function (cfg) {
        const url = (cfg.apiBase || '') + path;
        const opts = {
            method: method,
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch(url, opts).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (json) {
                if (!r.ok) {
                    const err = new Error(humanError(json && json.error, 'error'));
                    err.status = r.status;
                    err.code = json && json.error;
                    throw err;
                }
                return json;
            });
        });
    });
}

function setStatus(el, msg, kind) {
    if (!el) return;
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.textContent = msg || '';
}
