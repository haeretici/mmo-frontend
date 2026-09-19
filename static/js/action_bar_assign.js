'use strict';

/**
 * /play action-bar assign chrome (RMB menu + spell/object/text/multi/hotkey).
 * HuntDL analog is kernel/apps/game/action_bar_modals.js — do not copy that file.
 * Product slot schema: { i, k, t, id, m, text, multi }.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineActionBarAssign = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const TEXT_MAX_LEN = 255;
    const MULTI_DEPTH = 3;
    const VIEWPORT_PAD = 8;
    const BLOCKED_ALWAYS = Object.freeze({ ESCAPE: true, TAB: true });
    const BLOCKED_BARE = Object.freeze({
        ESCAPE: true,
        TAB: true,
        ENTER: true,
        ARROWUP: true,
        ARROWDOWN: true,
        ARROWLEFT: true,
        ARROWRIGHT: true,
        W: true,
        A: true,
        S: true,
        D: true
    });

    let ctxMenuEl = null;
    let modalRoot = null;
    let hotkeyCaptureHandler = null;
    let itemPickSession = null;
    let itemPickClickHandler = null;
    let itemPickKeyHandler = null;
    let pickBannerEl = null;
    let busy = false;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function floatHost() {
        if (typeof document === 'undefined') return null;
        return document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.body;
    }

    function placeFixed(el, x, y) {
        if (!el || !el.style) return;
        const host = floatHost();
        if (host && el.parentNode !== host) host.appendChild(el);
        el.hidden = false;
        const menuW = el.offsetWidth || 180;
        const menuH = el.offsetHeight || 80;
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;
        let left = Number(x) || 0;
        let top = Number(y) || 0;
        if (left + menuW > vw - VIEWPORT_PAD) left = left - menuW;
        if (top + menuH > vh - VIEWPORT_PAD) top = top - menuH;
        if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
        if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
        if (left > vw - menuW - VIEWPORT_PAD) left = Math.max(VIEWPORT_PAD, vw - menuW - VIEWPORT_PAD);
        if (top > vh - menuH - VIEWPORT_PAD) top = Math.max(VIEWPORT_PAD, vh - menuH - VIEWPORT_PAD);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }

    function spellBookToList(spellBook) {
        if (!spellBook) return [];
        if (Array.isArray(spellBook)) {
            return spellBook.filter(function (s) { return s && s.id; }).map(function (s) {
                return Object.assign({}, s, { id: String(s.id) });
            });
        }
        if (typeof spellBook === 'object') {
            return Object.keys(spellBook).map(function (key) {
                const sp = spellBook[key] || {};
                const id = sp.id != null && sp.id !== '' ? String(sp.id) : String(key);
                return Object.assign({}, sp, { id: id });
            });
        }
        return [];
    }

    function filterSpells(spells, opts) {
        const o = opts || {};
        const query = o.query != null ? String(o.query).trim().toLowerCase() : '';
        const showAll = !!o.showAll;
        const vocation = o.vocation != null ? String(o.vocation).trim().toLowerCase() : '';
        const sort = o.sort === 'level' || o.sort === 'group' ? o.sort : 'name';
        let list = Array.isArray(spells) ? spells.slice() : [];
        list = list.filter(function (sp) { return sp && sp.id; });
        if (!showAll && vocation && vocation !== 'default' && vocation !== 'common') {
            list = list.filter(function (sp) {
                const vocs = sp.vocations;
                if (!Array.isArray(vocs) || vocs.length === 0) return true;
                for (let i = 0; i < vocs.length; i++) {
                    if (String(vocs[i]).toLowerCase() === vocation) return true;
                }
                return false;
            });
        }
        if (query) {
            list = list.filter(function (sp) {
                const id = String(sp.id).toLowerCase();
                const name = String(sp.label || sp.name || '').toLowerCase();
                const words = sp.words != null ? String(sp.words).toLowerCase() : '';
                const group = String(sp.group || sp.kind || '').toLowerCase();
                return id.indexOf(query) >= 0
                    || name.indexOf(query) >= 0
                    || words.indexOf(query) >= 0
                    || group.indexOf(query) >= 0;
            });
        }
        list.sort(function (a, b) {
            if (sort === 'level') {
                const la = Number(a.level != null ? a.level : a.minLevel) || 0;
                const lb = Number(b.level != null ? b.level : b.minLevel) || 0;
                if (la !== lb) return la - lb;
            } else if (sort === 'group') {
                const ga = String(a.group || a.kind || '');
                const gb = String(b.group || b.kind || '');
                if (ga !== gb) return ga.localeCompare(gb);
            }
            const na = String(a.label || a.name || a.id);
            const nb = String(b.label || b.name || b.id);
            return na.localeCompare(nb);
        });
        return list;
    }

    function normalizeHotkey(str) {
        if (!str) return '';
        return String(str).trim().toUpperCase().replace(/\s+/g, '');
    }

    function isBlockedHotkey(hotkey) {
        const n = normalizeHotkey(hotkey);
        if (!n) return true;
        const parts = n.split('+');
        const base = parts[parts.length - 1] || '';
        if (BLOCKED_ALWAYS[base] || BLOCKED_ALWAYS[n]) return true;
        if (parts.length === 1 && BLOCKED_BARE[base]) return true;
        return false;
    }

    function eventToHotkeyString(ev) {
        if (!ev || !ev.key) return '';
        const key = ev.key;
        if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return '';
        let keyName = key.toUpperCase();
        if (key === ' ') keyName = 'SPACE';
        else if (ev.code && ev.code.indexOf('Digit') === 0) keyName = ev.code.slice(5);
        else if (ev.code && ev.code.indexOf('Key') === 0 && key.length === 1) keyName = ev.code.slice(3);
        const mods = [];
        if (ev.ctrlKey) mods.push('CTRL');
        if (ev.shiftKey) mods.push('SHIFT');
        if (ev.altKey) mods.push('ALT');
        return mods.length ? mods.join('+') + '+' + keyName : keyName;
    }

    function isBusy() {
        return busy || !!hotkeyCaptureHandler || !!itemPickSession
            || !!(modalRoot && !modalRoot.hidden);
    }

    function hideSlotContextMenu() {
        if (ctxMenuEl && ctxMenuEl.parentNode) ctxMenuEl.parentNode.removeChild(ctxMenuEl);
        ctxMenuEl = null;
    }

    function stopHotkeyCapture() {
        if (hotkeyCaptureHandler && typeof document !== 'undefined') {
            document.removeEventListener('keydown', hotkeyCaptureHandler, true);
        }
        hotkeyCaptureHandler = null;
    }

    function closeModal() {
        stopHotkeyCapture();
        busy = false;
        if (modalRoot) {
            modalRoot.hidden = true;
            modalRoot.setAttribute('aria-hidden', 'true');
            const body = modalRoot.querySelector('#actionBarAssignBody');
            if (body) body.innerHTML = '';
        }
    }

    function closeAll() {
        hideSlotContextMenu();
        cancelItemPickMode();
        closeModal();
    }

    function ensureModalShell() {
        if (typeof document === 'undefined') return null;
        if (!modalRoot) {
            modalRoot = document.createElement('div');
            modalRoot.id = 'actionBarAssignModal';
            modalRoot.className = 'party-details-modal action-bar-assign-modal';
            modalRoot.hidden = true;
            modalRoot.setAttribute('aria-hidden', 'true');
            modalRoot.setAttribute('role', 'dialog');
            modalRoot.setAttribute('aria-modal', 'true');
            modalRoot.innerHTML =
                '<div class="party-details-dialog action-bar-assign-dialog">'
                + '<div class="party-details-header">'
                + '<h2 id="actionBarAssignTitle" class="party-details-title">Assign</h2>'
                + '<button type="button" class="panel-close-btn" data-ab-modal-close aria-label="Close">×</button>'
                + '</div>'
                + '<div id="actionBarAssignBody" class="party-details-body"></div>'
                + '</div>';
            const host = floatHost() || document.body;
            host.appendChild(modalRoot);
            modalRoot.addEventListener('click', function (ev) {
                const t = ev.target;
                if (t === modalRoot || (t && t.closest && t.closest('[data-ab-modal-close]'))) {
                    closeModal();
                }
            });
            document.addEventListener('keydown', function (ev) {
                if (ev.key === 'Escape' && modalRoot && !modalRoot.hidden) {
                    if (hotkeyCaptureHandler) return;
                    closeModal();
                }
            });
        }
        const host = floatHost();
        if (host && modalRoot.parentNode !== host) host.appendChild(modalRoot);
        const title = modalRoot.querySelector('#actionBarAssignTitle');
        const body = modalRoot.querySelector('#actionBarAssignBody');
        return { root: modalRoot, title: title, body: body };
    }

    function trapModalFocus(root) {
        if (!root || typeof document === 'undefined') return;
        const dialog = root.querySelector('.action-bar-assign-dialog') || root;
        function focusables() {
            return Array.prototype.slice.call(dialog.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(function (el) {
                return el.offsetParent !== null || el === document.activeElement;
            });
        }
        const list = focusables();
        if (list.length) {
            try { list[0].focus(); } catch (e) {}
        }
        if (root._abFocusTrap) root.removeEventListener('keydown', root._abFocusTrap, true);
        root._abFocusTrap = function (ev) {
            if (ev.key !== 'Tab' || root.hidden) return;
            const els = focusables();
            if (!els.length) return;
            const first = els[0];
            const last = els[els.length - 1];
            if (ev.shiftKey) {
                if (document.activeElement === first || !dialog.contains(document.activeElement)) {
                    ev.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                ev.preventDefault();
                first.focus();
            }
        };
        root.addEventListener('keydown', root._abFocusTrap, true);
    }

    function openModal(titleText, bodyContent) {
        const m = ensureModalShell();
        if (!m) return null;
        stopHotkeyCapture();
        hideSlotContextMenu();
        m.title.textContent = titleText;
        m.root.setAttribute('aria-labelledby', 'actionBarAssignTitle');
        if (typeof bodyContent === 'string') {
            m.body.innerHTML = bodyContent;
        } else if (bodyContent) {
            m.body.innerHTML = '';
            m.body.appendChild(bodyContent);
        }
        m.root.hidden = false;
        m.root.setAttribute('aria-hidden', 'false');
        busy = true;
        setTimeout(function () { trapModalFocus(m.root); }, 0);
        return m;
    }

    function slotFilled(slot) {
        if (!slot || !slot.t || slot.t === 'empty') return false;
        if (slot.t === 'text') return !!(slot.text && String(slot.text).trim());
        if (slot.t === 'multi') {
            const multi = Array.isArray(slot.multi) ? slot.multi : [];
            for (let i = 0; i < multi.length; i++) {
                if (multi[i] && multi[i].t && multi[i].t !== 'empty') return true;
            }
            return false;
        }
        return !!slot.id;
    }

    function showSlotContextMenu(x, y, slot, deps) {
        if (typeof document === 'undefined' || !slot || !deps) return;
        hideSlotContextMenu();
        cancelItemPickMode();
        ctxMenuEl = document.createElement('div');
        ctxMenuEl.className = 'ctx-menu inv-context-menu action-bar-context-menu';
        ctxMenuEl.setAttribute('role', 'menu');
        ctxMenuEl.setAttribute('aria-label', 'Action bar slot menu');
        function addItem(label, fn, disabled) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inv-context-item';
            btn.setAttribute('role', 'menuitem');
            btn.textContent = label;
            if (disabled) {
                btn.disabled = true;
                btn.setAttribute('aria-disabled', 'true');
            } else {
                btn.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    hideSlotContextMenu();
                    fn();
                });
            }
            ctxMenuEl.appendChild(btn);
        }
        const locked = deps.isBarLocked ? !!deps.isBarLocked() : false;
        if (locked) {
            addItem('Bar locked — unlock to edit', function () {}, true);
            addItem('Unlock Bar', function () {
                if (deps.setBarLocked) deps.setBarLocked(false);
            });
        } else {
            const prefix = slotFilled(slot) ? 'Edit' : 'Assign';
            addItem(prefix + ' Spell…', function () { openAssignSpellModal(slot, deps); });
            addItem(prefix + ' Object…', function () { openAssignObjectModal(slot, deps); });
            addItem(prefix + ' Text…', function () { openAssignTextModal(slot, deps); });
            addItem(prefix + ' Multi-Action…', function () { openAssignMultiModal(slot, deps); });
            addItem(prefix + ' Hotkey…', function () { openAssignHotkeyModal(slot, deps); });
            if (slotFilled(slot)) {
                addItem('Clear Action', function () {
                    deps.assignSlot(slot.i, { t: '', id: '', text: '', multi: null, k: slot.k || '' });
                });
            }
            addItem('Lock Bar', function () {
                if (deps.setBarLocked) deps.setBarLocked(true);
            });
        }
        const host = floatHost() || document.body;
        host.appendChild(ctxMenuEl);
        placeFixed(ctxMenuEl, x, y);
        const onDoc = function (ev) {
            if (!ctxMenuEl) return;
            if (ctxMenuEl.contains(ev.target)) return;
            hideSlotContextMenu();
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = function (ev) {
            if (ev.key === 'Escape') {
                hideSlotContextMenu();
                document.removeEventListener('mousedown', onDoc, true);
                document.removeEventListener('keydown', onKey, true);
            }
        };
        setTimeout(function () {
            document.addEventListener('mousedown', onDoc, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    }

    function targetingSelect(id, selected) {
        const cur = selected || 'smart_target';
        const opts = [
            ['smart_target', 'Smart Cast (max hits)'],
            ['active_target', 'Active Target (center on target)'],
            ['cursor_prompt', 'Cursor prompt'],
            ['self', 'Self']
        ];
        let html = '<select id="' + id + '">';
        for (let i = 0; i < opts.length; i++) {
            html += '<option value="' + opts[i][0] + '"'
                + (cur === opts[i][0] ? ' selected' : '') + '>'
                + opts[i][1] + '</option>';
        }
        html += '</select>';
        return html;
    }

    function paintSpellRows(listEl, filtered, selectedId, deps, onPick) {
        listEl.innerHTML = '';
        if (!filtered.length) {
            listEl.innerHTML = '<div class="action-bar-assign-empty">No matching spells.</div>';
            return;
        }
        for (let i = 0; i < filtered.length; i++) {
            const sp = filtered[i];
            const id = String(sp.id);
            const name = sp.label || sp.name || id;
            const mana = sp.mana != null ? sp.mana : (sp.manaCost != null ? sp.manaCost : sp.cost);
            const lvl = sp.level != null ? sp.level : sp.minLevel;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'action-bar-assign-list-item' + (selectedId === id ? ' is-selected' : '');
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', selectedId === id ? 'true' : 'false');
            const spriteId = sp.customUISprite || sp.customSprite || id;
            const url = deps.resolveUiSpriteUrl ? deps.resolveUiSpriteUrl(spriteId) : '';
            const icon = url
                ? '<img src="' + escapeHtml(url) + '" alt="" width="16" height="16">'
                : '';
            let meta = escapeHtml(id);
            if (mana != null) meta += ' · ' + mana + ' mana';
            if (lvl != null) meta += ' · L' + lvl;
            row.innerHTML = '<span class="ab-spell-name">' + icon + escapeHtml(String(name))
                + '</span><span class="ab-spell-meta">' + meta + '</span>';
            row.addEventListener('click', function () { onPick(id); });
            listEl.appendChild(row);
        }
    }

    function openAssignSpellModal(slot, deps) {
        if (!slot || !deps) return;
        const allSpells = spellBookToList(deps.getSpellBook ? deps.getSpellBook() : null);
        const vocation = deps.getVocation ? String(deps.getVocation() || '') : '';
        let selectedId = slot.t === 'spell' && slot.id ? String(slot.id) : '';
        let showAll = false;
        let sort = 'name';
        let query = '';
        const m = openModal(
            'Assign Spell — slot ' + ((slot.i | 0) + 1),
            '<div class="action-bar-assign-form">'
            + '<div class="action-bar-assign-toolbar">'
            + '<input type="search" id="abSpellSearch" placeholder="Search name / id…" autocomplete="off">'
            + '<select id="abSpellSort">'
            + '<option value="name">Name</option>'
            + '<option value="level">Level</option>'
            + '<option value="group">Group</option>'
            + '</select></div>'
            + '<label class="action-bar-assign-check"><input type="checkbox" id="abSpellShowAll"> Show all classes</label>'
            + '<div id="abSpellList" class="action-bar-assign-list" role="listbox"></div>'
            + '<label class="action-bar-assign-field">Targeting'
            + targetingSelect('abSpellTarget', slot.m)
            + '</label>'
            + '<div class="action-bar-assign-actions">'
            + '<button type="button" class="btn btn-retro" data-ab-modal-close>Cancel</button>'
            + '<button type="button" class="btn btn-retro" id="abSpellApply" disabled>Apply</button>'
            + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abSpellOk" disabled>Ok</button>'
            + '</div></div>'
        );
        if (!m) return;
        const listEl = m.body.querySelector('#abSpellList');
        const searchEl = m.body.querySelector('#abSpellSearch');
        const sortEl = m.body.querySelector('#abSpellSort');
        const showAllEl = m.body.querySelector('#abSpellShowAll');
        const targetEl = m.body.querySelector('#abSpellTarget');
        const btnApply = m.body.querySelector('#abSpellApply');
        const btnOk = m.body.querySelector('#abSpellOk');
        function save() {
            if (!selectedId) return false;
            return deps.assignSlot(slot.i, {
                t: 'spell',
                id: selectedId,
                m: targetEl.value || 'smart_target',
                k: slot.k
            });
        }
        function paint() {
            const filtered = filterSpells(allSpells, {
                query: query,
                vocation: vocation,
                showAll: showAll,
                sort: sort
            });
            paintSpellRows(listEl, filtered, selectedId, deps, function (id) {
                selectedId = id;
                paint();
                btnApply.disabled = false;
                btnOk.disabled = false;
            });
        }
        searchEl.addEventListener('input', function () {
            query = searchEl.value || '';
            paint();
        });
        sortEl.addEventListener('change', function () {
            sort = sortEl.value || 'name';
            paint();
        });
        showAllEl.addEventListener('change', function () {
            showAll = !!showAllEl.checked;
            paint();
        });
        btnApply.addEventListener('click', function () { save(); });
        btnOk.addEventListener('click', function () { if (save()) closeModal(); });
        if (selectedId) {
            btnApply.disabled = false;
            btnOk.disabled = false;
        }
        paint();
        searchEl.focus();
    }

    function openAssignObjectModal(slot, deps, prefillItemId) {
        if (!slot || !deps) return;
        let itemId = prefillItemId != null && prefillItemId !== ''
            ? String(prefillItemId)
            : (slot.t === 'item' && slot.id ? String(slot.id) : '');
        const m = openModal(
            'Assign Object — slot ' + ((slot.i | 0) + 1),
            '<div class="action-bar-assign-form">'
            + '<p class="action-bar-assign-hint">Pick an item from inventory / equipment, or type a template id.</p>'
            + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abObjPick">Pick from inventory</button>'
            + '<label class="action-bar-assign-field">Item template id'
            + '<input type="text" id="abObjItemId" class="font-monospace" placeholder="e.g. potion_health" value="'
            + escapeHtml(itemId) + '" autocomplete="off"></label>'
            + '<label class="action-bar-assign-field">Use mode'
            + targetingSelect('abObjTarget', slot.m)
            + '</label>'
            + '<p class="action-bar-assign-hint">Wearable gear always equip/unequip on click, regardless of use mode.</p>'
            + '<div class="action-bar-assign-actions">'
            + '<button type="button" class="btn btn-retro" data-ab-modal-close>Cancel</button>'
            + '<button type="button" class="btn btn-retro" id="abObjApply">Apply</button>'
            + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abObjOk">Ok</button>'
            + '</div></div>'
        );
        if (!m) return;
        const idEl = m.body.querySelector('#abObjItemId');
        const targetEl = m.body.querySelector('#abObjTarget');
        function save() {
            const id = (idEl.value || '').trim();
            if (!id) return false;
            return deps.assignSlot(slot.i, {
                t: 'item',
                id: id,
                m: targetEl.value || 'smart_target',
                k: slot.k
            });
        }
        m.body.querySelector('#abObjPick').addEventListener('click', function () {
            closeModal();
            startItemPickMode({
                onPick: function (pickedId) { openAssignObjectModal(slot, deps, pickedId); },
                onCancel: function () { openAssignObjectModal(slot, deps, itemId); }
            });
        });
        m.body.querySelector('#abObjApply').addEventListener('click', function () { save(); });
        m.body.querySelector('#abObjOk').addEventListener('click', function () { if (save()) closeModal(); });
        idEl.focus();
        idEl.select();
    }

    function startItemPickMode(session) {
        if (typeof document === 'undefined' || !session) return;
        cancelItemPickMode();
        itemPickSession = session;
        if (document.documentElement) document.documentElement.classList.add('cursor-targeting');
        pickBannerEl = document.createElement('div');
        pickBannerEl.className = 'action-bar-pick-banner';
        pickBannerEl.setAttribute('role', 'status');
        pickBannerEl.innerHTML = 'Click an inventory or equipment item to assign. <kbd>Esc</kbd> cancels.';
        (floatHost() || document.body).appendChild(pickBannerEl);
        itemPickClickHandler = function (ev) {
            if (!itemPickSession) return;
            const t = ev.target;
            if (!t || !t.closest) return;
            const slotEl = t.closest(
                '.backpack-slot[data-item-id], .inv-slot[data-item-id], .slot-item[data-item-id], .inv-equip-slot[data-item-id]'
            );
            if (!slotEl) return;
            const id = slotEl.getAttribute('data-item-id');
            if (!id) return;
            ev.preventDefault();
            ev.stopPropagation();
            const onPick = itemPickSession.onPick;
            cancelItemPickMode();
            onPick(id);
        };
        itemPickKeyHandler = function (ev) {
            if (ev.key === 'Escape' && itemPickSession) {
                ev.preventDefault();
                const onCancel = itemPickSession.onCancel;
                cancelItemPickMode();
                if (typeof onCancel === 'function') onCancel();
            }
        };
        document.addEventListener('click', itemPickClickHandler, true);
        document.addEventListener('keydown', itemPickKeyHandler, true);
    }

    function cancelItemPickMode() {
        if (itemPickClickHandler && typeof document !== 'undefined') {
            document.removeEventListener('click', itemPickClickHandler, true);
        }
        if (itemPickKeyHandler && typeof document !== 'undefined') {
            document.removeEventListener('keydown', itemPickKeyHandler, true);
        }
        itemPickClickHandler = null;
        itemPickKeyHandler = null;
        itemPickSession = null;
        if (pickBannerEl && pickBannerEl.parentNode) pickBannerEl.parentNode.removeChild(pickBannerEl);
        pickBannerEl = null;
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.classList.remove('cursor-targeting');
        }
    }

    function openAssignTextModal(slot, deps) {
        if (!slot || !deps) return;
        const initial = slot.t === 'text' && slot.text != null ? String(slot.text) : '';
        const m = openModal(
            'Assign Text — slot ' + ((slot.i | 0) + 1),
            '<div class="action-bar-assign-form">'
            + '<p class="action-bar-assign-hint">Shown as floating text (FCT) on the player when triggered. Does not cast spells.</p>'
            + '<label class="action-bar-assign-field">Text'
            + '<textarea id="abTextBody" rows="3" maxlength="' + TEXT_MAX_LEN + '" placeholder="e.g. Pulling south">'
            + escapeHtml(initial) + '</textarea></label>'
            + '<p class="action-bar-assign-hint">Max ' + TEXT_MAX_LEN + ' characters.</p>'
            + '<div class="action-bar-assign-actions">'
            + '<button type="button" class="btn btn-retro" data-ab-modal-close>Cancel</button>'
            + '<button type="button" class="btn btn-retro" id="abTextApply">Apply</button>'
            + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abTextOk">Ok</button>'
            + '</div></div>'
        );
        if (!m) return;
        const ta = m.body.querySelector('#abTextBody');
        function save() {
            const text = (ta.value || '').slice(0, TEXT_MAX_LEN);
            if (!text.trim()) return false;
            return deps.assignSlot(slot.i, { t: 'text', text: text, k: slot.k });
        }
        m.body.querySelector('#abTextApply').addEventListener('click', function () { save(); });
        m.body.querySelector('#abTextOk').addEventListener('click', function () { if (save()) closeModal(); });
        ta.focus();
    }

    function openAssignHotkeyModal(slot, deps) {
        if (!slot || !deps) return;
        const normFn = deps.normalizeHotkey || normalizeHotkey;
        let captured = slot.k ? normFn(slot.k) : '';
        const m = openModal(
            'Assign Hotkey — slot ' + ((slot.i | 0) + 1),
            '<div class="action-bar-assign-form">'
            + '<p class="action-bar-assign-hint">Press a key combination. Esc cancels capture (use Clear to remove).</p>'
            + '<div id="abHotkeyDisplay" class="action-bar-hotkey-display">'
            + (captured ? escapeHtml(captured) : '<span class="text-muted">Waiting for key…</span>')
            + '</div>'
            + '<div id="abHotkeyWarn"></div>'
            + '<div class="action-bar-assign-actions action-bar-assign-actions--split">'
            + '<button type="button" class="btn btn-retro" id="abHotkeyClear">Clear</button>'
            + '<span class="action-bar-assign-actions">'
            + '<button type="button" class="btn btn-retro" data-ab-modal-close>Cancel</button>'
            + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abHotkeyOk"'
            + (captured && !isBlockedHotkey(captured) ? '' : ' disabled') + '>Ok</button>'
            + '</span></div></div>'
        );
        if (!m) return;
        const display = m.body.querySelector('#abHotkeyDisplay');
        const warn = m.body.querySelector('#abHotkeyWarn');
        const btnOk = m.body.querySelector('#abHotkeyOk');
        function paintWarn() {
            warn.innerHTML = '';
            btnOk.disabled = true;
            if (!captured) return;
            if (isBlockedHotkey(captured)) {
                warn.innerHTML = '<div class="action-bar-assign-warn is-error">Key <strong>'
                    + escapeHtml(captured) + '</strong> is reserved and cannot be bound.</div>';
                return;
            }
            let html = '';
            const barConflict = deps.checkHotkeyConflict
                ? deps.checkHotkeyConflict(captured, slot.i)
                : null;
            if (barConflict != null) {
                html += '<div class="action-bar-assign-warn">Already on <strong>slot '
                    + ((barConflict | 0) + 1)
                    + '</strong>. Ok steals the binding.</div>';
            }
            warn.innerHTML = html;
            btnOk.disabled = false;
        }
        paintWarn();
        hotkeyCaptureHandler = function (ev) {
            if (ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta') return;
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.key === 'Escape') {
                closeModal();
                return;
            }
            const raw = eventToHotkeyString(ev);
            if (!raw) return;
            captured = normFn(raw);
            display.textContent = captured || '';
            paintWarn();
        };
        document.addEventListener('keydown', hotkeyCaptureHandler, true);
        m.body.querySelector('#abHotkeyClear').addEventListener('click', function () {
            deps.assignSlot(slot.i, {
                t: slot.t || '',
                id: slot.id,
                m: slot.m,
                text: slot.text,
                multi: slot.multi,
                k: ''
            });
            closeModal();
        });
        btnOk.addEventListener('click', function () {
            if (!captured || isBlockedHotkey(captured)) return;
            deps.assignSlot(slot.i, {
                t: slot.t || '',
                id: slot.id,
                m: slot.m,
                text: slot.text,
                multi: slot.multi,
                k: captured
            });
            closeModal();
        });
    }

    function multiSubLabel(index0) {
        return ['I', 'II', 'III'][index0] || String(index0 + 1);
    }

    function draftMultiActions(raw) {
        const out = [];
        for (let i = 0; i < MULTI_DEPTH; i++) {
            const r = Array.isArray(raw) ? raw[i] : null;
            if (!r || typeof r !== 'object' || !r.t || r.t === 'empty') {
                out.push({ t: 'empty', id: '', m: 'smart_target', text: '' });
                continue;
            }
            const t = r.t === 'item' || r.t === 'spell' || r.t === 'text' ? r.t : 'empty';
            out.push({
                t: t,
                id: (t === 'item' || t === 'spell') && r.id ? String(r.id) : '',
                text: t === 'text' && r.text != null ? String(r.text) : '',
                m: r.m === 'cursor_prompt' || r.m === 'self' || r.m === 'active_target'
                    ? r.m
                    : 'smart_target'
            });
        }
        return out;
    }

    function multiSubSummary(sub) {
        if (!sub || sub.t === 'empty') return 'Empty';
        if (sub.t === 'spell') return sub.id ? 'Spell: ' + sub.id : 'Spell (none)';
        if (sub.t === 'item') return sub.id ? 'Object: ' + sub.id : 'Object (none)';
        if (sub.t === 'text') {
            const t = sub.text ? String(sub.text) : '';
            if (!t) return 'Text (none)';
            return t.length > 36 ? 'Text: ' + t.slice(0, 36) + '…' : 'Text: ' + t;
        }
        return sub.t;
    }

    function openAssignMultiModal(slot, deps) {
        if (!slot || !deps) return;
        const draft = draftMultiActions(slot.t === 'multi' ? slot.multi : null);

        function renderMain() {
            let rows = '';
            for (let i = 0; i < draft.length; i++) {
                rows += '<div class="action-bar-multi-row">'
                    + '<div class="action-bar-multi-row-head">'
                    + '<span class="action-bar-multi-roman">' + multiSubLabel(i) + '</span>'
                    + '<span class="action-bar-multi-summary">' + escapeHtml(multiSubSummary(draft[i])) + '</span>'
                    + '</div>'
                    + '<div class="action-bar-multi-row-actions">'
                    + '<button type="button" class="btn btn-retro" data-multi-spell="' + i + '">Spell</button>'
                    + '<button type="button" class="btn btn-retro" data-multi-item="' + i + '">Object</button>'
                    + '<button type="button" class="btn btn-retro" data-multi-text="' + i + '">Text</button>'
                    + '<button type="button" class="btn btn-retro" data-multi-clear="' + i + '">Clear</button>'
                    + '</div></div>';
            }
            const m = openModal(
                'Assign Multi-Action — slot ' + ((slot.i | 0) + 1),
                '<div class="action-bar-assign-form action-bar-multi-form">'
                + '<p class="action-bar-assign-hint">Up to three sub-actions. On use, the bar rotates to the first ready action (skips cooldowns, empty slots, and items with no stack).</p>'
                + '<div class="action-bar-multi-rows">' + rows + '</div>'
                + '<div class="action-bar-assign-actions">'
                + '<button type="button" class="btn btn-retro" data-ab-modal-close>Cancel</button>'
                + '<button type="button" class="btn btn-retro" id="abMultiApply">Apply</button>'
                + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abMultiOk">Ok</button>'
                + '</div></div>'
            );
            if (!m) return;
            function save() {
                let hasAny = false;
                for (let i = 0; i < draft.length; i++) {
                    const s = draft[i];
                    if (!s || s.t === 'empty') continue;
                    if ((s.t === 'spell' || s.t === 'item') && s.id) hasAny = true;
                    if (s.t === 'text' && s.text && String(s.text).trim()) hasAny = true;
                }
                if (!hasAny) return false;
                return deps.assignSlot(slot.i, {
                    t: 'multi',
                    multi: draft.map(function (s) {
                        return { t: s.t, id: s.id, m: s.m, text: s.text };
                    }),
                    k: slot.k
                });
            }
            m.body.querySelectorAll('[data-multi-spell]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    renderSpellPicker(Number(btn.getAttribute('data-multi-spell')));
                });
            });
            m.body.querySelectorAll('[data-multi-item]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    renderItemPicker(Number(btn.getAttribute('data-multi-item')));
                });
            });
            m.body.querySelectorAll('[data-multi-text]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    renderTextPicker(Number(btn.getAttribute('data-multi-text')));
                });
            });
            m.body.querySelectorAll('[data-multi-clear]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const idx = Number(btn.getAttribute('data-multi-clear'));
                    if (!Number.isFinite(idx) || idx < 0 || idx >= draft.length) return;
                    draft[idx] = { t: 'empty', id: '', m: 'smart_target', text: '' };
                    renderMain();
                });
            });
            m.body.querySelector('#abMultiApply').addEventListener('click', function () { save(); });
            m.body.querySelector('#abMultiOk').addEventListener('click', function () { if (save()) closeModal(); });
        }

        function renderSpellPicker(idx) {
            const allSpells = spellBookToList(deps.getSpellBook ? deps.getSpellBook() : null);
            const vocation = deps.getVocation ? String(deps.getVocation() || '') : '';
            let selectedId = draft[idx] && draft[idx].t === 'spell' && draft[idx].id
                ? String(draft[idx].id) : '';
            let showAll = false;
            let sort = 'name';
            let query = '';
            const m = openModal(
                'Multi ' + multiSubLabel(idx) + ' — Spell',
                '<div class="action-bar-assign-form">'
                + '<div class="action-bar-assign-toolbar">'
                + '<input type="search" id="abMultiSpellSearch" placeholder="Search name / id…" autocomplete="off">'
                + '<select id="abMultiSpellSort">'
                + '<option value="name">Name</option><option value="level">Level</option><option value="group">Group</option>'
                + '</select></div>'
                + '<label class="action-bar-assign-check"><input type="checkbox" id="abMultiSpellShowAll"> Show all classes</label>'
                + '<div id="abMultiSpellList" class="action-bar-assign-list" role="listbox"></div>'
                + '<label class="action-bar-assign-field">Targeting'
                + targetingSelect('abMultiSpellTarget', draft[idx] && draft[idx].m)
                + '</label>'
                + '<div class="action-bar-assign-actions action-bar-assign-actions--split">'
                + '<button type="button" class="btn btn-retro" id="abMultiSpellBack">Back</button>'
                + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abMultiSpellOk" disabled>Set spell</button>'
                + '</div></div>'
            );
            if (!m) return;
            const listEl = m.body.querySelector('#abMultiSpellList');
            const searchEl = m.body.querySelector('#abMultiSpellSearch');
            const sortEl = m.body.querySelector('#abMultiSpellSort');
            const showAllEl = m.body.querySelector('#abMultiSpellShowAll');
            const targetEl = m.body.querySelector('#abMultiSpellTarget');
            const btnOk = m.body.querySelector('#abMultiSpellOk');
            function paint() {
                const filtered = filterSpells(allSpells, {
                    query: query, vocation: vocation, showAll: showAll, sort: sort
                });
                paintSpellRows(listEl, filtered, selectedId, deps, function (id) {
                    selectedId = id;
                    paint();
                    btnOk.disabled = false;
                });
            }
            searchEl.addEventListener('input', function () { query = searchEl.value || ''; paint(); });
            sortEl.addEventListener('change', function () { sort = sortEl.value || 'name'; paint(); });
            showAllEl.addEventListener('change', function () { showAll = !!showAllEl.checked; paint(); });
            m.body.querySelector('#abMultiSpellBack').addEventListener('click', renderMain);
            btnOk.addEventListener('click', function () {
                if (!selectedId) return;
                draft[idx] = {
                    t: 'spell',
                    id: selectedId,
                    text: '',
                    m: targetEl.value || 'smart_target'
                };
                renderMain();
            });
            if (selectedId) btnOk.disabled = false;
            paint();
            searchEl.focus();
        }

        function renderItemPicker(idx, prefillItemId) {
            let itemId = prefillItemId != null && prefillItemId !== ''
                ? String(prefillItemId)
                : (draft[idx] && draft[idx].t === 'item' && draft[idx].id ? String(draft[idx].id) : '');
            const m = openModal(
                'Multi ' + multiSubLabel(idx) + ' — Object',
                '<div class="action-bar-assign-form">'
                + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abMultiObjPick">Pick from inventory</button>'
                + '<label class="action-bar-assign-field">Item template id'
                + '<input type="text" id="abMultiObjItemId" class="font-monospace" value="'
                + escapeHtml(itemId) + '" autocomplete="off"></label>'
                + '<label class="action-bar-assign-field">Use mode'
                + targetingSelect('abMultiObjTarget', draft[idx] && draft[idx].m)
                + '</label>'
                + '<div class="action-bar-assign-actions action-bar-assign-actions--split">'
                + '<button type="button" class="btn btn-retro" id="abMultiObjBack">Back</button>'
                + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abMultiObjOk">Set object</button>'
                + '</div></div>'
            );
            if (!m) return;
            const idEl = m.body.querySelector('#abMultiObjItemId');
            const targetEl = m.body.querySelector('#abMultiObjTarget');
            m.body.querySelector('#abMultiObjPick').addEventListener('click', function () {
                closeModal();
                startItemPickMode({
                    onPick: function (pickedId) { renderItemPicker(idx, pickedId); },
                    onCancel: function () { renderItemPicker(idx, itemId); }
                });
            });
            m.body.querySelector('#abMultiObjBack').addEventListener('click', renderMain);
            m.body.querySelector('#abMultiObjOk').addEventListener('click', function () {
                const id = (idEl.value || '').trim();
                if (!id) return;
                draft[idx] = { t: 'item', id: id, text: '', m: targetEl.value || 'smart_target' };
                renderMain();
            });
            idEl.focus();
            idEl.select();
        }

        function renderTextPicker(idx) {
            const initial = draft[idx] && draft[idx].t === 'text' && draft[idx].text != null
                ? String(draft[idx].text) : '';
            const m = openModal(
                'Multi ' + multiSubLabel(idx) + ' — Text',
                '<div class="action-bar-assign-form">'
                + '<label class="action-bar-assign-field">Text (FCT)'
                + '<textarea id="abMultiTextBody" rows="3" maxlength="' + TEXT_MAX_LEN + '">'
                + escapeHtml(initial) + '</textarea></label>'
                + '<div class="action-bar-assign-actions action-bar-assign-actions--split">'
                + '<button type="button" class="btn btn-retro" id="abMultiTextBack">Back</button>'
                + '<button type="button" class="btn btn-retro btn-retro-cyan" id="abMultiTextOk">Set text</button>'
                + '</div></div>'
            );
            if (!m) return;
            const ta = m.body.querySelector('#abMultiTextBody');
            m.body.querySelector('#abMultiTextBack').addEventListener('click', renderMain);
            m.body.querySelector('#abMultiTextOk').addEventListener('click', function () {
                const text = (ta.value || '').slice(0, TEXT_MAX_LEN);
                if (!text.trim()) return;
                draft[idx] = { t: 'text', text: text, id: '', m: 'smart_target' };
                renderMain();
            });
            ta.focus();
        }

        renderMain();
    }

    return {
        TEXT_MAX_LEN: TEXT_MAX_LEN,
        MULTI_DEPTH: MULTI_DEPTH,
        spellBookToList: spellBookToList,
        filterSpells: filterSpells,
        normalizeHotkey: normalizeHotkey,
        isBlockedHotkey: isBlockedHotkey,
        eventToHotkeyString: eventToHotkeyString,
        isBusy: isBusy,
        slotFilled: slotFilled,
        draftMultiActions: draftMultiActions,
        multiSubLabel: multiSubLabel,
        multiSubSummary: multiSubSummary,
        showSlotContextMenu: showSlotContextMenu,
        hideSlotContextMenu: hideSlotContextMenu,
        openAssignSpellModal: openAssignSpellModal,
        openAssignObjectModal: openAssignObjectModal,
        openAssignTextModal: openAssignTextModal,
        openAssignHotkeyModal: openAssignHotkeyModal,
        openAssignMultiModal: openAssignMultiModal,
        startItemPickMode: startItemPickMode,
        cancelItemPickMode: cancelItemPickMode,
        closeModal: closeModal,
        closeAll: closeAll
    };
});
