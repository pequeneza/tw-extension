// ==UserScript==
// @name         TW PT - Noble Resource Sender + Trainer (Extension Patched)
// @version      0.22-extpatch3
// @description  Sends resources for nobles + subtracts incoming (from market mode=call #res_sum) — patched for Chrome extension (localStorage + TW-themed sidebar UI)
// @match        https://*.tribalwars.com.pt/game.php?*screen=snob*
// @exclude      https://*.tribalwars.com.pt/game.php?*screen=snob*mode=coin*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  if (window.__nobleMarketCallLoaded) return;
  window.__nobleMarketCallLoaded = true;

  // ────────────────────────────────────────────────
  // Patch: GM_* → localStorage + DOM style injection
  // ────────────────────────────────────────────────
  const LS_PREFIX = "tw_suite_noble_sender__";
  function lsGet(key, fallback) {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  function lsSet(key, value) {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  }
  function addStyle(cssText) {
    const id = "tw_suite_noble_sender_style";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = cssText;
    document.head.appendChild(st);
  }

  const LANG = {
    title: "Recrutar Nobres",
    requested_nobles: "Nobres pretendidos:",
    ignore_below: "Ignorar aldeias (pontos) <",
    refresh_list: "Atualizar lista",
    send_and_train: "Enviar + Treinar",
    village: "Aldeia",
    resources: "Recursos",
    coords: "Coord",
    points: "Pontos",
    distance: "Distância",
    merchant: "Mercadores",
    select: "Selecionado",
    select_all: "Selecionar tudo",
    deselect_all: "Desmarcar tudo",
    incoming: "A caminho:"
  };

  const NOBLE_COST        = { wood: 40000, clay: 50000, iron: 50000 };
  const MAX_LINES         = 120;
  const AUTO_TRAIN_KEY          = 'autoTraining';   // suffixed with village id
  const AUTO_TRAIN_CNT          = 'autoTrainCount'; // suffixed with village id

  function atKey(base) {
    const vid = (typeof game_data !== 'undefined' && game_data.village)
      ? game_data.village.id : 'unknown';
    return base + '_' + vid;
  }
  const AT_MIN_REFRESH_GAP_MS   = 60_000;
  const AT_REFRESH_ON_MISSING   = 10_000;   // fallback arm delay (no cell found)
  const AT_REFRESH_JITTER       = 10_000;   // +0–10 s random on top of fallback
  const AT_LS_LAST_REFRESH      = LS_PREFIX + 'lastRefresh';
  const AT_MAX_WAIT_MS          = 24 * 60 * 60 * 1000; // stop if next noble > 24 h

  let atRefreshTimer   = null;
  let atTrainProgress  = false;

  function atRandRefresh() { return AT_REFRESH_ON_MISSING + Math.random() * AT_REFRESH_JITTER; }

  let settings = { requestedNobles: 1, ignoreBelowPoints: 1500 };
  let playerVillages = [];
  let isSending = false;

  // Load saved settings (patched)
  const saved = lsGet("nobleSettings", null);
  if (saved) {
    try {
      settings = { ...settings, ...(typeof saved === "string" ? JSON.parse(saved) : saved) };
    } catch { /* ignore */ }
  }
  function saveSettings() { lsSet("nobleSettings", settings); }

  // ---------------- UI STATE (patched storage) ----------------
  const UI_DEFAULT = { minimized: false };
  function loadUIState() {
    const raw = lsGet("nobleUIState", null);
    if (!raw) return { ...UI_DEFAULT };
    try { return { ...UI_DEFAULT, ...(typeof raw === "string" ? JSON.parse(raw) : raw) }; }
    catch { return { ...UI_DEFAULT }; }
  }
  function saveUIState(state) { lsSet("nobleUIState", state); }
  let uiState = loadUIState();

  // ────────────────────────────────────────────────
  // TribalWars-themed UI (snap into right column)
  // ────────────────────────────────────────────────
  addStyle(`
    #tw-noble-snap-wrap { margin: 8px 0; }
    #shk-noble-dashboard { width: 100%; }
    #shk-noble-dashboard .shk-actions { display:flex; gap:6px; margin: 6px 0; }
    #shk-noble-dashboard .shk-actions .btn { flex: 1 1 0; }
    #shk-noble-dashboard .shk-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin: 6px 0; }
    #shk-noble-dashboard label { white-space:nowrap; }
    #shk-noble-dashboard input[type="number"]{ width: 64px; padding: 2px 4px; }

    #shk-villages-table { width:100%; table-layout: fixed; }
    #shk-villages-table th, #shk-villages-table td { overflow:hidden; text-overflow: ellipsis; }
    #shk-villages-table th:nth-child(1), #shk-villages-table td:nth-child(1) { width: 15%; text-align:left; }
    #shk-villages-table th:nth-child(2), #shk-villages-table td:nth-child(2) { width: 8%; }
    #shk-villages-table th:nth-child(3), #shk-villages-table td:nth-child(3) { width: 8%; }
    #shk-villages-table th:nth-child(4), #shk-villages-table td:nth-child(4) { width: 10%; }
    #shk-villages-table th:nth-child(5), #shk-villages-table td:nth-child(5) { width: 10%; }
    #shk-villages-table th:nth-child(6), #shk-villages-table td:nth-child(6) { width: 10%; }
    #shk-villages-table th:nth-child(7), #shk-villages-table td:nth-child(7) { width: 8%; }

    #shk-log { margin-top: 6px; max-height: 180px; overflow-y: auto; font-size: 11px; padding: 6px; }

    #shk-noble-dashboard.shk-minimized .shk-body { display:none; }
    #shk-noble-dashboard .shk-min-btn { float:right; cursor:pointer; text-decoration:none; }
    #shk-incoming-line { margin: 4px 0 2px; font-size: 11px; }
  `);

  function $(s) { return document.querySelector(s); }
  function num(str) {
    if (!str) return 0;
    str = String(str).replace(/[^0-9]/g, '');
    return parseInt(str, 10) || 0;
  }
  function formatNum(n) {
    return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function distance(x1, y1, x2, y2) {
    return Math.round(Math.hypot(x1 - x2, y1 - y2));
  }

  function log(txt, type = 'info') {
    const d = document.createElement('div');
    d.textContent = txt;
    d.style.color = type === 'err' ? '#b30000'
      : type === 'ok' ? '#006600'
        : type === 'warn' ? '#7a4f00'
          : '#333';

    const logEl = $('#shk-log');
    if (!logEl) return;

    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;

    while (logEl.children.length > MAX_LINES) {
      logEl.removeChild(logEl.firstChild);
    }

    console.log("[NobleSender]", txt);
  }

  // ---------------- MINIMIZE ----------------
  function applyUIState() {
    const panel = $('#shk-noble-dashboard');
    if (!panel) return;
    panel.classList.toggle('shk-minimized', !!uiState.minimized);

    const btn = $('#shk-min-btn');
    if (btn) btn.textContent = uiState.minimized ? '+' : '—';
  }

  function toggleMinimize(force) {
    uiState.minimized = (typeof force === 'boolean') ? force : !uiState.minimized;
    saveUIState(uiState);
    applyUIState();
  }

  // ---------------- SELECT ALL ----------------
  function setAllSelections(checked) {
    document.querySelectorAll('#shk-villages-tbody .shk-sel').forEach(cb => cb.checked = checked);
    const btn = $('#selectall-btn');
    if (btn) btn.textContent = checked ? LANG.deselect_all : LANG.select_all;
    btn && (btn.dataset.state = checked ? 'all' : 'none');
  }

  function toggleSelectAll() {
    const cbs = [...document.querySelectorAll('#shk-villages-tbody .shk-sel')];
    if (!cbs.length) return;
    const allChecked = cbs.every(cb => cb.checked);
    setAllSelections(!allChecked);
  }

  // ==================== FETCH INCOMING RESOURCES (mode=call) ====================
  // Preferred: parse table#res_sum (Recursos a caminho) for THIS village page.
  async function fetchIncomingResources() {
    let url = `game.php?village=${game_data.village.id}&screen=market&mode=call`;
    if (game_data.player.sitter > 0) url += `&t=${game_data.player.id}`;

    try {
      const html = await (await fetch(url, { credentials: "include" })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      // Deterministic: #res_sum totals
      const resSum = doc.querySelector('table#res_sum');
      if (resSum) {
        const incWood = num(resSum.querySelector('#total_wood')?.textContent);
        const incClay = num(resSum.querySelector('#total_stone')?.textContent);
        const incIron = num(resSum.querySelector('#total_iron')?.textContent);

        const line = $('#shk-incoming-line');
        if (line) line.textContent = `${LANG.incoming} ${formatNum(incWood)}/${formatNum(incClay)}/${formatNum(incIron)}`;

        log(
          `${LANG.incoming} ${formatNum(incWood)} madeira / ${formatNum(incClay)} argila / ${formatNum(incIron)} ferro`,
          "ok"
        );
        return { wood: incWood, clay: incClay, iron: incIron };
      }

      // Fallback: sum the table if #res_sum isn't present (should be rare)
      const table = doc.querySelector("#market_merchant_call");
      if (!table) {
        log("Não encontrei #res_sum nem a tabela #market_merchant_call no mode=call.", "warn");
        return { wood: 0, clay: 0, iron: 0 };
      }

      let incWood = 0, incClay = 0, incIron = 0;
      table.querySelectorAll("tbody tr").forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 6) return;
        incWood += num(cells[3]?.textContent);
        incClay += num(cells[4]?.textContent);
        incIron += num(cells[5]?.textContent);
      });

      const line = $('#shk-incoming-line');
      if (line) line.textContent = `${LANG.incoming} ${formatNum(incWood)}/${formatNum(incClay)}/${formatNum(incIron)}`;

      log(
        `Incoming (call fallback soma tabela): ${formatNum(incWood)} madeira / ${formatNum(incClay)} argila / ${formatNum(incIron)} ferro`,
        "warn"
      );
      return { wood: incWood, clay: incClay, iron: incIron };
    } catch (e) {
      log("Erro ao carregar incoming resources: " + e.message, "err");
      return { wood: 0, clay: 0, iron: 0 };
    }
  }

  // ==================== FETCH VILLAGES ====================
  async function fetchAllVillages() {
    log("A carregar aldeias...", "warn");
    let url = "game.php?screen=overview_villages&mode=prod&page=-1";
    if (game_data.player.sitter > 0) url = `game.php?t=${game_data.player.id}&screen=overview_villages&mode=prod&page=-1`;

    try {
      const html = await (await fetch(url, { credentials: 'include' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const villages = [];

      doc.querySelectorAll('#production_table tr, table.vis tr').forEach(row => {
        const link = row.querySelector('.quickedit-vn a, a[href*="info_village"]');
        if (!link) return;

        const coordMatch = link.textContent.match(/(\d+\|\d+)/);
        if (!coordMatch) return;

        const coord = coordMatch[1];
        const [x, y] = coord.split('|').map(Number);
        let name = link.textContent.replace(coord, '').trim().replace(/\s*\([^)]*\)/g, '');

        const res = row.querySelectorAll('.res');
        const wood = num(res[0]?.textContent);
        const clay = num(res[1]?.textContent);
        const iron = num(res[2]?.textContent);

        const merchMatch = row.querySelector('a[href*="market"]')?.textContent.match(/(\d+)\s*\/\s*(\d+)/);
        const merchAvail = merchMatch ? +merchMatch[1] : 0;
        const merchTotal = merchMatch ? +merchMatch[2] : 0;

        const points = num(row.querySelector('td:nth-child(3), .points')?.textContent) || 0;

        const id = link.href.match(/village=(\d+)/)?.[1];
          if (id) villages.push({ id, name, coord, x, y, wood, clay, iron, merchAvail, merchTotal, points });
        });

      playerVillages = villages;
      log(`Encontradas ${villages.length} aldeias`, "ok");
      return villages;
    } catch (e) {
      log("Erro ao carregar aldeias: " + e.message, "err");
      return [];
    }
  }

  // ==================== BUILD TABLE ====================
  function buildVillageTable() {
    const tbody = $('#shk-villages-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const logEl = $('#shk-log');
    if (logEl) logEl.innerHTML = '';

    const minPts = parseInt(settings.ignoreBelowPoints, 10) || 0;
    const ignored = playerVillages.filter(v =>
      v.points < minPts || (v.merchAvail || 0) <= 0
    ).length;
    log(`A mostrar ${playerVillages.length - ignored} aldeias | Ignoradas: ${ignored}`, "info");

    const sorted = [...playerVillages]
      .filter(v => v.points >= minPts && (v.merchAvail || 0) > 0)
      .sort((a, b) =>
        distance(game_data.village.x, game_data.village.y, a.x, a.y) -
        distance(game_data.village.x, game_data.village.y, b.x, b.y)
      );

    const fragment = document.createDocumentFragment();
    sorted.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a href="/game.php?village=${v.id}&screen=snob">${v.name}</a></td>
        <td>${v.coord}</td>
        <td>${formatNum(v.points)}</td>
        <td>${distance(game_data.village.x, game_data.village.y, v.x, v.y)}</td>
        <td style="text-align:right">
          ${formatNum(v.wood)}<span class="icon header wood"></span><br>
          ${formatNum(v.clay)}<span class="icon header stone"></span><br>
          ${formatNum(v.iron)}<span class="icon header iron"></span>
        </td>
        <td>${v.merchAvail || 0}/${v.merchTotal || 0}</td>
        <td><input type="checkbox" class="shk-sel" data-id="${v.id}" checked></td>
      `;
      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    const cbs = [...document.querySelectorAll('#shk-villages-tbody .shk-sel')];
    if (cbs.length) {
      const allChecked = cbs.every(cb => cb.checked);
      const btn = $('#selectall-btn');
      if (btn) btn.textContent = allChecked ? LANG.deselect_all : LANG.select_all;
    }
  }

  // ==================== SEND RESOURCE ====================
  function sendResource(sourceID, targetID, woodAmount, stoneAmount, ironAmount) {
    const payload = {
      target_id: targetID,
      wood: Math.round(woodAmount),
      stone: Math.round(stoneAmount),
      iron: Math.round(ironAmount)
    };

    log(`Tentando envio de ${sourceID} → ${payload.wood}/${payload.stone}/${payload.iron}`, "info");

    return new Promise((resolve) => {
      TribalWars.post(
        "market",
        {
          ajaxaction: "map_send",
          village: sourceID,
          h: game_data.csrf
        },
        payload,
        (response) => {
          if (response && response.error) {
            log(`❌ Servidor rejeitou envio: ${response.error}`, "err");
            resolve(false);
            return;
          }
          log("✅ Envio OK!", "ok");
          resolve(true);
        },
        (xhr) => {
          let serverMsg = "Erro desconhecido";
          if (xhr && xhr.responseText) {
            try {
              const json = JSON.parse(xhr.responseText);
              serverMsg = json.error || json.message || xhr.responseText;
            } catch {
              serverMsg = xhr.responseText.substring(0, 300);
            }
          }
          log(`❌ Falha no envio: ${serverMsg}`, "err");
          resolve(false);
        }
      );
    });
  }

  // ==================== MAIN ACTION ====================
  async function startSendingAndTraining() {
    if (isSending) return;
    isSending = true;

    const noblesInput = $('#nobles-input');
    const requested = parseInt(noblesInput?.value, 10) || 1;

    const target = playerVillages.find(v => String(v.id) === String(game_data.village.id));
    if (!target) {
      log("Não encontrou a aldeia atual na lista!", "err");
      isSending = false;
      return;
    }

    const targetWood = requested * NOBLE_COST.wood;
    const targetClay = requested * NOBLE_COST.clay;
    const targetIron = requested * NOBLE_COST.iron;

    // Always subtract incoming from market mode=call (per requirement)
    const incoming = await fetchIncomingResources();

    let remainingW = Math.max(0, targetWood - target.wood - incoming.wood);
    let remainingC = Math.max(0, targetClay - target.clay - incoming.clay);
    let remainingI = Math.max(0, targetIron - target.iron - incoming.iron);

    log(`Iniciando envio para tentar treinar ${requested} nobres na aldeia atual`, "warn");
    log(`Pretendido: ${formatNum(targetWood)} madeira / ${formatNum(targetClay)} argila / ${formatNum(targetIron)} ferro`, "info");
    log(`Stock atual: ${formatNum(target.wood)} madeira / ${formatNum(target.clay)} argila / ${formatNum(target.iron)} ferro`, "info");
    log(`Incoming (call): ${formatNum(incoming.wood)} madeira / ${formatNum(incoming.clay)} argila / ${formatNum(incoming.iron)} ferro`, "ok");
    log(`Falta enviar ≈ ${formatNum(remainingW)} madeira, ${formatNum(remainingC)} argila, ${formatNum(remainingI)} ferro`, "warn");

    // Honor selection checkboxes
    const selected = new Set(
      [...document.querySelectorAll('#shk-villages-tbody .shk-sel:checked')]
        .map(cb => cb.getAttribute('data-id'))
    );

    const minPts = parseInt(settings.ignoreBelowPoints, 10) || 0;
    const sources = [...playerVillages]
      .filter(v =>
        String(v.id) !== String(target.id) &&
        selected.has(String(v.id)) &&
        v.points >= minPts && 
        (v.merchAvail || 0) > 0
      )
      .sort((a, b) =>
        distance(game_data.village.x, game_data.village.y, a.x, a.y) -
        distance(game_data.village.x, game_data.village.y, b.x, b.y)
      );

    let totalSent = { wood: 0, clay: 0, iron: 0 };
    let sentAny = false;

    for (let src of sources) {
      if (remainingW <= 0 && remainingC <= 0 && remainingI <= 0) break;

      const capacity = src.merchAvail * 1000;
      if (capacity < 500) continue;

      let sendW = Math.min(src.wood, remainingW, capacity);
      let sendC = Math.min(src.clay, remainingC, capacity - sendW);
      let sendI = Math.min(src.iron, remainingI, capacity - sendW - sendC);

      const total = sendW + sendC + sendI;
      if (total < 800) continue;

      log(`Tentando enviar de ${src.name} (${src.coord}): ${formatNum(sendW)}/${formatNum(sendC)}/${formatNum(sendI)}`, "info");

      const success = await sendResource(src.id, target.id, sendW, sendC, sendI);
      if (success) {
        remainingW -= sendW;
        remainingC -= sendC;
        remainingI -= sendI;

        totalSent.wood += sendW;
        totalSent.clay += sendC;
        totalSent.iron += sendI;

        sentAny = true;
      } else {
        log(`Envio falhou de ${src.name} – pulando...`, "warn");
      }

      await new Promise(r => setTimeout(r, 1200 + Math.random() * 900));
    }

    if (remainingW > 0 || remainingC > 0 || remainingI > 0) {
      log("⚠ Recursos insuficientes mesmo após tentar enviar de várias aldeias", "err");
      log(`Falta ainda (descontado stock + incoming(call) + envios OK):`, "err");
      log(`→ ${formatNum(remainingW)} madeira / ${formatNum(remainingC)} argila / ${formatNum(remainingI)} ferro`, "err");
    } else if (sentAny) {
      log("✅ Tudo enviado com sucesso! Recursos devem estar a caminho ou já chegaram.", "ok");
    } else {
      log("Nenhum envio executado — já tinhas recursos suficientes (stock + incoming(call)).", "ok");
    }

    log(`Já enviado nesta execução: ${formatNum(totalSent.wood)}/${formatNum(totalSent.clay)}/${formatNum(totalSent.iron)}`, "info");
    isSending = false;
  }

  // ==================== AUTO-TRAIN ====================
  function getVillageResources() {
    if (typeof game_data !== 'undefined' && game_data.village) {
      return {
        wood: game_data.village.wood  || 0,
        clay: game_data.village.stone || 0,
        iron: game_data.village.iron  || 0,
      };
    }
    return {
      wood: num(document.querySelector('#wood')?.textContent),
      clay: num(document.querySelector('#stone')?.textContent),
      iron: num(document.querySelector('#iron')?.textContent),
    };
  }

  /* Parse "Recursos disponíveis hoje às HH:MM" from #train_snob_cell.
     Returns ms until that time, or null if not found / already past. */
  function msUntilReady() {
    const cell = document.querySelector('#train_snob_cell');
    if (!cell) return null;
    const m = cell.textContent.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const now   = new Date();
    const ready = new Date(now);
    ready.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    if (ready <= now) ready.setDate(ready.getDate() + 1);
    return ready.getTime() - now.getTime();
  }

  /* Returns the "Treinar unidade" recruit link if resources are available,
     null otherwise. TW renders <a class="btn btn-recruit"> only when ready. */
  function findRecruitBtn() {
    return document.querySelector('a.btn-recruit, a.btn.btn-recruit');
  }

  function atCanRefreshNow() {
    const last = Number(localStorage.getItem(AT_LS_LAST_REFRESH) || '0');
    return !Number.isFinite(last) || (Date.now() - last) >= AT_MIN_REFRESH_GAP_MS;
  }

  function atSafeRefresh(reason) {
    if (!atCanRefreshNow()) {
      log('Auto-recrutar: refresh bloqueado (muito cedo).', 'warn');
      return;
    }
    localStorage.setItem(AT_LS_LAST_REFRESH, String(Date.now()));
    log(`Auto-recrutar: a recarregar página (${reason})…`, 'warn');
    location.reload();
  }

  function atArmRefresh(reason) {
    if (atRefreshTimer) return;
    const delay = atRandRefresh();
    atRefreshTimer = setTimeout(() => {
      atRefreshTimer = null;
      atSafeRefresh(reason);
    }, delay);
  }

  function atDisarmRefresh() {
    if (atRefreshTimer) clearTimeout(atRefreshTimer);
    atRefreshTimer = null;
  }

  function autoTrainIfReady(manual = false) {
    if (!lsGet(atKey(AUTO_TRAIN_KEY), false)) return;
    if (atTrainProgress) return;
    atTrainProgress = true;

    setTimeout(() => {
      try {
        /* On manual activation check the button first — resources may already
           be available and the user just wants an immediate attempt. */
        if (manual) {
          const recruitBtn = findRecruitBtn();
          if (recruitBtn) {
            atDisarmRefresh();
            log('✅ Botão de recrutar disponível — a treinar nobre…', 'ok');
            recruitBtn.click();
            /* Flag stays active — TW will reload and we check again */
            return;
          }
          log('Botão não disponível agora — a usar agendador…', 'info');
        }

        /* Use the cell time as the authoritative readiness signal.
           TW sometimes leaves the recruit button stale even when resources arrive,
           so on auto-refresh we never trust the button without a timed refresh first. */
        const untilMs = msUntilReady();

        if (untilMs !== null && untilMs > 0) {
          /* Stop if next nobleman is more than 24 h away */
          if (untilMs > AT_MAX_WAIT_MS) {
            log('⏹ Próximo nobre em mais de 24h — auto-recrutar desativado.', 'warn');
            lsSet(atKey(AUTO_TRAIN_KEY), false);
            return;
          }
          const jitter   = 5000 + Math.random() * 10_000;
          const waitMs   = untilMs + jitter;
          const readySec = Math.round(untilMs / 1000);
          log(`⏳ Recursos prontos em ${readySec}s — a aguardar…`, 'warn');
          atDisarmRefresh();
          if (atRefreshTimer) clearTimeout(atRefreshTimer);
          atRefreshTimer = setTimeout(() => {
            atRefreshTimer = null;
            atSafeRefresh('ready time reached');
          }, waitMs);
          return;
        }

        /* Cell time passed / no cell — check button after scheduled refresh */
        const recruitBtn = findRecruitBtn();
        if (recruitBtn) {
          atDisarmRefresh();
          log('✅ Botão de recrutar disponível — a treinar nobre…', 'ok');
          recruitBtn.click();
          /* Flag stays active — TW will reload and we check again */
        } else {
          log('⚠ Tempo passou mas botão ainda não visível — a recarregar…', 'warn');
          atArmRefresh('btn not rendered after ready time');
        }
      } finally {
        atTrainProgress = false;
      }
    }, 500);
  }

  function atStopInterval() {
    if (atRefreshTimer) clearTimeout(atRefreshTimer);
    atRefreshTimer = null;
  }

  /* Run once on page load if the auto-train flag is set for THIS village */
  if (lsGet(atKey(AUTO_TRAIN_KEY), false)) {
    setTimeout(autoTrainIfReady, 1200);
  }

  // ==================== SIDEBAR INSERTION ====================
  function getRightSidebar() {
    // Common TW classic layouts
    return (
      document.querySelector('#right_column') ||
      document.querySelector('#rightcol') ||
      document.querySelector('#content_value') || // fallback (not ideal but works)
      document.body
    );
  }

  function createDashboard() {
    if ($('#shk-noble-dashboard')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tw-noble-snap-wrap';

    wrap.innerHTML = `
      <table id="shk-noble-dashboard" class="vis">
        <thead>
          <tr>
            <th colspan="2">
              <span>${LANG.title}</span>
              <a href="javascript:void(0)" id="shk-min-btn" class="shk-min-btn">—</a>
            </th>
          </tr>
        </thead>
        <tbody class="shk-body">
          <tr>
            <td colspan="2">
              <div class="shk-row">
                <label>${LANG.requested_nobles}</label>
                <input id="nobles-input" type="number" value="${settings.requestedNobles}" min="1">
                <label>${LANG.ignore_below}</label>
                <input id="ignore-input" type="number" value="${settings.ignoreBelowPoints}" min="0">
                
              </div>

              <div class="shk-actions">
                <button id="refresh-btn" class="btn" type="button">${LANG.refresh_list}</button>
                <button id="send-btn" class="btn" type="button">${LANG.send_and_train}</button>
                <button id="selectall-btn" class="btn" type="button">${LANG.deselect_all}</button>
              </div>
              <div class="shk-actions">
                <button id="auto-train-btn" class="btn" type="button">▶ Auto Recrutar</button>
              </div>

              <div id="shk-incoming-line">${LANG.incoming} —</div>

              <table id="shk-villages-table" class="vis">
                <thead>
                  <tr>
                    <th>${LANG.village}</th>
                    <th>${LANG.coords}</th>
                    <th>${LANG.points}</th>
                    <th>${LANG.distance}</th>
                    <th>${LANG.resources}</th>
                    <th>${LANG.merchant}</th>
                    <th>${LANG.select}</th>
                  </tr>
                </thead>
                <tbody id="shk-villages-tbody"></tbody>
              </table>

              <div id="shk-log" class="vis_item"></div>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    getRightSidebar().prepend(wrap);

    applyUIState();

    $('#shk-min-btn').addEventListener('click', () => toggleMinimize());
    $('#selectall-btn').addEventListener('click', () => toggleSelectAll());

    $('#refresh-btn').onclick = async () => {
      log("Atualizando lista...", "warn");
      await fetchAllVillages();
      buildVillageTable();
      await fetchIncomingResources();
    };

    $('#nobles-input').onchange = e => { settings.requestedNobles = +e.target.value || 1; saveSettings(); };
    $('#ignore-input').oninput = e => {
      settings.ignoreBelowPoints = +e.target.value || 0;
      saveSettings();
      buildVillageTable();
    };

    $('#send-btn').onclick = startSendingAndTraining;

    const autoBtn = $('#auto-train-btn');
    function syncAutoBtn() {
      const on = lsGet(atKey(AUTO_TRAIN_KEY), false);
      autoBtn.textContent = on ? '■ Parar Auto Recrutar' : '▶ Auto Recrutar';
      autoBtn.style.background = on ? '#b30000' : '';
    }
    syncAutoBtn();
    autoBtn.onclick = () => {
      const on = lsGet(atKey(AUTO_TRAIN_KEY), false);
      if (on) {
        lsSet(atKey(AUTO_TRAIN_KEY), false);
        atStopInterval();
        log('Auto-recrutar desativado.', 'warn');
      } else {
        lsSet(atKey(AUTO_TRAIN_KEY), true);
        lsSet(atKey(AUTO_TRAIN_CNT), parseInt($('#nobles-input')?.value, 10) || 1);
        log('Auto-recrutar ativado — a verificar recursos…', 'ok');
        autoTrainIfReady(true);
      }
      syncAutoBtn();
    };

    fetchAllVillages()
      .then(buildVillageTable)
      .then(fetchIncomingResources);
  }

  setTimeout(createDashboard, 800);
})();