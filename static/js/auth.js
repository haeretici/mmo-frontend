'use strict';

function fillEmailField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const last = getLastEmail();
    if (last && !el.value) el.value = last;
}

function onRegister() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const confirmEl = document.getElementById('password-confirm');
    const status = document.getElementById('status');
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (password !== confirmEl.value) {
        setStatus(status, 'Passwords do not match.', 'err');
        return;
    }
    setStatus(status, 'Creating account…');
    api('POST', '/v1/register', { email: email, password: password })
        .then(function () {
            setLastEmail(email);
            location.href = '/account';
        })
        .catch(function (e) {
            setStatus(status, e.message, 'err');
        });
}

function onLogin() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const status = document.getElementById('status');
    const email = emailEl.value.trim();
    setStatus(status, 'Signing in…');
    api('POST', '/v1/login', { email: email, password: passEl.value })
        .then(function () {
            setLastEmail(email);
            location.href = '/account';
        })
        .catch(function (e) {
            setStatus(status, e.message, 'err');
        });
}

function onLogout(ev) {
    if (ev) ev.preventDefault();
    api('POST', '/v1/logout', {})
        .then(function () { location.href = '/'; })
        .catch(function () { location.href = '/'; });
}

document.addEventListener('DOMContentLoaded', function () {
    fillEmailField('email');
    const reg = document.getElementById('register-form');
    if (reg) {
        reg.addEventListener('submit', function (ev) {
            ev.preventDefault();
            onRegister();
        });
    }
    const login = document.getElementById('login-form');
    if (login) {
        login.addEventListener('submit', function (ev) {
            ev.preventDefault();
            onLogin();
        });
    }
    const out = document.getElementById('logout-link');
    if (out) out.addEventListener('click', onLogout);
});
