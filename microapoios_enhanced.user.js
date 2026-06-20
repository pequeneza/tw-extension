// ==UserScript==
// @name         Micro Apoios — Support Sender
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Send support templates to multiple target coordinates with batch automation
// @author       Enhanced from original by Costache Madalin
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (!window.game_data) return;
    if (window.__mapoiosRunning) return;
    window.__mapoiosRunning = true;

    // ─── Page detection via URLSearchParams (order-independent) ────────────────
    const _p        = new URLSearchParams(location.search);
    const isMassPage = _p.get('screen') === 'place' && _p.get('mode') === 'call' && !_p.get('try');
    const isConfirm  = _p.get('screen') === 'place' && _p.get('try') === 'confirm';

    if (!isMassPage && !isConfirm) return;

    // ─── Storage keys (world-scoped) ────────────────────────────────────────────
    const W              = game_data.world;
    const BATCH_KEY      = W + '_mapoios_batch_v1';
    const TEMPLATES_KEY  = W + '_mapoios_templates_v1';
    const SETTINGS_KEY   = W + 'support_sender_settings2';
    const THEME_KEY      = 'supportSenderTheme';
    const GROUP_KEY      = W + '_mapoios_group';

    // ─── Batch helpers ───────────────────────────────────────────────────────────
    function getBatch()   { try { return JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); } catch { return null; } }
    function setBatch(b)  { localStorage.setItem(BATCH_KEY, JSON.stringify(b)); }
    function clearBatch() { localStorage.removeItem(BATCH_KEY); }

    // ─── Confirm page: auto-confirm and advance batch ────────────────────────────
    if (isConfirm) {
        const batch = getBatch();
        if (batch && batch.running) {
            setTimeout(function () {
                const btn = document.querySelector('.btn-confirm-yes, input[type=submit][name=action], input[value="Confirmar"], a.btn-confirm-yes');
                if (!btn) return;
                batch.index++;
                if (batch.index >= batch.targets.length) {
                    batch.running  = false;
                    batch.finished = true;
                } else {
                    batch.state = 'filling';
                }
                setBatch(batch);
                btn.click();
            }, 700);
        }
        return; // no UI on confirm page
    }

    // ─── From here: isMassPage only ─────────────────────────────────────────────

    // ─── Troop configuration ─────────────────────────────────────────────────────
    const SKIP_UNITS = ['snob', 'militia', 'knight', 'axe', 'light', 'ram', 'catapult', 'marcher'];
    var units = Array.from(game_data.units).filter(function (u) { return !SKIP_UNITS.includes(u); });
    var heavyCav = 4;

    // ─── Theme variables ─────────────────────────────────────────────────────────
    var textColor            = '#ffffff';
    var backgroundInput      = '#000000';
    var borderColor          = '#C5979D';
    var backgroundContainer  = '#2B193D';
    var backgroundHeader     = '#2C365E';
    var backgroundMainTable  = '#484D6D';
    var backgroundInnerTable = '#4B8F8C';
    var widthInterface       = 50;
    var headerColorAlternateTable = -30;
    var backgroundAlternateTableEven;
    var backgroundAlternateTableOdd;

    var defaultTheme = '[["theme1",["#E0E0E0","#000000","#C5979D","#2B193D","#2C365E","#484D6D","#4B8F8C","50"]],["currentTheme","theme1"],["theme2",["#E0E0E0","#000000","#F76F8E","#113537","#37505C","#445552","#294D4A","50"]],["theme3",["#E0E0E0","#000000","#ACFCD9","#190933","#665687","#7C77B9","#623B5A","50"]],["theme4",["#E0E0E0","#000000","#181F1C","#60712F","#274029","#315C2B","#214F4B","50"]],["theme5",["#E0E0E0","#000000","#9AD1D4","#007EA7","#003249","#1F5673","#1C448E","50"]],["theme6",["#E0E0E0","#000000","#EA8C55","#81171B","#540804","#710627","#9E1946","50"]],["theme7",["#E0E0E0","#000000","#754043","#37423D","#171614","#3A2618","#523A34","50"]],["theme8",["#E0E0E0","#000000","#9E0031","#8E0045","#44001A","#600047","#770058","50"]],["theme9",["#E0E0E0","#000000","#C1BDB3","#5F5B6B","#323031","#3D3B3C","#575366","50"]],["theme10",["#E0E0E0","#000000","#E6BCCD","#29274C","#012A36","#14453D","#7E52A0","50"]]]';

    // ─── Batch state machine (mass support page) ─────────────────────────────────
    (function runBatchHandler() {
        var batch = getBatch();
        if (!batch || !batch.running) return;

        var expectedTarget = batch.targets[batch.index];
        var currentTarget  = getCurrentTargetCoord();

        if (currentTarget && normalizeCoord(currentTarget) === normalizeCoord(expectedTarget)) {
            setTimeout(function () { autoFillAndSend(batch); }, 900);
        } else {
            setTimeout(function () { navigateToTarget(expectedTarget, batch.group); }, 400);
        }
    })();

    function normalizeCoord(c) {
        if (!c) return '';
        var parts = String(c).split('|');
        return parseInt(parts[0], 10) + '|' + parseInt(parts[1], 10);
    }

    function getCurrentTargetCoord() {
        // Desktop: read from page header text (shows "X|Y" in village-name element)
        var vn = document.querySelector('.village-name, #target_name');
        if (vn) { var m = vn.textContent.match(/\d+\|\d+/); if (m) return m[0]; }
        // Mobile: coordinate inputs
        var ix = document.getElementById('inputx'), iy = document.getElementById('inputy');
        if (ix && iy && ix.value && iy.value) return ix.value.trim() + '|' + iy.value.trim();
        // Try URL target param (numeric VID — can't compare with coord directly)
        return null;
    }

    function navigateToTarget(coord, group) {
        var myVid = game_data.village.id;
        var parts = coord.split('|');

        // Try mobile coord inputs first (no full reload)
        var ix = document.getElementById('inputx'), iy = document.getElementById('inputy');
        if (ix && iy) {
            ix.value = parts[0].trim();
            iy.value = parts[1].trim();
            var form = ix.closest ? ix.closest('form') : ix.form;
            if (form) { form.submit(); return; }
        }

        // URL navigation — TW PT resolves "target=X|Y" on the server
        var url = '/game.php?village=' + myVid +
                  '&screen=place&order=distance&dir=1' +
                  '&target=' + encodeURIComponent(coord) +
                  '&mode=call' +
                  (group ? '&group=' + encodeURIComponent(group) : '');
        location.href = url;
    }

    function autoFillAndSend(batch) {
        var tpl = batch.template;
        if (!tpl || Object.keys(tpl).length === 0) {
            console.log('[MicroApoios] No template set.');
            return;
        }

        // Select all villages
        var selectAll = document.getElementById('place_call_select_all');
        if (selectAll && !selectAll.checked) selectAll.click();

        // Zero all visible unit inputs
        document.querySelectorAll('#village_troup_list input[type=number]').forEach(function (i) { i.value = 0; });

        // Apply template to each visible village row.
        // Template values are stored in thousands (send row UX: 1 = 1000 troops).
        document.querySelectorAll('#village_troup_list tbody tr').forEach(function (row) {
            Object.keys(tpl).forEach(function (unit) {
                var amount = (parseInt(tpl[unit], 10) || 0) * 1000; // k → actual count
                if (!amount) return;
                var input = row.querySelector('.call-unit-box-' + unit);
                if (!input) return;
                var availEl = row.querySelector("[data-unit='" + unit + "']");
                var avail = availEl ? (parseInt(availEl.textContent, 10) || 0) : amount;
                input.value = Math.min(amount, avail);
            });
        });

        // Find and click the send/submit button
        setTimeout(function () {
            var submitBtn = (
                document.querySelector('#place_call_send input[type=submit]') ||
                document.querySelector('form[id*=call] input[type=submit]') ||
                document.querySelector('input[type=submit][name=action]') ||
                Array.from(document.querySelectorAll('input[type=submit], button[type=submit]'))
                    .find(function (b) { return b.offsetParent !== null; })
            );
            if (submitBtn) {
                batch.state = 'confirming';
                setBatch(batch);
                submitBtn.click();
            } else {
                showBatchNotice(
                    'Batch: template filled — click Send manually (' +
                    (batch.index + 1) + '/' + batch.targets.length + ')'
                );
            }
        }, 600);
    }

    function showBatchNotice(msg) {
        var el = document.getElementById('mapoios_notice');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mapoios_notice';
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#aa44aa;color:#fff;padding:8px;text-align:center;font-weight:bold;font-size:13px;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
    }

    // ─── Wait for jQuery then build UI ───────────────────────────────────────────
    (function waitForJquery() {
        var tries = 0;
        (function poll() {
            if (typeof $ !== 'undefined' && typeof TribalWars !== 'undefined') {
                buildUI();
                return;
            }
            if (++tries > 80) { console.error('[MicroApoios] jQuery not found'); return; }
            setTimeout(poll, 150);
        })();
    })();

    function buildUI() {
        initializationTheme();
        injectCSS();
        createMainInterface();
        changeTheme();
        addEvents();

        var batch = getBatch();
        if (batch && batch.finished) {
            setTimeout(function () {
                if (typeof UI !== 'undefined') UI.SuccessMessage('Batch complete! Sent to all ' + batch.targets.length + ' targets.', 3000);
                clearBatch();
            }, 500);
        }
    }

    // ─── Inline CSS ───────────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('mapoios-css')) return;
        var s = document.createElement('style');
        s.id = 'mapoios-css';
        s.textContent = [
            '.mapoios-wrap{position:fixed;top:20px;left:20px;z-index:10000;border-radius:5px;width:50%;min-width:360px;font-size:12px;font-family:Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.7);}',
            '.mapoios-header{padding:8px 10px;position:relative;border-radius:5px 5px 0 0;cursor:move;text-align:center;}',
            '.mapoios-header h2{margin:2px 0;font-size:15px;}',
            '.mapoios-body{}',
            '.mapoios-tabs{display:flex;padding:4px 6px 0;gap:2px;}',
            '.mapoios-tab-btn{cursor:pointer;padding:5px 10px;border:none;border-radius:3px 3px 0 0;font-size:11px;opacity:.75;}',
            '.mapoios-tab-btn.active{opacity:1;font-weight:bold;}',
            '.mapoios-panel{display:none;padding:6px;}',
            '.mapoios-panel.active{display:block;}',
            '.mapoios-footer{padding:4px;text-align:center;border-radius:0 0 5px 5px;font-size:10px;opacity:.6;}',
            '.scriptTable{width:100%;border-collapse:collapse;}',
            '.scriptTable td{padding:3px 5px;border:1px solid rgba(255,255,255,.15);}',
            '.scriptInput{padding:2px 4px;border-radius:3px;font-size:11px;width:55px;}',
            '.fm_unit{text-align:center;padding:2px;}',
            '.hideMobile{}',
            /* chip input */
            '.chip-input-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;border-radius:4px;min-height:30px;cursor:text;}',
            '.chip{display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:10px;font-size:11px;}',
            '.chip-x{background:none;border:none;cursor:pointer;font-size:13px;line-height:1;padding:0 2px;opacity:.7;}',
            '.chip-x:hover{opacity:1;}',
            '.chip-draft{background:none;border:none;outline:none;color:inherit;font-size:11px;min-width:80px;flex:1;}',
            /* batch status bar */
            '.batch-progress{padding:4px 8px;border-radius:3px;margin:4px 0;font-size:11px;}',
            '.batch-log{font-size:10px;margin-top:4px;max-height:70px;overflow-y:auto;padding:4px;border-radius:3px;}',
            '.tmpl-preview{font-size:10px;padding:4px;margin-top:4px;border-radius:3px;word-break:break-all;min-height:16px;}',
            '@media(max-width:600px){.hideMobile{display:none!important}.mapoios-wrap{width:98%;left:1%;}}',
        ].join('');
        document.head.appendChild(s);
    }

    // ─── Theme init ───────────────────────────────────────────────────────────────
    function initializationTheme() {
        var raw = localStorage.getItem(THEME_KEY);
        if (raw) {
            var m = new Map(JSON.parse(raw));
            // Migrate 7-element entries
            m.forEach(function (v, k) {
                if (k !== 'currentTheme' && Array.isArray(v) && v.length === 7) { v.push(50); m.set(k, v); }
            });
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
            applyMapTheme(m);
        } else {
            localStorage.setItem(THEME_KEY, defaultTheme);
            applyMapTheme(new Map(JSON.parse(defaultTheme)));
        }
        if (game_data.device !== 'desktop') widthInterface = 98;
        backgroundAlternateTableEven = backgroundContainer;
        backgroundAlternateTableOdd  = getColorDarker(backgroundContainer, headerColorAlternateTable);
    }

    function applyMapTheme(m) {
        var cur = m.get('currentTheme') || 'theme1';
        var c   = m.get(cur) || [];
        if (c.length >= 8) {
            textColor = c[0]; backgroundInput = c[1]; borderColor = c[2];
            backgroundContainer = c[3]; backgroundHeader = c[4];
            backgroundMainTable = c[5]; backgroundInnerTable = c[6];
            widthInterface = c[7];
        }
    }

    // ─── Main interface ───────────────────────────────────────────────────────────
    function createMainInterface() {
        var hasArcher = game_data.units.includes('archer');
        var rowsButtons   = hasArcher ? 7 : 6;
        var rowsDatetimes = hasArcher ? 4 : 3;

        var dispUnits = units.filter(function (u) {
            return !['knight','snob','militia','axe','light','ram','catapult','marcher'].includes(u);
        });

        function unitImgCells() {
            return dispUnits.map(function (u) {
                return '<td class="fm_unit"><img src="https://dsen.innogamescdn.com/asset/1d2499b/graphic/unit/unit_' + u + '.png"></td>';
            }).join('');
        }

        function inputRowCells(suffix, cls, type) {
            return dispUnits.map(function (u) {
                return '<td align="center"><input id="' + u + suffix + '" value="0" type="' + type + '" class="scriptInput ' + cls + '" style="width:48px"' + (type === 'text' ? ' disabled' : '') + '></td>';
            }).join('');
        }

        var html =
            '<div id="div_container" class="mapoios-wrap" style="background:' + backgroundContainer + ';border:2px solid ' + borderColor + ';width:' + widthInterface + '%">' +
            // Header
            '<div class="mapoios-header" style="background:' + backgroundHeader + '">' +
            '<h2 style="color:' + textColor + '">Support Sender</h2>' +
            '<div style="position:absolute;top:10px;right:10px"><a href="#" onclick="$(\'#div_container\').remove();return false;"><img src="https://img.icons8.com/emoji/24/000000/cross-mark-button-emoji.png"/></a></div>' +
            '<div style="position:absolute;top:8px;right:35px" id="div_minimize"><a href="#"><img src="https://img.icons8.com/plasticine/28/000000/minimize-window.png"/></a></div>' +
            '<div style="position:absolute;top:10px;right:60px"><a href="#" onclick="$(\'#theme_settings\').toggle();return false;"><img src="https://img.icons8.com/material-sharp/24/fa314a/change-theme.png"/></a></div>' +
            '</div>' +
            '<div id="theme_settings" style="background:' + backgroundMainTable + '"></div>' +
            '<div id="mapoios-body">' +
            // Tabs
            '<div class="mapoios-tabs" style="background:' + backgroundHeader + '">' +
            '<button class="mapoios-tab-btn active" data-tab="tab_troops" style="background:' + backgroundMainTable + ';color:' + textColor + '">Troops</button>' +
            '<button class="mapoios-tab-btn" data-tab="tab_templates" style="background:' + backgroundContainer + ';color:' + textColor + '">Templates</button>' +
            '<button class="mapoios-tab-btn" data-tab="tab_batch" style="background:' + backgroundContainer + ';color:' + textColor + '">Batch Send</button>' +
            '</div>' +

            // ── Tab 1: Troops ──────────────────────────────────────────────────
            '<div id="tab_troops" class="mapoios-panel active" style="background:' + backgroundMainTable + '">' +
            '<table id="table_upload" class="scriptTable">' +
            '<tr style="background:' + backgroundInnerTable + '"><td style="color:' + textColor + '">troops</td>' + unitImgCells() + '<td style="color:' + textColor + '">pop</td></tr>' +
            '<tr><td style="color:' + textColor + '">total</td>' + inputRowCells('total', 'totalTroops', 'text') +
            '<td><input id="packets_total" value="0" type="text" class="scriptInput" disabled style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr><td style="color:' + textColor + '">send</td>' + inputRowCells('total', 'sendTroops', 'number') +
            '<td><input id="packets_send" value="0" type="number" class="scriptInput" style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr><td style="color:' + textColor + '">reserve</td>' + inputRowCells('Reserve', 'reserveTroops', 'number') +
            '<td><input id="packets_reserve" value="0" type="text" class="scriptInput" disabled style="width:48px"> <span class="hideMobile" style="color:' + textColor + '">k</span></td></tr>' +
            '<tr>' +
            '<td colspan="1"><center><span style="color:' + textColor + '">sigil:</span><input type="number" id="flag_boost" class="scriptInput" min="0" max="100" value="0" style="width:40px;text-align:center"></center></td>' +
            '<td colspan="2"><center><input type="checkbox" id="checkbox_window"> <span style="color:' + textColor + '">land between:</span></center></td>' +
            '<td colspan="' + rowsDatetimes + '"><center style="margin:4px">start: <input type="datetime-local" id="start_window" class="scriptInput" style="width:auto"></center>' +
            '<center style="margin:4px">end: <input type="datetime-local" id="stop_window" class="scriptInput" style="width:auto"></center></td>' +
            '</tr>' +
            '<tr><td colspan="' + rowsButtons + '" align="center">' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_fill_inputs">Fill inputs</button> ' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_calculate">Calculate</button>' +
            '</td></tr>' +
            '</table></div>' +

            // ── Tab 2: Templates ───────────────────────────────────────────────
            '<div id="tab_templates" class="mapoios-panel" style="background:' + backgroundMainTable + ';color:' + textColor + ';padding:8px">' +
            '<p style="margin:0 0 6px;font-size:11px">Save the current <b>send</b> row as a named template.</p>' +
            '<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">' +
            '<input type="text" id="tmpl_name" class="scriptInput" placeholder="Template name" style="width:110px;flex:none;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '">' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_save_tmpl">Save</button>' +
            '</div>' +
            '<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">' +
            '<select id="tmpl_select" class="scriptInput" style="width:130px;flex:none;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"><option value="">— select —</option></select>' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_load_tmpl">Load</button>' +
            '<button id="btn_del_tmpl" style="background:#833;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:11px">Delete</button>' +
            '</div>' +
            '<div id="tmpl_preview" class="tmpl-preview" style="background:' + backgroundContainer + ';border:1px solid ' + borderColor + '"></div>' +
            '</div>' +

            // ── Tab 3: Batch Send ──────────────────────────────────────────────
            '<div id="tab_batch" class="mapoios-panel" style="background:' + backgroundMainTable + ';color:' + textColor + ';padding:8px">' +
            '<p style="margin:0 0 4px;font-size:11px">Enter target coords (type → Enter). Script fills & sends each in turn.</p>' +
            // Chip coord input
            '<div id="batch_chips" class="chip-input-wrap" style="background:' + backgroundInput + ';border:1px solid ' + borderColor + ';border-radius:4px"></div>' +
            // Group + template row
            '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">' +
            '<span style="font-size:11px">Group ID:</span>' +
            '<input type="text" id="batch_group" class="scriptInput" placeholder="72789" style="width:70px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '">' +
            '<span style="font-size:11px">Template:</span>' +
            '<select id="batch_tmpl" class="scriptInput" style="width:110px;background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"><option value="__send_row__">— use send row —</option></select>' +
            '</div>' +
            // Buttons
            '<div style="display:flex;gap:6px;align-items:center;margin-top:6px">' +
            '<button class="btn evt-confirm-btn btn-confirm-yes" id="btn_start_batch">&#9654; Start</button>' +
            '<button id="btn_stop_batch" style="display:none;background:#833;color:#fff;border:none;border-radius:3px;padding:4px 10px;cursor:pointer;font-size:11px">&#9632; Stop</button>' +
            '<span id="batch_progress" class="batch-progress" style="background:' + backgroundContainer + ';color:' + textColor + '"></span>' +
            '</div>' +
            '<div id="batch_log" class="batch-log" style="background:' + backgroundContainer + ';border:1px solid ' + borderColor + '"></div>' +
            '</div>' +

            '</div>' + // mapoios-body
            '<div class="mapoios-footer" style="background:' + backgroundHeader + ';color:' + textColor + '">made by Costache | enhanced v2</div>' +
            '</div>';

        $('#div_container').remove();
        $('#contentContainer').eq(0).prepend(html);
        $('#mobileContent').eq(0).prepend(html);

        $('#div_container').css('position', 'fixed');
        if (typeof $.fn.draggable === 'function') {
            $('#div_container').draggable({ handle: '.mapoios-header' });
        }

        $('#div_minimize').on('click', function () {
            var pct = Math.ceil($('#div_container').width() / $('body').width() * 100);
            if (pct >= widthInterface) { $('#div_container').css('width', '10%'); $('#mapoios-body').hide(); }
            else { $('#div_container').css('width', widthInterface + '%'); $('#mapoios-body').show(); }
        });

        // Tab switching
        $('#div_container').on('click', '.mapoios-tab-btn', function () {
            var target = $(this).data('tab');
            $('.mapoios-tab-btn')
                .css('background', backgroundContainer)
                .css('opacity', '.75')
                .removeClass('active');
            $(this).css('background', backgroundMainTable).css('opacity', '1').addClass('active');
            $('.mapoios-panel').removeClass('active').hide();
            $('#' + target).addClass('active').show();
        });

        // Restore saved settings
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
        if (saved) {
            var cbs = $('#table_upload input[type=checkbox]').get();
            (saved[0] || []).forEach(function (v, i) { if (cbs[i]) cbs[i].checked = v; });
            var inps = $('#table_upload input').get();
            (saved[1] || []).forEach(function (v, i) { if (inps[i]) inps[i].value = v; });
            $('.totalTroops').val(0); $('#packets_total').val(0);
        }

        // Auto-save settings on change
        $('#table_upload input').on('click input change', function () {
            countTotalTroops();
            var cbs2  = $('#table_upload input[type=checkbox]').map(function () { return this.checked; }).get();
            var vals2 = $('#table_upload input').map(function () { return this.value; }).get();
            var data  = JSON.stringify([cbs2, vals2]);
            if (data !== localStorage.getItem(SETTINGS_KEY)) localStorage.setItem(SETTINGS_KEY, data);
        });

        if (game_data.device !== 'desktop') { $('.hideMobile').hide(); $('#table_upload input[type=text]').css('width', '100%'); }

        // Bind action buttons via jQuery (avoids Tampermonkey inline-onclick scoping issues)
        $('#btn_fill_inputs').on('click', fillInputs);
        $('#btn_calculate').on('click', countTotalTroops);

        // Initialize sub-systems
        initTemplateTab();
        initBatchTab();
    }

    // ─── Theme panel ──────────────────────────────────────────────────────────────
    function changeTheme() {
        var themeNames = [1,2,3,4,5,6,7,8,9,10].map(function(n){ return 'theme'+n; });
        var fieldLabels = ['textColor','backgroundInput','borderColor','backgroundContainer','backgroundHeader','backgroundMainTable','backgroundInnerTable'];
        var fieldVals   = [textColor, backgroundInput, borderColor, backgroundContainer, backgroundHeader, backgroundMainTable, backgroundInnerTable];

        var rows = fieldLabels.map(function (lbl, i) {
            return '<tr><td style="color:' + textColor + '">' + lbl + '</td>' +
                   '<td style="background-color:' + fieldVals[i] + '" class="td_background" style="width:20px">&nbsp;</td>' +
                   '<td><input type="text" class="scriptInput input_theme" value="' + fieldVals[i] + '" style="background:' + backgroundInput + ';color:' + textColor + ';border:1px solid ' + borderColor + '"></td></tr>';
        }).join('');

        var html =
            '<h3 style="color:' + textColor + ';padding:8px 10px 4px;margin:0">Theme (re-run script after saving)</h3>' +
            '<table class="scriptTable" style="background:' + backgroundMainTable + '">' +
            '<tr><td style="color:' + textColor + '"><select id="select_theme" style="background:' + backgroundInput + ';color:' + textColor + '">' +
            themeNames.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join('') +
            '</select></td><td style="color:' + textColor + '">preview</td><td style="color:' + textColor + '">hex</td></tr>' +
            rows +
            '<tr><td style="color:' + textColor + '">width %</td>' +
            '<td colspan="2"><input type="range" min="25" max="100" class="slider input_theme" id="input_slider_width" value="' + widthInterface + '"> <span id="td_width">' + widthInterface + '%</span></td></tr>' +
            '<tr><td><button class="btn evt-confirm-btn btn-confirm-yes" id="btn_save_theme">Save</button></td>' +
            '<td><button class="btn evt-confirm-btn btn-confirm-yes" id="btn_reset_theme">Reset</button></td><td></td></tr>' +
            '</table>';

        $('#theme_settings').append(html).hide();

        $('#select_theme').on('change', function () {
            var key = $(this).find(':selected').text();
            var stored = localStorage.getItem(THEME_KEY);
            if (!stored) return;
            var m   = new Map(JSON.parse(stored));
            var cols = m.get(key) || [];
            $('.input_theme').each(function (i, el) { el.value = cols[i] || ''; });
            $('.td_background').each(function (i, el) { el.style.background = cols[i] || ''; });
            m.set('currentTheme', key);
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
        });

        $('#btn_save_theme').on('click', function () {
            var cols = Array.from($('.input_theme')).map(function (e) { return e.value.toUpperCase().trim(); });
            var key  = $('#select_theme').find(':selected').text();
            for (var i = 0; i < cols.length - 1; i++) {
                if (!/#[0-9A-F]{6}/.test(cols[i])) {
                    if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid colour: ' + cols[i]);
                    return;
                }
            }
            var m = localStorage.getItem(THEME_KEY) ? new Map(JSON.parse(localStorage.getItem(THEME_KEY))) : new Map();
            m.set(key, cols); m.set('currentTheme', key);
            localStorage.setItem(THEME_KEY, JSON.stringify(Array.from(m.entries())));
            if (typeof UI !== 'undefined') UI.SuccessMessage('Saved. Run script again.', 1200);
        });

        $('#btn_reset_theme').on('click', function () {
            localStorage.setItem(THEME_KEY, defaultTheme);
            if (typeof UI !== 'undefined') UI.SuccessMessage('Reset done. Run script again.', 1000);
        });

        $('#input_slider_width').on('input', function () { $('#td_width').text($(this).val() + '%'); });

        var stored2 = localStorage.getItem(THEME_KEY);
        if (stored2) {
            var m2 = new Map(JSON.parse(stored2));
            var el = document.querySelector('#select_theme');
            if (el) el.value = m2.get('currentTheme') || 'theme1';
        }
    }

    // ─── Vanilla chip input ───────────────────────────────────────────────────────
    function createChipInput(containerId, initialChips, onChangeCallback, opts) {
        opts = opts || {};
        var placeholder = opts.placeholder || 'type then Enter';
        var validate    = opts.validate    || function () { return true; };

        var container = document.getElementById(containerId);
        if (!container) return null;

        // Internal state — never rely on the caller's array reference
        var state = Array.isArray(initialChips) ? initialChips.slice() : [];

        function render() {
            container.innerHTML = '';

            for (var i = 0; i < state.length; i++) {
                (function (chip, idx) {
                    var span = document.createElement('span');
                    span.className = 'chip';
                    span.style.cssText = 'background:' + borderColor + ';color:' + backgroundContainer + ';';
                    span.textContent = chip;

                    var xBtn = document.createElement('button');
                    xBtn.className = 'chip-x';
                    xBtn.textContent = '×';
                    xBtn.style.color = backgroundContainer;
                    xBtn.type = 'button';
                    xBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        state.splice(idx, 1);
                        render();
                        onChangeCallback(state.slice());
                    });
                    span.appendChild(xBtn);
                    container.appendChild(span);
                })(state[i], i);
            }

            var input = document.createElement('input');
            input.className = 'chip-draft';
            input.placeholder = state.length === 0 ? placeholder : '';
            input.style.cssText = 'color:' + textColor + ';background:transparent;';
            input.addEventListener('keydown', function (e) {
                var val = input.value.trim();
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    if (val && validate(val) && state.indexOf(val) === -1) {
                        state.push(val);
                        render();
                        onChangeCallback(state.slice());
                    } else if (val && !validate(val)) {
                        input.value = '';
                    }
                } else if (e.key === 'Backspace' && input.value === '' && state.length > 0) {
                    state.pop();
                    render();
                    onChangeCallback(state.slice());
                }
            });
            container.appendChild(input);
            container.addEventListener('click', function () { input.focus(); });
        }

        render();
        return {
            getChips: function () { return state.slice(); },
            setChips: function (arr) { state = Array.isArray(arr) ? arr.slice() : []; render(); }
        };
    }

    // ─── Template tab ─────────────────────────────────────────────────────────────
    var _coordChipInput = null;
    var _coordChips     = [];

    function getTemplates()   { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}'); } catch { return {}; } }
    function saveTemplates(t) { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t)); }

    function getTemplateFromSendRow() {
        var tpl = {};
        document.querySelectorAll('.sendTroops').forEach(function (inp) {
            var unit = inp.id.replace('total', '');
            var val  = parseInt(inp.value, 10) || 0;
            if (val > 0) tpl[unit] = val;
        });
        return tpl;
    }

    function applyTemplateToSendRow(tpl) {
        Object.keys(tpl).forEach(function (unit) {
            var inp = document.getElementById(unit + 'total');
            if (inp && inp.classList.contains('sendTroops')) inp.value = tpl[unit];
        });
        countTotalTroops();
    }

    function renderTemplatePreview(name, tpl) {
        var el = document.getElementById('tmpl_preview');
        if (!el) return;
        if (!tpl || Object.keys(tpl).length === 0) { el.textContent = ''; return; }
        el.textContent = name + ': ' + Object.keys(tpl).map(function (u) { return u + ':' + tpl[u] + 'k'; }).join(' | ');
    }

    function refreshTemplateDropdowns() {
        var templates = getTemplates();
        var names     = Object.keys(templates);
        var opts      = names.map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
        $('#tmpl_select').find('option:not([value=""])').remove().end().append(opts);
        $('#batch_tmpl').find('option:not([value="__send_row__"])').remove().end().append(opts);
    }

    function initTemplateTab() {
        refreshTemplateDropdowns();

        $('#btn_save_tmpl').on('click', function () {
            var name = $('#tmpl_name').val().trim();
            if (!name) { alert('Enter a template name.'); return; }
            var tpl = getTemplateFromSendRow();
            if (Object.keys(tpl).length === 0) { alert('Send row is empty.'); return; }
            var all = getTemplates(); all[name] = tpl; saveTemplates(all);
            refreshTemplateDropdowns();
            $('#tmpl_name').val('');
            if (typeof UI !== 'undefined') UI.SuccessMessage('"' + name + '" saved.', 1000);
        });

        $('#btn_load_tmpl').on('click', function () {
            var name = $('#tmpl_select').val();
            if (!name) return;
            var tpl = getTemplates()[name];
            if (!tpl) return;
            applyTemplateToSendRow(tpl);
            renderTemplatePreview(name, tpl);
        });

        $('#tmpl_select').on('change', function () {
            var name = $(this).val();
            if (!name) { $('#tmpl_preview').text(''); return; }
            renderTemplatePreview(name, getTemplates()[name]);
        });

        $('#btn_del_tmpl').on('click', function () {
            var name = $('#tmpl_select').val();
            if (!name || !confirm('Delete "' + name + '"?')) return;
            var all = getTemplates(); delete all[name]; saveTemplates(all);
            refreshTemplateDropdowns();
            $('#tmpl_preview').text('');
        });
    }

    // ─── Batch tab ────────────────────────────────────────────────────────────────
    function initBatchTab() {
        // Pre-fill group from URL or saved value
        var urlGroup    = _p.get('group') || '';
        var savedGroup  = localStorage.getItem(GROUP_KEY) || '';
        var groupVal    = urlGroup || savedGroup;
        $('#batch_group').val(groupVal);
        $('#batch_group').on('input', function () {
            localStorage.setItem(GROUP_KEY, $(this).val().trim());
        });

        // Chip input for coordinates
        _coordChipInput = createChipInput(
            'batch_chips',
            _coordChips,
            function (newChips) { _coordChips = newChips; },
            {
                placeholder: '123|456 then Enter',
                validate: function (v) {
                    if (!/^\d+\|\d+$/.test(v)) {
                        alert('Invalid coord format. Use: 123|456');
                        return false;
                    }
                    return true;
                }
            }
        );

        // Restore chip input if batch was running
        var existingBatch = getBatch();
        if (existingBatch && existingBatch.running) {
            if (existingBatch.targets && _coordChipInput) {
                _coordChipInput.setChips(existingBatch.targets);
            }
            updateBatchUI(existingBatch);
        }

        $('#btn_start_batch').on('click', function () {
            var targets = _coordChips.slice();
            if (targets.length === 0) { alert('Add at least one target coordinate.'); return; }

            var group   = $('#batch_group').val().trim();
            var tmplKey = $('#batch_tmpl').val();
            var tpl;

            if (tmplKey === '__send_row__') {
                tpl = getTemplateFromSendRow();
                if (Object.keys(tpl).length === 0) { alert('Send row is empty — fill troop amounts or load a template.'); return; }
            } else {
                tpl = getTemplates()[tmplKey];
                if (!tpl) { alert('Template not found.'); return; }
            }

            var batch = { running: true, targets: targets, index: 0, template: tpl, group: group, state: 'filling' };
            setBatch(batch);
            logBatch('Starting batch: ' + targets.length + ' targets. First: ' + targets[0]);
            updateBatchUI(batch);
            navigateToTarget(targets[0], group);
        });

        $('#btn_stop_batch').on('click', function () {
            clearBatch();
            updateBatchUI(null);
            logBatch('Batch stopped by user.');
        });
    }

    function updateBatchUI(batch) {
        if (batch && batch.running) {
            $('#btn_start_batch').hide();
            $('#btn_stop_batch').show();
            var coord = batch.targets[batch.index] || '';
            $('#batch_progress').text('Target ' + (batch.index + 1) + ' / ' + batch.targets.length + '  (' + coord + ')');
        } else {
            $('#btn_start_batch').show();
            $('#btn_stop_batch').hide();
            if (batch && batch.finished) {
                $('#batch_progress').text('Done! All ' + batch.targets.length + ' targets sent.');
            } else {
                $('#batch_progress').text('');
            }
        }
    }

    function logBatch(msg) {
        var el = document.getElementById('batch_log');
        if (!el) return;
        el.innerHTML += '<div>' + new Date().toLocaleTimeString() + ' — ' + msg + '</div>';
        el.scrollTop = el.scrollHeight;
    }

    // ─── Original: countTotalTroops ───────────────────────────────────────────────
    function countTotalTroops() {
        var dateStart = new Date(), dateStop = new Date();
        dateStart.setFullYear(dateStart.getFullYear() - 1);
        dateStop.setFullYear(dateStop.getFullYear() + 1);

        var sigil = 0;
        var timeWindow = document.getElementById('checkbox_window').checked;
        if (timeWindow) {
            dateStart = new Date(document.getElementById('start_window').value);
            dateStop  = new Date(document.getElementById('stop_window').value);
            sigil     = parseInt(document.getElementById('flag_boost').value, 10) || 0;
            if (isNaN(dateStart)) { if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid start date', 2000); }
            if (isNaN(dateStop))  { if (typeof UI !== 'undefined') UI.ErrorMessage('Invalid end date', 2000); }
        }

        var mapVillages = new Map();
        var coordDestination;
        if (game_data.device === 'desktop') {
            var vn2 = document.querySelector('.village-name');
            if (vn2) { var vm = vn2.textContent.match(/\d+\|\d+/); if (vm) coordDestination = vm[0]; }
        } else {
            var ix2 = document.getElementById('inputx'), iy2 = document.getElementById('inputy');
            if (ix2 && iy2) coordDestination = ix2.value + '|' + iy2.value;
        }

        var speedConst = getSpeedConstant();
        var sw = speedConst.worldSpeed, su = speedConst.unitSpeed;
        var speedTroop = {
            snob:2100*1000/(sw*su), ram:1800*1000/(sw*su), catapult:1800*1000/(sw*su),
            sword:1320*1000/(sw*su), axe:1080*1000/(sw*su), spear:1080*1000/(sw*su),
            archer:1080*1000/(sw*su), heavy:660*1000/(sw*su), light:600*1000/(sw*su),
            marcher:600*1000/(sw*su), knight:600*1000/(sw*su), spy:540*1000/(sw*su)
        };

        Array.from(document.querySelectorAll('#village_troup_list tbody tr')).forEach(function (row) {
            var m2 = row.children[0] ? row.children[0].innerText.match(/\d+\|\d+/) : null;
            if (!m2) return;
            var coord    = m2[0];
            var distance = calcDistance(coord, coordDestination);
            var objTroops = { distance: distance };

            units.forEach(function (troopName) {
                var cell        = row.querySelector("[data-unit='" + troopName + "']");
                var totalTroops = parseInt(cell ? cell.textContent : 0, 10) || 0;
                var reserveInp  = document.getElementById(troopName + 'Reserve');
                var reserveTroops = reserveInp ? (parseFloat(reserveInp.value) || 0) * 1000 : 0;
                totalTroops = totalTroops > reserveTroops ? totalTroops - reserveTroops : 0;

                var timeTroop = speedTroop[troopName] * distance;
                timeTroop = timeTroop / (1 + sigil / 100.0);

                var stEl = document.getElementById('serverTime');
                var sdEl = document.getElementById('serverDate');
                if (stEl && sdEl) {
                    var sParts = sdEl.innerText.split('/');
                    var sDate  = sParts[1] + '/' + sParts[0] + '/' + sParts[2];
                    var dateCurrent = new Date(new Date(sDate + ' ' + stEl.innerText).getTime() + timeTroop);
                    if (totalTroops > 0 && dateStart < dateCurrent && dateCurrent < dateStop) {
                        objTroops[troopName + '_speed'] = troopName;
                    }
                }
                objTroops[troopName] = totalTroops;
                if (!timeWindow) { delete objTroops.ram; delete objTroops.catapult; delete objTroops.ram_speed; delete objTroops.catapult_speed; }
            });
            mapVillages.set(coord, objTroops);
        });

        var objTotal = { spear:0, sword:0, archer:0, spy:0, heavy:0 };
        Array.from(mapVillages.keys()).forEach(function (key) {
            var obj = mapVillages.get(key);
            if (obj.ram_speed || obj.catapult_speed || obj.sword_speed) {
                objTotal.spear += obj.spear || 0; objTotal.sword += obj.sword || 0;
                objTotal.spy += obj.spy || 0; objTotal.heavy += obj.heavy || 0;
                if (obj.archer != null) objTotal.archer += obj.archer;
            } else if (obj.spear_speed || obj.archer_speed) {
                objTotal.spear += obj.spear || 0; objTotal.heavy += obj.heavy || 0; objTotal.spy += obj.spy || 0;
                if (obj.archer != null) objTotal.archer += obj.archer;
            } else if (obj.heavy_speed) {
                objTotal.heavy += obj.heavy || 0; objTotal.spy += obj.spy || 0;
            } else if (obj.spy_speed) {
                objTotal.spy += obj.spy || 0;
            }
        });

        if (!game_data.units.includes('archer')) delete objTotal.archer;

        var totalPop = 0;
        Object.keys(objTotal).forEach(function (key) {
            if (units.includes(key)) {
                var inp = document.getElementById(key + 'total');
                if (inp && inp.classList.contains('totalTroops')) inp.value = (objTotal[key] / 1000).toFixed(2);
            }
            if (['spear','sword','archer'].includes(key)) totalPop += objTotal[key];
            else if (key === 'heavy') totalPop += objTotal[key] * heavyCav;
        });

        document.getElementById('packets_total').value = (totalPop / 1000).toFixed(2);
        addEvents();
        return mapVillages;
    }

    // ─── Original: fillInputs ─────────────────────────────────────────────────────
    function fillInputs() {
        var mapVillages = countTotalTroops();
        var troopsTotal = Array.from(document.getElementsByClassName('totalTroops')).map(function (e) { return parseFloat(e.value) * 1000; });
        var sendTotal   = Array.from(document.getElementsByClassName('sendTroops')).map(function (e) {
            return { value: (isNaN(parseFloat(e.value)) ? 0 : parseFloat(e.value) * 1000), troopName: e.id.replace('total', '') };
        });
        var sendTotalObj = {};
        sendTotal.forEach(function (e) { sendTotalObj[e.troopName] = e.value; });

        for (var i = 0; i < troopsTotal.length; i++) {
            if (troopsTotal[i] < sendTotal[i].value) { alert('Not enough troops.'); return; }
        }

        var checkbox = document.getElementById('village_troup_list').children[0].children[0].getElementsByTagName('input');
        var troops   = ['spear','sword','archer','spy','heavy','ram','catapult'];
        for (var j = 0; j < checkbox.length - 1; j++) {
            checkbox[j].checked = troops.includes(checkbox[j].id.split('_')[1]);
        }
        document.getElementById('place_call_select_all').click();
        $('#village_troup_list input[type=number]:visible').val(0);

        var listTotal = [];
        Array.from(mapVillages.keys()).forEach(function (key) {
            var obj = mapVillages.get(key);
            var ot  = { coord: key, axe: 0, light: 0 };
            if (obj.marcher != null) ot.marcher = 0;

            function pick(u) { return (sendTotalObj[u] > 0) ? obj[u] || 0 : 0; }

            if (obj.ram_speed) {
                ot.ram=1;ot.catapult=0;ot.sword=pick('sword');ot.spear=pick('spear');ot.heavy=pick('heavy');ot.spy=pick('spy');ot.speedTroop='ram';
                if (obj.archer!=null) ot.archer=pick('archer');
            } else if (obj.catapult_speed) {
                ot.ram=0;ot.catapult=1;ot.sword=pick('sword');ot.spear=pick('spear');ot.heavy=pick('heavy');ot.spy=pick('spy');ot.speedTroop='catapult';
                if (obj.archer!=null) ot.archer=pick('archer');
            } else if (obj.sword_speed) {
                ot.ram=0;ot.catapult=0;ot.sword=pick('sword');ot.spear=pick('spear');ot.heavy=pick('heavy');ot.spy=pick('spy');ot.speedTroop='sword';
                if (obj.archer!=null) ot.archer=pick('archer');
            } else if (obj.spear_speed) {
                ot.ram=0;ot.catapult=0;ot.sword=0;ot.spear=pick('spear');ot.heavy=pick('heavy');ot.spy=pick('spy');ot.speedTroop='spear';
                if (obj.archer!=null) ot.archer=pick('archer');
            } else if (obj.archer_speed) {
                ot.ram=0;ot.catapult=0;ot.sword=0;ot.spear=pick('spear');ot.heavy=pick('heavy');ot.spy=pick('spy');ot.speedTroop='archer';
                if (obj.archer!=null) ot.archer=pick('archer');
            } else if (obj.heavy_speed) {
                ot.ram=0;ot.catapult=0;ot.sword=0;ot.spear=0;ot.spy=obj.spy||0;ot.heavy=pick('heavy');ot.speedTroop='heavy';
                if (obj.archer!=null) ot.archer=0;
            } else if (obj.spy_speed) {
                ot.ram=0;ot.catapult=0;ot.sword=0;ot.spear=0;ot.heavy=0;ot.spy=pick('spy');ot.speedTroop='spy';
                if (obj.archer!=null) ot.archer=0;
            }
            listTotal.push(ot);
        });

        var listRange = listTotal.filter(function (r) { return r.speedTroop; });
        var factorObj = {};
        sendTotal.forEach(function (e) { factorObj[e.troopName] = e.value / listRange.length; });

        var mapResult = new Map();
        Object.keys(factorObj).forEach(function (troopName) {
            var factorValue = factorObj[troopName];
            listRange.sort(function (a, b) { return a[troopName] > b[troopName] ? 1 : a[troopName] < b[troopName] ? -1 : 0; });
            for (var i2 = 0; i2 < listRange.length; i2++) {
                var tv = listRange[i2][troopName] || 0;
                if (tv < factorValue) {
                    var extra = factorValue - tv;
                    if (listRange.length - i2 - 1 > 0) factorValue += extra / (listRange.length - i2 - 1);
                    listRange[i2][troopName] = tv;
                } else {
                    var mod = factorValue % parseInt(factorValue, 10);
                    if (tv + 1 > factorValue) {
                        listRange[i2][troopName] = parseInt(factorValue, 10) + (Math.random() < mod ? 1 : 0);
                    } else {
                        listRange[i2][troopName] = factorValue;
                    }
                }
                var tw2 = document.getElementById('checkbox_window').checked;
                if (listRange[i2].speedTroop === troopName && listRange[i2][troopName] === 0 && tw2) listRange[i2][troopName] = 1;
                if (!tw2) { listRange[i2].ram = 0; listRange[i2].catapult = 0; }
                mapResult.set(listRange[i2].coord, listRange[i2]);
            }
        });

        Array.from(document.querySelectorAll('.overview_table .selected')).forEach(function (row) {
            var m3 = row.children[0] ? row.children[0].innerText.match(/\d+\|\d+/) : null;
            if (!m3) return;
            var coord3 = m3[0];
            if (!mapResult.has(coord3)) return;
            var obj3 = mapResult.get(coord3);
            var cnt  = 0;
            Object.keys(obj3).forEach(function (k) { if (k !== 'speedTroop' && k !== 'coord') cnt += (obj3[k] || 0); });
            if (cnt > 1) {
                Object.keys(obj3).forEach(function (k) {
                    if (k !== 'speedTroop') $(row).find('.call-unit-box-' + k).val(obj3[k]);
                });
            }
        });
    }

    // ─── Original: addEvents ──────────────────────────────────────────────────────
    function addEvents() {
        $('.sendTroops').off('input').on('input', function () {
            var pop = 0;
            Array.from(document.getElementsByClassName('sendTroops')).forEach(function (inp) {
                var val = parseFloat(inp.value) || 0;
                if (inp.id.includes('spear') || inp.id.includes('sword') || inp.id.includes('archer')) pop += val * 1000;
                if (inp.id.includes('heavy')) pop += val * 1000 * heavyCav;
            });
            document.getElementById('packets_send').value = (pop / 1000).toFixed(2);
        });

        $('#packets_send').off('input').on('input', function () {
            var need       = parseFloat(this.value) || 0;
            var totalPop   = parseFloat(document.getElementById('packets_total').value) || 0;
            var sendTotals = document.getElementsByClassName('sendTroops');
            var totals     = document.getElementsByClassName('totalTroops');
            var ratio      = totalPop > 0 ? need / totalPop : 0;
            for (var i = 0; i < totals.length; i++) {
                if (!sendTotals[i].id.includes('spy')) sendTotals[i].value = parseInt(parseFloat(totals[i].value) * ratio * 100, 10) / 100.0;
                else sendTotals[i].value = 0;
            }
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────
    function httpGet(url) {
        var x = new XMLHttpRequest();
        x.open('GET', url, false);
        x.send(null);
        return x.responseText;
    }

    function getColorDarker(hexInput, percent) {
        var hex = hexInput.replace(/^\s*#|\s*$/g, '');
        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
        var r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
        var p = (100 + percent) / 100;
        r = Math.round(Math.min(255, Math.max(0, r*p)));
        g = Math.round(Math.min(255, Math.max(0, g*p)));
        b = Math.round(Math.min(255, Math.max(0, b*p)));
        return '#' + ('00'+r.toString(16)).slice(-2).toUpperCase() +
                     ('00'+g.toString(16)).slice(-2).toUpperCase() +
                     ('00'+b.toString(16)).slice(-2).toUpperCase();
    }

    function calcDistance(c1, c2) {
        var a = (c1||'0|0').split('|'), b = (c2||'0|0').split('|');
        var dx = parseInt(a[0],10) - parseInt(b[0],10), dy = parseInt(a[1],10) - parseInt(b[1],10);
        return Math.sqrt(dx*dx + dy*dy);
    }

    function getSpeedConstant() {
        var key = W + 'speedWorld';
        var stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
        var data = httpGet('/interface.php?func=get_config');
        var doc2 = new DOMParser().parseFromString(data, 'text/html');
        var obj  = {
            worldSpeed: Number(doc2.getElementsByTagName('speed')[0].innerHTML),
            unitSpeed:  Number(doc2.getElementsByTagName('unit_speed')[0].innerHTML)
        };
        localStorage.setItem(key, JSON.stringify(obj));
        return obj;
    }

    // Expose for inline onclick attributes
    window.countTotalTroops = countTotalTroops;
    window.fillInputs        = fillInputs;

})();
