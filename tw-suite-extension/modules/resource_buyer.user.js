// ==UserScript==
// @name         Tribal Wars Resource Buyer (Manual Start + Storage Target)
// @namespace    http://tampermonkey.net/
// @version      1.6.1
// @description  Manual-start resource buyer for Tribal Wars premium market. Buys to reach a % of storage capacity per resource, with priority order and max premium-points guard.
// @author       ricardofauch (modified) + copilot rewrite
// @match        https://*.tribalwars.com.pt/*game.php?*&screen=market&mode=exchange*
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // CONFIGURATION
  // ────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    ENABLED: true,

    buy_wood: true,
    buy_stone: true,
    buy_iron: true,
    priority: ['wood', 'stone', 'iron'],

    // If premium points currently held is ABOVE this, buying is paused.
    MAX_PREMIUM_POINTS: 300,
    // How long to wait before checking again when PP is above max
    PREMIUM_POINTS_TIMEOUT: 600000, // 10 min

    // NEW meaning:
    // Target percentage of STORAGE CAPACITY you want to have AVAILABLE in your village for each resource.
    // Example: 70% with storage 600000 => target 420000 wood/clay/iron (whichever is enabled & chosen by priority).
    PURCHASE_PERCENTAGE: 0.70,

    MIN_STOCK_THRESHOLD: 50,       // minimum exchange stock required to consider buying
    PAGE_RELOAD_INTERVAL: 10000,   // optional safety reload while running

    RANDOM_INTERVAL_MIN: 50,
    RANDOM_INTERVAL_MAX: 180
  };

  let config = Object.assign({}, DEFAULT_CONFIG, GM_getValue('buyerConfig', {}));

  // Session-only running state: OFF on every page load (as requested)
  let running = false;

  let reloadInterval = null;
  let cycleTimeout = null;

  // ────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────
  function createConfigUI() {
    const existing = document.getElementById('tw-resource-buyer-panel');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'tw-resource-buyer-panel';
    div.style.cssText = `
      position: fixed; top: 12%; left: 2%; z-index: 9999;
      background: rgba(245, 222, 179, 0.92); border: 1px solid #5c3317;
      padding: 12px; border-radius: 6px; box-shadow: 0 3px 12px rgba(0,0,0,0.25);
      max-width: 260px; font-family: Verdana, sans-serif; font-size: 13px;
    `;

    const prioLabels = { wood: 'Wood', stone: 'Clay/Stone', iron: 'Iron' };
    let priorityHTML = '';
    config.priority.forEach((res, i) => {
      priorityHTML += `
        <div style="display:flex; align-items:center; margin:4px 0; padding:3px; background:#fff8e8; border-radius:3px;">
          <span style="width:22px; font-weight:bold; color:#444;">${i + 1}.</span>
          <span style="flex:1;">${prioLabels[res] || res}</span>
          <button type="button" data-res="${res}" data-dir="up"   ${i === 0 ? 'disabled' : ''} style="font-size:11px; padding:1px 6px;">↑</button>
          <button type="button" data-res="${res}" data-dir="down" ${i === config.priority.length - 1 ? 'disabled' : ''} style="font-size:11px; padding:1px 6px;">↓</button>
        </div>`;
    });

    div.innerHTML = `
      <h3 style="margin:0 0 10px; color:#5c3317; text-align:center;">Resource Buyer</h3>

      <label style="display:block; margin:6px 0;">
        <input type="checkbox" id="enabled" ${config.ENABLED ? 'checked' : ''}>
        <strong>Enable (does not auto-start)</strong>
      </label>

      <div style="margin:12px 0 6px; font-weight:bold; color:#444;">Allowed resources:</div>
      <label style="display:block; margin-left:10px;"><input type="checkbox" id="buy-wood"  ${config.buy_wood ? 'checked' : ''}> Wood</label>
      <label style="display:block; margin-left:10px;"><input type="checkbox" id="buy-stone" ${config.buy_stone ? 'checked' : ''}> Clay / Stone</label>
      <label style="display:block; margin-left:10px;"><input type="checkbox" id="buy-iron"  ${config.buy_iron ? 'checked' : ''}> Iron</label>

      <div style="margin:14px 0 6px; font-weight:bold; color:#444;">Priority order (top = first checked):</div>
      <div id="priority-container" style="border:1px solid #aaa; padding:8px; background:#fdf8ee; border-radius:4px;">
        ${priorityHTML}
      </div>

      <div style="margin:14px 0 6px; font-weight:bold; color:#444;">General settings:</div>
      <label>Max premium points:
        <input type="number" id="max-pp" value="${config.MAX_PREMIUM_POINTS}" min="0" style="width:70px;">
      </label><br>

      <label>PP timeout (minutes):
        <input type="number" id="timeout-min" value="${Math.round(config.PREMIUM_POINTS_TIMEOUT / 60000)}" min="1" style="width:70px;">
      </label><br>

      <label>Target % of storage:
        <input type="number" id="pct" value="${Math.round(config.PURCHASE_PERCENTAGE * 100)}" min="1" max="100" style="width:70px;"> %
      </label><br>

      <label>Min exchange stock:
        <input type="number" id="min-stock" value="${config.MIN_STOCK_THRESHOLD}" min="1" style="width:70px;">
      </label><br>

      <label>Reload every (sec, while running):
        <input type="number" id="reload-sec" value="${Math.round(config.PAGE_RELOAD_INTERVAL / 1000)}" min="5" style="width:70px;">
      </label>

      <button id="save-btn" style="margin:12px 0 6px; padding:6px 12px; background:#8b5a2b; color:white; border:none; border-radius:4px; cursor:pointer; width:100%;">
        Save Settings
      </button>

      <div style="display:flex; gap:8px; margin-top:6px;">
        <button id="start-btn" style="flex:1; padding:6px 10px; background:#2e7d32; color:white; border:none; border-radius:4px; cursor:pointer;">
          Start
        </button>
        <button id="stop-btn" style="flex:1; padding:6px 10px; background:#b71c1c; color:white; border:none; border-radius:4px; cursor:pointer;">
          Stop
        </button>
      </div>

      <div style="margin-top:8px; text-align:center; font-weight:bold;">
        Status: <span id="run-status">STOPPED</span>
      </div>

      <div id="save-msg" style="color:#2e7d32; text-align:center; display:none; font-weight:bold; margin-top:6px;">Settings saved</div>
      <div style="margin-top:8px; font-size:11px; color:#333;">
        Note: Script is OFF on every page load. Press Start to run.
      </div>
    `;

    document.body.appendChild(div);

    document.getElementById('save-btn').onclick = saveConfig;

    document.getElementById('enabled').onchange = (e) => {
      config.ENABLED = e.target.checked;
      GM_setValue('buyerConfig', config);

      if (!config.ENABLED) setRunning(false); // never auto-start

      showSaveMsg(config.ENABLED ? 'Enabled (press Start)' : 'Disabled');
      renderRunStatus();
    };

    document.getElementById('start-btn').onclick = () => {
      if (!config.ENABLED) {
        showSaveMsg('Enable first');
        return;
      }
      setRunning(true);
    };

    document.getElementById('stop-btn').onclick = () => setRunning(false);

    document.querySelectorAll('#priority-container button').forEach((btn) => {
      btn.onclick = () => movePriority(btn.dataset.res, btn.dataset.dir === 'up' ? -1 : 1);
    });

    renderRunStatus();
  }

  function renderRunStatus() {
    const status = document.getElementById('run-status');
    if (status) status.textContent = running ? 'RUNNING' : 'STOPPED';
  }

  function showSaveMsg(text) {
    const msg = document.getElementById('save-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    setTimeout(() => (msg.style.display = 'none'), 2200);
  }

  function movePriority(res, delta) {
    const idx = config.priority.indexOf(res);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= config.priority.length) return;

    [config.priority[idx], config.priority[newIdx]] = [config.priority[newIdx], config.priority[idx]];

    GM_setValue('buyerConfig', config);
    createConfigUI();
  }

  function saveConfig() {
    config = {
      ENABLED: document.getElementById('enabled').checked,

      buy_wood: document.getElementById('buy-wood').checked,
      buy_stone: document.getElementById('buy-stone').checked,
      buy_iron: document.getElementById('buy-iron').checked,
      priority: [...config.priority],

      MAX_PREMIUM_POINTS: parseInt(document.getElementById('max-pp').value, 10) || DEFAULT_CONFIG.MAX_PREMIUM_POINTS,
      PREMIUM_POINTS_TIMEOUT: (parseInt(document.getElementById('timeout-min').value, 10) || 10) * 60000,
      PURCHASE_PERCENTAGE: (parseInt(document.getElementById('pct').value, 10) || 70) / 100,
      MIN_STOCK_THRESHOLD: parseInt(document.getElementById('min-stock').value, 10) || DEFAULT_CONFIG.MIN_STOCK_THRESHOLD,
      PAGE_RELOAD_INTERVAL: (parseInt(document.getElementById('reload-sec').value, 10) || 10) * 1000,

      RANDOM_INTERVAL_MIN: DEFAULT_CONFIG.RANDOM_INTERVAL_MIN,
      RANDOM_INTERVAL_MAX: DEFAULT_CONFIG.RANDOM_INTERVAL_MAX
    };

    GM_setValue('buyerConfig', config);
    showSaveMsg('Settings saved');

    // don’t auto-start; just update intervals if already running
    restartIntervals();
  }

  // ────────────────────────────────────────────────
  // RUN LOOP (manual)
  // ────────────────────────────────────────────────
  function setRunning(state) {
    running = state;
    renderRunStatus();

    if (cycleTimeout) {
      clearTimeout(cycleTimeout);
      cycleTimeout = null;
    }

    restartIntervals();

    if (running) {
      scheduleNextCycle(50 + Math.random() * 250);
      showSaveMsg('Started');
    } else {
      showSaveMsg('Stopped');
    }
  }

  function scheduleNextCycle(ms) {
    if (!running) return;
    cycleTimeout = setTimeout(async () => {
      try {
        await checkAndBuyResources();
      } catch (e) {
        console.error('[Buyer] Cycle error:', e);
      } finally {
        if (running) scheduleNextCycle(1000 + Math.random() * 2000);
      }
    }, ms);
  }

  function restartIntervals() {
    if (reloadInterval) clearInterval(reloadInterval);
    reloadInterval = null;

    if (!config.ENABLED || !running) return;

    reloadInterval = setInterval(() => {
      console.log('[Buyer] Scheduled safety reload');
      location.reload();
    }, config.PAGE_RELOAD_INTERVAL);
  }

  // ────────────────────────────────────────────────
  // DOM READERS (updated using your HTML snippet)
  // ────────────────────────────────────────────────
  function readStorageCapacity() {
    const el = document.querySelector('#storage');
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readVillageResource(res) {
    // Your snippet confirms these IDs exist:
    // wood:  <span id="wood" class="res">...</span>
    // stone: <span id="stone" class="res">...</span>
    // iron:  <span id="iron" class="res">...</span>
    const el = document.getElementById(res);
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readExchangeStock(res) {
    const stockEl = document.getElementById(`premium_exchange_stock_${res}`);
    if (!stockEl) return null;
    const n = parseInt(stockEl.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readPremiumPoints() {
    // TW layouts differ; try common places. If not found, buying is blocked (fail-safe).
    const candidates = [
      document.querySelector('#premium_points'),
      document.querySelector('.premium_points'),
      document.querySelector('#premium'),
      document.querySelector('.icon.header.premium')?.closest('th'),
      document.querySelector('[class*="premium"] [class*="amount"]')
    ].filter(Boolean);

    for (const el of candidates) {
      const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
    return null;
  }

  // ────────────────────────────────────────────────
  // CORE ACTIONS
  // ────────────────────────────────────────────────
  async function checkPremiumPointsGuard() {
    const pp = readPremiumPoints();

    // Fail-safe: if we cannot detect premium points, we do NOT buy.
    if (pp === null) {
      console.warn('[Buyer] Could not read premium points → blocking buying (fail-safe).');
      return false;
    }

    console.log(`[Buyer] Premium points currently: ${pp}`);

    if (pp > config.MAX_PREMIUM_POINTS) {
      console.warn(`[Buyer] Premium points (${pp}) > MAX (${config.MAX_PREMIUM_POINTS}) → waiting ${Math.round(config.PREMIUM_POINTS_TIMEOUT / 60000)} min`);
      await new Promise((r) => setTimeout(r, config.PREMIUM_POINTS_TIMEOUT));
      return false;
    }

    return true;
  }

  function checkForUsageWarningAndReload() {
    const errors = document.querySelectorAll('.error_box');
    for (const el of errors) {
      const t = (el.textContent || '').toLowerCase();
      if (t.includes('premium') || t.includes('börse') || t.includes('exchange') || t.includes('market')) {
        console.warn('[Buyer] Usage warning detected → reloading');
        location.reload();
        return true;
      }
    }
    return false;
  }

  function clickBuyButton() {
    const btn = document.querySelector('.btn-premium-exchange-buy');
    if (btn) {
      console.log('[Buyer] Clicking BUY button');
      btn.click();
    } else {
      console.warn('[Buyer] Buy button not found');
    }
  }

  function clickConfirmButton() {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      const dialog = document.querySelector('.confirmation-box');
      if (dialog && dialog.style.display !== 'none') {
        clearInterval(iv);
        const yes = document.querySelector('.btn-confirm-yes');
        if (yes) {
          console.log('[Buyer] Clicking YES in confirmation');
          yes.click();
          setTimeout(() => location.reload(), 800 + Math.random() * 400);
        }
      }
      if (attempts > 80) clearInterval(iv);
    }, 40);
  }

  async function checkAndBuyResources() {
    if (!running || !config.ENABLED) return;

    console.log('─ Resource check cycle ─');

    if (checkForUsageWarningAndReload()) return;

    const ppOk = await checkPremiumPointsGuard();
    if (!ppOk) return;

    const storageCap = readStorageCapacity();
    if (storageCap === null) {
      console.warn('[Buyer] Cannot read storage capacity from #storage. Aborting cycle.');
      return;
    }

    let purchased = false;

    for (const res of config.priority) {
      if (!config[`buy_${res}`]) {
        console.log(`[Buyer] ${res.toUpperCase()} disabled in settings`);
        continue;
      }

      const stock = readExchangeStock(res);
      if (stock === null) {
        console.warn(`[Buyer] Cannot read exchange stock for ${res}`);
        continue;
      }

      if (stock <= config.MIN_STOCK_THRESHOLD) {
        console.log(`[Buyer] ${res.toUpperCase()} stock below threshold (${config.MIN_STOCK_THRESHOLD})`);
        continue;
      }

      const current = readVillageResource(res);
      if (current === null) {
        console.warn(`[Buyer] Cannot read current village ${res} amount (expected #${res}).`);
        continue;
      }

      const target = Math.floor(storageCap * config.PURCHASE_PERCENTAGE);
      const missing = target - current;

      console.log(`[Buyer] ${res.toUpperCase()} current: ${current} | target: ${target} (${Math.round(config.PURCHASE_PERCENTAGE * 100)}% of ${storageCap}) | missing: ${missing} | exchange stock: ${stock}`);

      if (missing <= 0) continue;

      const amount = Math.min(missing, stock);
      if (amount <= 0) continue;

      const input = document.querySelector(`input[name="buy_${res}"]`);
      if (!input) {
        console.warn(`[Buyer] Input not found for buy_${res}`);
        continue;
      }

      console.log(`[Buyer] → Buying ${amount} ${res.toUpperCase()} (to reach target % of storage)`);
      input.value = amount;

      const buyDelay = Math.random() * (config.RANDOM_INTERVAL_MAX - config.RANDOM_INTERVAL_MIN) + config.RANDOM_INTERVAL_MIN;
      const confDelay = buyDelay + 80 + Math.random() * 120;

      setTimeout(clickBuyButton, buyDelay);
      setTimeout(clickConfirmButton, confDelay);

      purchased = true;
      break; // one purchase per cycle
    }

    if (!purchased) {
      const delay = 600 + Math.random() * 5000;
      console.log(`[Buyer] Nothing to buy → reload in ~${Math.round(delay / 1000)} s`);
      setTimeout(() => location.reload(), delay);
    }
  }

  // ────────────────────────────────────────────────
  // STARTUP (manual only)
  // ────────────────────────────────────────────────
  console.log('Resource Buyer v1.6.1 • Manual Start • Storage Target Mode');
  createConfigUI();

  // IMPORTANT: do not auto-run.
  // running remains false until Start is clicked.
})();