'use strict';

document.addEventListener('DOMContentLoaded', function () {
    const actions = document.getElementById('home-actions');
    if (!actions) return;
    api('GET', '/v1/me')
        .then(function (me) {
            actions.innerHTML = '';
            const a = document.createElement('a');
            a.className = 'btn';
            a.href = '/account';
            a.textContent = 'Continue as ' + me.email;
            actions.appendChild(a);
        })
        .catch(function () {
            /* anonymous CTA already in HTML */
        });
});
