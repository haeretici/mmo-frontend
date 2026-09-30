'use strict';

/**
 * In-page Settings shell and Character float for /play.
 * One instance of each. Placement and viewport clamp use
 * float_panel_place.js. Title-bar drag uses float_panel_drag.js,
 * the same gesture as bag, dialog, shop, and loot headers.
 * The Controls page edits the same mouse and
 * auto-chase preferences play.js already applies. The Hotkeys page
 * lists action-bar profiles (add, copy, rename, remove), edits dock
 * slots, and edits the one global general-hotkey set.
 */
(function (globalRoot, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        globalRoot.EngineClientWindow = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const CHARACTER_FIELDS = [
        ['name', 'Name'],
        ['vocation', 'Vocation'],
        ['level', 'Level'],
        ['hp', 'HP'],
        ['mp', 'MP'],
        ['experience', 'Experience']
    ];

    /**
     * @param {string|null|undefined} vocationId
     * @param {{ classes?: Array<{ id?: string, label?: string }> }|Array<{ id?: string, label?: string }>|null|undefined} catalog
     * @returns {string}
     */
    function vocationLabel(vocationId, catalog) {
        const id = vocationId == null ? '' : String(vocationId);
        const list = catalog && Array.isArray(catalog.classes)
            ? catalog.classes
            : (Array.isArray(catalog) ? catalog : []);
        const lower = id.toLowerCase();
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row || row.id == null) continue;
            if (String(row.id).toLowerCase() !== lower) continue;
            if (row.label) return String(row.label);
            return id;
        }
        return id;
    }

    /**
     * @param {*} src
     * @returns {{ name: string, vocation: string, level: number, hp: number, hpMax: number, mp: number, mpMax: number, experience: number }|null}
     */
    function snapshotOf(src) {
        if (!src) return null;
        return {
            name: src.name == null ? '' : String(src.name),
            vocation: src.vocation == null ? '' : String(src.vocation),
            level: src.level != null ? src.level : 0,
            hp: src.hp != null ? src.hp : 0,
            hpMax: src.hpMax != null ? src.hpMax : 0,
            mp: src.mp != null ? src.mp : 0,
            mpMax: src.mpMax != null ? src.mpMax : 0,
            experience: src.experience != null ? src.experience : 0
        };
    }

    function clampNum(n, lo, hi) {
        if (!(hi >= lo)) return lo;
        if (n < lo) return lo;
        if (n > hi) return hi;
        return n;
    }

    /**
     * @param {object} opts
     * @param {Document} opts.document
     * @param {Window} [opts.window]
     * @param {object} [opts.place]
     * @param {HTMLElement} [opts.root]
     * @param {function(): object|null} [opts.getCharacter]
     * @param {object} [opts.classes]
     */
    function mount(opts) {
        const o = opts || {};
        const doc = o.document;
        if (!doc || typeof doc.createElement !== 'function') return null;
        const win = o.window || null;
        const place = o.place || null;
        const getCharacter = typeof o.getCharacter === 'function' ? o.getCharacter : function () { return null; };
        let classes = o.classes || null;
        let zTop = 1100;
        let page = 'controls';
        let character = null;

        const root = o.root
            || (typeof doc.getElementById === 'function' && doc.getElementById('inventoryFloatRoot'))
            || doc.body
            || null;
        if (!root || typeof root.appendChild !== 'function') return null;

        const settingsBtn = typeof doc.getElementById === 'function' ? doc.getElementById('toggleSettingsBtn') : null;
        const characterBtn = typeof doc.getElementById === 'function' ? doc.getElementById('toggleCharacterBtn') : null;

        const settingsPanel = createShell(doc, {
            id: 'client-settings-window',
            kind: 'settings',
            title: 'Settings',
            closeLabel: 'Close settings'
        });
        const characterPanel = createShell(doc, {
            id: 'client-character-window',
            kind: 'character',
            title: 'Character',
            closeLabel: 'Close character'
        });
        const characterFields = appendCharacterLines(doc, characterPanel);
        const settingsBody = appendSettingsBody(doc, settingsPanel);
        const controlRefs = settingsBody.controls;
        const hotkeysUi = settingsBody.hotkeys;
        root.appendChild(settingsPanel);
        root.appendChild(characterPanel);

        const settingsClose = settingsPanel.querySelector('.panel-close-btn');
        const characterClose = characterPanel.querySelector('.panel-close-btn');
        if (settingsClose) {
            settingsClose.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (ev && ev.stopPropagation) ev.stopPropagation();
                hide(settingsPanel, settingsBtn);
            });
        }
        if (characterClose) {
            characterClose.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (ev && ev.stopPropagation) ev.stopPropagation();
                hide(characterPanel, characterBtn);
            });
        }

        bindDrag(settingsPanel);
        bindDrag(characterPanel);
        bindRail(settingsPanel);

        if (settingsBtn) {
            settingsBtn.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (isOpen(settingsPanel)) {
                    raise(settingsPanel);
                    return;
                }
                openSettings();
            });
        }
        if (characterBtn) {
            characterBtn.addEventListener('click', function (ev) {
                if (ev && ev.preventDefault) ev.preventDefault();
                if (isOpen(characterPanel)) {
                    raise(characterPanel);
                    return;
                }
                openCharacter();
            });
        }

        if (win && typeof win.addEventListener === 'function') {
            win.addEventListener('keydown', function (ev) {
                if (!ev || ev.key !== 'Escape') return;
                if (!isOpen(settingsPanel)) return;
                hide(settingsPanel, settingsBtn);
            });
        }

        function isOpen(panel) {
            return !!(panel && panel.hidden !== true);
        }

        function setButtonOpen(btn, open) {
            if (!btn) return;
            if (btn.classList) {
                btn.classList.toggle('is-open', !!open);
                btn.classList.toggle('is-closed', !open);
            }
            if (typeof btn.setAttribute === 'function') {
                btn.setAttribute('aria-pressed', open ? 'true' : 'false');
            }
        }

        function panelSize(panel) {
            const settings = panel.classList && panel.classList.contains('client-window-settings');
            const w = Number(panel.offsetWidth) || 0;
            const h = Number(panel.offsetHeight) || 0;
            return {
                w: w > 0 ? w : (settings ? 560 : 240),
                h: h > 0 ? h : (settings ? 360 : 180)
            };
        }

        function rootOrigin(panel) {
            const parent = panel && panel.parentNode;
            if (!parent || typeof parent.getBoundingClientRect !== 'function') {
                return { left: 0, top: 0 };
            }
            const rr = parent.getBoundingClientRect();
            return {
                left: rr && rr.left != null ? Number(rr.left) || 0 : 0,
                top: rr && rr.top != null ? Number(rr.top) || 0 : 0
            };
        }

        function viewport() {
            if (place && typeof place.viewportBounds === 'function') {
                return place.viewportBounds(win);
            }
            const width = win && win.innerWidth != null ? Number(win.innerWidth) : 0;
            const height = win && win.innerHeight != null ? Number(win.innerHeight) : 0;
            return {
                left: 8,
                top: 8,
                right: width > 0 ? Math.max(8, width - 8) : 10000,
                bottom: height > 0 ? Math.max(8, height - 8) : 10000
            };
        }

        function clampToViewport(panel) {
            if (!panel || !panel.style) return;
            const size = panelSize(panel);
            const bounds = viewport();
            const origin = rootOrigin(panel);
            const curLeft = parseFloat(panel.style.left);
            const curTop = parseFloat(panel.style.top);
            const localLeft = Number.isFinite(curLeft) ? curLeft : 0;
            const localTop = Number.isFinite(curTop) ? curTop : 0;
            const clientLeft = localLeft + origin.left;
            const clientTop = localTop + origin.top;
            const nextLeft = clampNum(clientLeft, bounds.left, bounds.right - size.w);
            const nextTop = clampNum(clientTop, bounds.top, bounds.bottom - size.h);
            panel.style.left = (nextLeft - origin.left) + 'px';
            panel.style.top = (nextTop - origin.top) + 'px';
        }

        function placeInitial(panel, anchorEl) {
            if (panel._clientWindowPlaced) {
                clampToViewport(panel);
                return;
            }
            panel._clientWindowPlaced = true;
            const size = panelSize(panel);
            if (place && typeof place.placeFloatPanel === 'function') {
                let anchor = null;
                if (anchorEl && typeof place.slotClientRect === 'function') {
                    anchor = place.slotClientRect(anchorEl);
                }
                const occupied = typeof place.collectOccupiedRects === 'function'
                    ? place.collectOccupiedRects(root, panel)
                    : [];
                place.placeFloatPanel(panel, {
                    anchor: anchor,
                    bounds: viewport(),
                    occupied: occupied,
                    fallbackW: size.w,
                    fallbackH: size.h
                });
                const origin = rootOrigin(panel);
                if (origin.left || origin.top) {
                    const left = parseFloat(panel.style.left) || 0;
                    const top = parseFloat(panel.style.top) || 0;
                    panel.style.left = (left - origin.left) + 'px';
                    panel.style.top = (top - origin.top) + 'px';
                }
            } else if (!panel.style.left) {
                panel.style.left = '8px';
                panel.style.top = '8px';
            }
            clampToViewport(panel);
        }

        function nextZ() {
            let top = zTop;
            if (doc && typeof doc.querySelectorAll === 'function') {
                const nodes = doc.querySelectorAll('.float-panel, .inv-float-panel, .client-window');
                for (let i = 0; i < nodes.length; i++) {
                    const z = parseInt(nodes[i].style && nodes[i].style.zIndex, 10);
                    if (z > top) top = z;
                }
            }
            top += 1;
            zTop = top;
            return top;
        }

        function raise(panel) {
            if (!panel || !panel.style) return;
            panel.style.zIndex = String(nextZ());
            if (settingsPanel.classList) {
                settingsPanel.classList.toggle('is-focused', settingsPanel === panel);
            }
            if (characterPanel.classList) {
                characterPanel.classList.toggle('is-focused', characterPanel === panel);
            }
            if (typeof panel.focus === 'function') {
                try { panel.focus(); } catch (err) { /* focus is optional in tests */ }
            }
        }

        function show(panel, btn, anchorEl) {
            panel.hidden = false;
            if (panel.style) panel.style.display = '';
            setButtonOpen(btn, true);
            placeInitial(panel, anchorEl);
            raise(panel);
        }

        function hide(panel, btn) {
            if (!panel) return;
            panel.hidden = true;
            setButtonOpen(btn, false);
            if (panel.classList) panel.classList.remove('is-focused');
        }

        function showPage(name) {
            const next = name === 'hotkeys' ? 'hotkeys' : 'controls';
            page = next;
            const panes = settingsPanel.querySelectorAll('[data-pane]');
            for (let i = 0; i < panes.length; i++) {
                panes[i].hidden = panes[i].getAttribute('data-pane') !== next;
            }
            const buttons = settingsPanel.querySelectorAll('[data-page]');
            for (let i = 0; i < buttons.length; i++) {
                const on = buttons[i].getAttribute('data-page') === next;
                if (buttons[i].classList) buttons[i].classList.toggle('is-active', on);
                if (typeof buttons[i].setAttribute === 'function') {
                    buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
                }
            }
        }

        function bindRail(panel) {
            const buttons = panel.querySelectorAll('[data-page]');
            for (let i = 0; i < buttons.length; i++) {
                buttons[i].addEventListener('click', function (ev) {
                    if (ev && ev.preventDefault) ev.preventDefault();
                    showPage(buttons[i].getAttribute('data-page'));
                });
            }
            showPage('controls');
        }

        function fillCharacter(snap) {
            const values = {
                name: snap.name,
                vocation: vocationLabel(snap.vocation, classes),
                level: String(snap.level != null ? snap.level : 0),
                hp: String(snap.hp != null ? snap.hp : 0) + '/' + String(snap.hpMax != null ? snap.hpMax : 0),
                mp: String(snap.mp != null ? snap.mp : 0) + '/' + String(snap.mpMax != null ? snap.mpMax : 0),
                experience: String(snap.experience != null ? snap.experience : 0)
            };
            const sig = CHARACTER_FIELDS.map(function (pair) { return values[pair[0]]; }).join('\n');
            if (characterPanel._lineSig === sig) return;
            characterPanel._lineSig = sig;
            CHARACTER_FIELDS.forEach(function (pair) {
                const node = characterFields[pair[0]];
                if (node) node.textContent = values[pair[0]];
            });
        }

        function openSettings() {
            show(settingsPanel, settingsBtn, settingsBtn);
            showPage(page);
        }

        function openCharacter() {
            const live = snapshotOf(getCharacter());
            if (!live) return false;
            character = live;
            fillCharacter(character);
            show(characterPanel, characterBtn, characterBtn);
            return true;
        }

        function syncCharacter(next) {
            const src = arguments.length ? next : getCharacter();
            character = snapshotOf(src);
            if (!character) {
                hide(characterPanel, characterBtn);
                return;
            }
            if (isOpen(characterPanel)) fillCharacter(character);
        }

        function setClasses(docCatalog) {
            classes = docCatalog || null;
            if (character && isOpen(characterPanel)) fillCharacter(character);
        }

        let controlHandlers = {};
        let controlsBound = false;

        function readMouse() {
            const refs = controlRefs || {};
            return {
                mouseControlMode: Number(refs.mode && refs.mode.value),
                lootControlMode: Number(refs.loot && refs.loot.value),
                talkOnRightClick: !!(refs.talk && refs.talk.checked),
                moveStack: !!(refs.stack && refs.stack.checked)
            };
        }

        function applyControlVisibility(mode) {
            const refs = controlRefs || {};
            const n = Number(mode);
            if (refs.lootWrap) refs.lootWrap.hidden = n !== 1;
            if (refs.talkWrap) refs.talkWrap.hidden = n !== 0;
        }

        function writeMouse(bag) {
            const refs = controlRefs || {};
            const src = bag && typeof bag === 'object' ? bag : {};
            if (refs.mode) refs.mode.value = src.mouseControlMode != null ? String(src.mouseControlMode) : '1';
            if (refs.loot) refs.loot.value = src.lootControlMode != null ? String(src.lootControlMode) : '0';
            if (refs.talk) refs.talk.checked = src.talkOnRightClick === true;
            if (refs.stack) refs.stack.checked = src.moveStack === true;
            applyControlVisibility(refs.mode ? refs.mode.value : 1);
        }

        function publishMouse() {
            const bag = readMouse();
            let saved = bag;
            if (typeof controlHandlers.onMouse === 'function') {
                const ret = controlHandlers.onMouse(bag);
                if (ret && typeof ret === 'object') saved = ret;
            }
            writeMouse(saved);
        }

        let profileHandlers = {};
        let profilesBound = false;
        let slotHandlers = {};
        let slotsBound = false;
        let generalHandlers = {};

        function profileName() {
            const input = hotkeysUi && hotkeysUi.nameInput;
            return input && input.value ? String(input.value).trim() : '';
        }

        function setProfiles(spec) {
            const o = spec || {};
            profileHandlers = {
                onChange: typeof o.onChange === 'function' ? o.onChange : null,
                onAdd: typeof o.onAdd === 'function' ? o.onAdd : null,
                onCopy: typeof o.onCopy === 'function' ? o.onCopy : null,
                onRename: typeof o.onRename === 'function' ? o.onRename : null,
                onRemove: typeof o.onRemove === 'function' ? o.onRemove : null
            };
            const select = hotkeysUi && hotkeysUi.profileSelect;
            if (!select) return;
            const ids = Array.isArray(o.ids) ? o.ids : [];
            const active = o.activeId != null ? String(o.activeId) : '';
            select.textContent = '';
            for (let i = 0; i < ids.length; i++) {
                const name = String(ids[i]);
                addOption(doc, select, name, name, name === active);
            }
            select.value = active;
            if (hotkeysUi.removeBtn) hotkeysUi.removeBtn.disabled = ids.length < 2;
            if (profilesBound) return;
            profilesBound = true;
            select.addEventListener('change', function () {
                if (profileHandlers.onChange) profileHandlers.onChange(select.value);
            });
            hotkeysUi.addBtn.addEventListener('click', function () {
                const name = profileName();
                if (profileHandlers.onAdd && profileHandlers.onAdd(name) && hotkeysUi.nameInput) {
                    hotkeysUi.nameInput.value = '';
                }
            });
            hotkeysUi.copyBtn.addEventListener('click', function () {
                const name = profileName();
                if (profileHandlers.onCopy && profileHandlers.onCopy(name) && hotkeysUi.nameInput) {
                    hotkeysUi.nameInput.value = '';
                }
            });
            hotkeysUi.renameBtn.addEventListener('click', function () {
                const name = profileName();
                if (profileHandlers.onRename && profileHandlers.onRename(name) && hotkeysUi.nameInput) {
                    hotkeysUi.nameInput.value = '';
                }
            });
            hotkeysUi.removeBtn.addEventListener('click', function () {
                if (hotkeysUi.removeBtn.disabled) return;
                if (profileHandlers.onRemove) profileHandlers.onRemove();
            });
        }

        function writeCount(select, value) {
            if (!select) return;
            let n = value | 0;
            if (n < 0) n = 0;
            if (n > 3) n = 3;
            select.value = String(n);
        }

        function bindCount(select, dock) {
            if (!select || select._countBound) return;
            select._countBound = true;
            select.addEventListener('change', function () {
                if (!slotHandlers.onCount) return;
                let n = parseInt(select.value, 10);
                if (!Number.isFinite(n)) n = 0;
                slotHandlers.onCount(dock, n);
            });
        }

        function setSlots(spec) {
            const o = spec || {};
            slotHandlers = {
                onDock: typeof o.onDock === 'function' ? o.onDock : null,
                onBar: typeof o.onBar === 'function' ? o.onBar : null,
                onSelect: typeof o.onSelect === 'function' ? o.onSelect : null,
                onEdit: typeof o.onEdit === 'function' ? o.onEdit : null,
                onCount: typeof o.onCount === 'function' ? o.onCount : null
            };
            if (o.counts) {
                writeCount(hotkeysUi.countBottom, o.counts.bottom);
                writeCount(hotkeysUi.countLeft, o.counts.left);
                writeCount(hotkeysUi.countRight, o.counts.right);
            }
            if (!hotkeysUi) return;
            if (hotkeysUi.dockSelect) hotkeysUi.dockSelect.value = o.dock || 'bottom';
            if (hotkeysUi.barSelect) {
                hotkeysUi.barSelect.textContent = '';
                const bars = Array.isArray(o.bars) ? o.bars : [];
                for (let i = 0; i < bars.length; i++) {
                    const id = String(bars[i].id);
                    addOption(doc, hotkeysUi.barSelect, id, bars[i].label || ('Bar ' + id), (bars[i].id | 0) === (o.barId | 0));
                }
                hotkeysUi.barSelect.value = o.barId != null ? String(o.barId) : '';
            }
            if (hotkeysUi.slotList) {
                hotkeysUi.slotList.textContent = '';
                const rows = Array.isArray(o.slots) ? o.slots : [];
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const btn = tagged(doc, 'button', 'client-window-slot' + ((row.i | 0) === (o.selected | 0) ? ' is-selected' : ''), null);
                    btn.type = 'button';
                    if (typeof btn.setAttribute === 'function') btn.setAttribute('type', 'button');
                    const key = row.k ? ('  ' + row.k) : '';
                    btn.textContent = String((row.i | 0) + 1) + '  ' + (row.label || 'Empty') + key;
                    btn.addEventListener('click', function () {
                        if (slotHandlers.onSelect) slotHandlers.onSelect(row.i | 0);
                    });
                    hotkeysUi.slotList.appendChild(btn);
                }
            }
            const locked = o.locked === true;
            const edits = hotkeysUi.editButtons || {};
            const kinds = Object.keys(edits);
            for (let i = 0; i < kinds.length; i++) edits[kinds[i]].disabled = locked;
            if (slotsBound) return;
            slotsBound = true;
            if (hotkeysUi.dockSelect) {
                hotkeysUi.dockSelect.addEventListener('change', function () {
                    if (slotHandlers.onDock) slotHandlers.onDock(hotkeysUi.dockSelect.value);
                });
            }
            if (hotkeysUi.barSelect) {
                hotkeysUi.barSelect.addEventListener('change', function () {
                    if (slotHandlers.onBar) slotHandlers.onBar(hotkeysUi.barSelect.value);
                });
            }
            bindCount(hotkeysUi.countBottom, 'bottom');
            bindCount(hotkeysUi.countLeft, 'left');
            bindCount(hotkeysUi.countRight, 'right');
            for (let i = 0; i < kinds.length; i++) {
                (function (kind) {
                    edits[kind].addEventListener('click', function () {
                        if (edits[kind].disabled) return;
                        if (slotHandlers.onEdit) slotHandlers.onEdit(kind);
                    });
                })(kinds[i]);
            }
        }

        function setGeneralHotkeys(spec) {
            const o = spec || {};
            generalHandlers = {
                onAdd: typeof o.onAdd === 'function' ? o.onAdd : null,
                onReplace: typeof o.onReplace === 'function' ? o.onReplace : null,
                onRemove: typeof o.onRemove === 'function' ? o.onRemove : null,
                onCancel: typeof o.onCancel === 'function' ? o.onCancel : null
            };
            const host = hotkeysUi && hotkeysUi.generalHost;
            if (!host) return;
            host.textContent = '';
            const rows = Array.isArray(o.rows) ? o.rows : [];
            const capturing = o.capturing || null;
            let group = '';
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row.group && row.group !== group) {
                    group = row.group;
                    const heading = tagged(doc, 'p', 'client-window-section', null);
                    heading.textContent = group;
                    host.appendChild(heading);
                }
                const line = tagged(doc, 'div', 'client-window-hotkey-row', null);
                const label = tagged(doc, 'span', 'client-window-hotkey-label', null);
                label.textContent = row.label || row.id || '';
                const keys = tagged(doc, 'span', 'client-window-hotkey-keys', null);
                const list = Array.isArray(row.keys) ? row.keys : [];
                for (let k = 0; k < list.length; k++) {
                    (function (index) {
                        const rebound = capturing && capturing.actionId === row.id && (capturing.index | 0) === index;
                        const keyBtn = tagged(doc, 'button', 'client-window-key', null);
                        keyBtn.type = 'button';
                        if (typeof keyBtn.setAttribute === 'function') keyBtn.setAttribute('type', 'button');
                        keyBtn.textContent = rebound ? 'Press key…' : String(list[index]);
                        keyBtn.addEventListener('click', function () {
                            if (rebound && generalHandlers.onCancel) generalHandlers.onCancel();
                            else if (generalHandlers.onReplace) generalHandlers.onReplace(row.id, index);
                        });
                        const drop = tagged(doc, 'button', 'client-window-key-remove', null);
                        drop.type = 'button';
                        if (typeof drop.setAttribute === 'function') {
                            drop.setAttribute('type', 'button');
                            drop.setAttribute('aria-label', 'Remove ' + String(list[index]));
                        }
                        drop.textContent = '×';
                        drop.addEventListener('click', function () {
                            if (generalHandlers.onRemove) generalHandlers.onRemove(row.id, index);
                        });
                        keys.appendChild(keyBtn);
                        keys.appendChild(drop);
                    })(k);
                }
                const adding = capturing && capturing.actionId === row.id && (capturing.index | 0) < 0;
                const add = tagged(doc, 'button', 'client-window-key-add', null);
                add.type = 'button';
                if (typeof add.setAttribute === 'function') add.setAttribute('type', 'button');
                add.textContent = adding ? 'Press key…' : 'Add';
                add.addEventListener('click', function () {
                    if (adding && generalHandlers.onCancel) generalHandlers.onCancel();
                    else if (generalHandlers.onAdd) generalHandlers.onAdd(row.id);
                });
                keys.appendChild(add);
                line.appendChild(label);
                line.appendChild(keys);
                host.appendChild(line);
            }
        }

        function bindControls(opts) {
            const o = opts || {};
            controlHandlers = o;
            writeMouse(o.mouse || {});
            if (controlRefs && controlRefs.chase) controlRefs.chase.checked = o.autoChase === true;
            if (controlsBound || !controlRefs) return;
            controlsBound = true;
            if (controlRefs.mode) controlRefs.mode.addEventListener('change', publishMouse);
            if (controlRefs.loot) controlRefs.loot.addEventListener('change', publishMouse);
            if (controlRefs.talk) controlRefs.talk.addEventListener('change', publishMouse);
            if (controlRefs.stack) {
                controlRefs.stack.addEventListener('change', function () {
                    publishMouse();
                    if (typeof controlRefs.stack.blur === 'function') controlRefs.stack.blur();
                });
            }
            if (controlRefs.chase) {
                controlRefs.chase.addEventListener('change', function () {
                    if (typeof controlRefs.chase.blur === 'function') controlRefs.chase.blur();
                    if (typeof controlHandlers.onAutoChase === 'function') {
                        controlHandlers.onAutoChase(controlRefs.chase.checked === true);
                    }
                });
            }
        }

        function floatDragApi() {
            if (typeof EngineFloatPanelDrag !== 'undefined') return EngineFloatPanelDrag;
            if (typeof require === 'function') return require('./float_panel_drag.js');
            return null;
        }

        function bindDrag(panel) {
            const header = panel.querySelector('.panel-title-bar');
            panel.addEventListener('pointerdown', function () {
                raise(panel);
            });
            const drag = floatDragApi();
            if (!header || !drag) return;
            drag.wireHeaderDrag(header, panel, {
                onRaise: function () { raise(panel); },
                ignoreSelector: 'button, a, input, select, textarea',
                primaryButtonOnly: true,
                stopHeaderEvent: true,
                readOrigin: function (node) {
                    const sl = parseFloat(node.style && node.style.left);
                    const st = parseFloat(node.style && node.style.top);
                    return {
                        left: Number.isFinite(sl) ? sl : (Number(node.offsetLeft) || 0),
                        top: Number.isFinite(st) ? st : (Number(node.offsetTop) || 0)
                    };
                },
                onMove: function () { clampToViewport(panel); }
            });
        }

        return {
            settingsEl: function () { return settingsPanel; },
            characterEl: function () { return characterPanel; },
            openSettings: openSettings,
            openCharacter: openCharacter,
            syncCharacter: syncCharacter,
            setClasses: setClasses,
            showPage: showPage,
            bindControls: bindControls,
            setProfiles: setProfiles,
            setSlots: setSlots,
            setGeneralHotkeys: setGeneralHotkeys
        };
    }

    function createShell(doc, spec) {
        const panel = doc.createElement('div');
        panel.id = spec.id;
        panel.className = 'float-panel client-window client-window-' + spec.kind;
        panel.hidden = true;
        panel.tabIndex = -1;
        if (typeof panel.setAttribute === 'function') {
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.setAttribute('aria-label', spec.title);
            panel.setAttribute('data-client-window', spec.kind);
        }

        const header = doc.createElement('div');
        header.className = 'am-sidebar-title-row panel-title-bar';
        const title = doc.createElement('strong');
        title.className = 'am-sidebar-title';
        title.textContent = spec.title;
        const closeBtn = doc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'panel-close-btn panel-close';
        if (typeof closeBtn.setAttribute === 'function') {
            closeBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('aria-label', spec.closeLabel);
        }
        const icon = doc.createElement('i');
        icon.className = 'fa-solid fa-xmark';
        if (typeof icon.setAttribute === 'function') icon.setAttribute('aria-hidden', 'true');
        closeBtn.appendChild(icon);
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        return panel;
    }

    function appendSettingsBody(doc, panel) {
        const body = doc.createElement('div');
        body.className = 'client-window-body';
        const rail = doc.createElement('nav');
        rail.className = 'client-window-rail';
        if (typeof rail.setAttribute === 'function') rail.setAttribute('aria-label', 'Settings pages');
        [
            ['controls', 'Controls'],
            ['hotkeys', 'Hotkeys']
        ].forEach(function (pair) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            if (typeof btn.setAttribute === 'function') {
                btn.setAttribute('type', 'button');
                btn.setAttribute('data-page', pair[0]);
            }
            btn.textContent = pair[1];
            rail.appendChild(btn);
        });
        const controls = doc.createElement('div');
        controls.className = 'client-window-pane';
        if (typeof controls.setAttribute === 'function') controls.setAttribute('data-pane', 'controls');
        const hotkeys = doc.createElement('div');
        hotkeys.className = 'client-window-pane';
        hotkeys.hidden = true;
        if (typeof hotkeys.setAttribute === 'function') hotkeys.setAttribute('data-pane', 'hotkeys');
        const controlRefs = appendControls(doc, controls);
        const hotkeysUi = appendHotkeys(doc, hotkeys);
        body.appendChild(rail);
        body.appendChild(controls);
        body.appendChild(hotkeys);
        panel.appendChild(body);
        return { controls: controlRefs, hotkeys: hotkeysUi };
    }

    function actionButton(doc, id, text) {
        const btn = tagged(doc, 'button', 'btn btn-xs', id);
        btn.type = 'button';
        if (typeof btn.setAttribute === 'function') btn.setAttribute('type', 'button');
        btn.textContent = text;
        return btn;
    }

    function appendHotkeys(doc, pane) {
        const box = tagged(doc, 'div', 'client-window-controls', null);

        const field = tagged(doc, 'div', 'client-window-field', null);
        addFieldLabel(doc, field, 'action-bar-profile', 'Profile');
        const select = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', 'action-bar-profile');
        field.appendChild(select);
        box.appendChild(field);

        const nameField = tagged(doc, 'div', 'client-window-field', null);
        addFieldLabel(doc, nameField, 'action-bar-profile-name', 'Name');
        const nameInput = tagged(doc, 'input', 'form-control form-control-sm', 'action-bar-profile-name');
        nameInput.type = 'text';
        if (typeof nameInput.setAttribute === 'function') {
            nameInput.setAttribute('type', 'text');
            nameInput.setAttribute('autocomplete', 'off');
        }
        nameField.appendChild(nameInput);
        box.appendChild(nameField);

        const actions = tagged(doc, 'div', 'client-window-profile-actions', null);
        const addBtn = actionButton(doc, 'action-bar-profile-add', 'Add');
        const copyBtn = actionButton(doc, 'action-bar-profile-copy', 'Copy');
        const renameBtn = actionButton(doc, 'action-bar-profile-rename', 'Rename');
        const removeBtn = actionButton(doc, 'action-bar-profile-remove', 'Remove');
        removeBtn.disabled = true;
        actions.appendChild(addBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(renameBtn);
        actions.appendChild(removeBtn);
        box.appendChild(actions);

        const barsHead = tagged(doc, 'p', 'client-window-section', null);
        barsHead.textContent = 'Action bars';
        box.appendChild(barsHead);

        const countHint = tagged(doc, 'p', 'client-window-hint', null);
        countHint.textContent = 'Up to 3 bars on each side. Arrows scroll 50 slots.';
        box.appendChild(countHint);

        const countRow = tagged(doc, 'div', 'client-window-counts', 'action-bar-counts');
        function countSelect(id, label, initial) {
            const field = tagged(doc, 'div', 'client-window-field', null);
            addFieldLabel(doc, field, id, label);
            const select = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', id);
            for (let n = 0; n <= 3; n++) addOption(doc, select, String(n), String(n), n === initial);
            select.value = String(initial);
            field.appendChild(select);
            countRow.appendChild(field);
            return select;
        }
        const countBottom = countSelect('action-bar-count-bottom', 'Bottom', 1);
        const countLeft = countSelect('action-bar-count-left', 'Left', 0);
        const countRight = countSelect('action-bar-count-right', 'Right', 0);
        box.appendChild(countRow);

        const dockField = tagged(doc, 'div', 'client-window-field', null);
        addFieldLabel(doc, dockField, 'action-bar-dock', 'Dock');
        const dockSelect = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', 'action-bar-dock');
        addOption(doc, dockSelect, 'bottom', 'Bottom', true);
        addOption(doc, dockSelect, 'left', 'Left', false);
        addOption(doc, dockSelect, 'right', 'Right', false);
        dockSelect.value = 'bottom';
        dockField.appendChild(dockSelect);
        box.appendChild(dockField);

        const barField = tagged(doc, 'div', 'client-window-field', null);
        addFieldLabel(doc, barField, 'action-bar-bar', 'Bar');
        const barSelect = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', 'action-bar-bar');
        barField.appendChild(barSelect);
        box.appendChild(barField);

        const slotList = tagged(doc, 'div', 'client-window-slot-list', 'action-bar-slots');
        box.appendChild(slotList);

        const editRow = tagged(doc, 'div', 'client-window-edit-actions', null);
        const editButtons = {
            spell: actionButton(doc, 'action-bar-edit-spell', 'Spell'),
            object: actionButton(doc, 'action-bar-edit-object', 'Object'),
            text: actionButton(doc, 'action-bar-edit-text', 'Text'),
            multi: actionButton(doc, 'action-bar-edit-multi', 'Multi'),
            hotkey: actionButton(doc, 'action-bar-edit-hotkey', 'Hotkey'),
            clear: actionButton(doc, 'action-bar-edit-clear', 'Clear')
        };
        const editKinds = ['spell', 'object', 'text', 'multi', 'hotkey', 'clear'];
        for (let i = 0; i < editKinds.length; i++) editRow.appendChild(editButtons[editKinds[i]]);
        box.appendChild(editRow);

        const generalHead = tagged(doc, 'p', 'client-window-section', null);
        generalHead.textContent = 'General hotkeys';
        box.appendChild(generalHead);
        const generalHost = tagged(doc, 'div', 'client-window-general', 'general-hotkeys');
        box.appendChild(generalHost);

        pane.appendChild(box);
        return {
            profileSelect: select,
            nameInput: nameInput,
            addBtn: addBtn,
            copyBtn: copyBtn,
            renameBtn: renameBtn,
            removeBtn: removeBtn,
            dockSelect: dockSelect,
            barSelect: barSelect,
            countBottom: countBottom,
            countLeft: countLeft,
            countRight: countRight,
            slotList: slotList,
            editButtons: editButtons,
            generalHost: generalHost
        };
    }

    const MOVE_STACK_TITLE = 'Off: plain drag opens the amount slider; Ctrl moves the full stack. On: plain drag moves the full stack; Ctrl opens the slider. Shift always moves 1.';

    function tagged(doc, tag, className, id) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (id) node.id = id;
        return node;
    }

    function addOption(doc, select, value, label, selected) {
        const opt = doc.createElement('option');
        opt.value = value;
        if (typeof opt.setAttribute === 'function') opt.setAttribute('value', value);
        opt.textContent = label;
        if (selected) {
            opt.selected = true;
            if (typeof opt.setAttribute === 'function') opt.setAttribute('selected', 'selected');
        }
        select.appendChild(opt);
    }

    function addFieldLabel(doc, parent, forId, text) {
        const label = tagged(doc, 'label', 'label-retro client-window-control-label', null);
        if (typeof label.setAttribute === 'function') label.setAttribute('for', forId);
        label.textContent = text;
        parent.appendChild(label);
        return label;
    }

    function addSwitch(doc, parent, id, text, title) {
        const wrap = tagged(doc, 'div', 'form-check form-switch', null);
        const input = tagged(doc, 'input', 'form-check-input', id);
        input.type = 'checkbox';
        if (typeof input.setAttribute === 'function') {
            input.setAttribute('type', 'checkbox');
            if (title) input.setAttribute('title', title);
        }
        const label = tagged(doc, 'label', 'form-check-label label-retro', null);
        if (typeof label.setAttribute === 'function') label.setAttribute('for', id);
        label.textContent = text;
        wrap.appendChild(input);
        wrap.appendChild(label);
        parent.appendChild(wrap);
        return { wrap: wrap, input: input };
    }

    function appendControls(doc, pane) {
        const box = tagged(doc, 'div', 'client-window-controls', null);

        const modeField = tagged(doc, 'div', 'client-window-field', null);
        addFieldLabel(doc, modeField, 'mouse-mode', 'Control');
        const mode = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', 'mouse-mode');
        addOption(doc, mode, '0', 'Regular', false);
        addOption(doc, mode, '1', 'Classic', true);
        addOption(doc, mode, '2', 'Smart Left', false);
        mode.value = '1';
        modeField.appendChild(mode);
        box.appendChild(modeField);

        const lootWrap = tagged(doc, 'div', 'client-window-field', 'loot-mode-wrap');
        addFieldLabel(doc, lootWrap, 'loot-mode', 'Loot');
        const loot = tagged(doc, 'select', 'form-select form-select-retro form-select-sm', 'loot-mode');
        addOption(doc, loot, '0', 'Loot: Right', true);
        addOption(doc, loot, '1', 'Loot: SHIFT+Right', false);
        addOption(doc, loot, '2', 'Loot: Left', false);
        loot.value = '0';
        lootWrap.appendChild(loot);
        box.appendChild(lootWrap);

        const talk = addSwitch(doc, box, 'talk-right', 'Talk on right-click', null);
        talk.wrap.id = 'talk-right-wrap';
        talk.wrap.hidden = true;

        const stack = addSwitch(doc, box, 'move-stack', 'Move stack without dialog', MOVE_STACK_TITLE);
        const chase = addSwitch(doc, box, 'auto-chase', 'Auto Chase', null);

        pane.appendChild(box);
        return {
            mode: mode,
            loot: loot,
            lootWrap: lootWrap,
            talk: talk.input,
            talkWrap: talk.wrap,
            stack: stack.input,
            chase: chase.input
        };
    }

    function appendCharacterLines(doc, panel) {
        const body = doc.createElement('div');
        body.className = 'float-body client-window-lines';
        const fields = {};
        CHARACTER_FIELDS.forEach(function (pair) {
            const row = doc.createElement('p');
            row.className = 'client-window-line';
            const label = doc.createElement('span');
            label.className = 'client-window-label';
            label.textContent = pair[1];
            const value = doc.createElement('span');
            value.className = 'client-window-value';
            if (typeof value.setAttribute === 'function') value.setAttribute('data-field', pair[0]);
            value.textContent = '';
            row.appendChild(label);
            row.appendChild(value);
            body.appendChild(row);
            fields[pair[0]] = value;
        });
        panel.appendChild(body);
        return fields;
    }

    let attached = null;

    function attach(opts) {
        if (attached) return attached;
        const o = opts || {};
        const doc = o.document || (typeof document !== 'undefined' ? document : null);
        const win = o.window || (typeof window !== 'undefined' ? window : null);
        const place = o.place || (globalRoot && globalRoot.EngineFloatPanelPlace) || null;
        attached = mount({
            document: doc,
            window: win,
            place: place,
            root: o.root,
            getCharacter: o.getCharacter,
            classes: o.classes
        });
        if (attached && !o.classes && typeof fetch === 'function') {
            fetch('/content/classes-ui.json').then(function (res) {
                if (!res || !res.ok) return null;
                return res.json();
            }).then(function (data) {
                if (data && attached && attached.setClasses) attached.setClasses(data);
            }).catch(function () {});
        }
        return attached;
    }

    function syncCharacter(character) {
        if (attached && attached.syncCharacter) attached.syncCharacter(character);
    }

    return {
        mount: mount,
        attach: attach,
        attached: function () { return attached; },
        syncCharacter: syncCharacter,
        vocationLabel: vocationLabel
    };
});
