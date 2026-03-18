// ==UserScript==
// @name         TribalWars Auto Mint Coins (stable + auto refresh)
// @namespace    tribalwars_auto_mint
// @version      1.3.0
// @description  Auto fill max + mint with countdown; refreshes page when mint becomes available again
// @match        https://*.tribalwars.com.pt/game.php*screen=snob*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__twAutoMintRunning) {
    console.log('[AutoMint] Already running; skipping second instance.');
    return;
  }
  window.__twAutoMintRunning = true;

  const INTERVAL = 90000;
  const MINT_CLICK_DELAY = 500;
  const LS_NEXT_RUN = 'tw_auto_mint_next_run_at';

  const REFRESH_ON_MISSING_AFTER_MS = 30000;

  // Safety: don’t refresh too often
  const LS_LAST_REFRESH = 'tw_auto_mint_last_refresh_at';
  const MIN_REFRESH_GAP_MS = 60000;

  const UI_ID = 'tw-auto-mint-ui';
  let nextRunAt = 0;
  let tickTimer = null;
  let intervalTimer = null;
  let isMintInProgress = false;
  let refreshTimer = null;

  function ensureUI() {
    let box = document.getElementById(UI_ID);
    if (box) return box;

    box = document.createElement('div');
    box.id = UI_ID;
    box.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 999999;
      background: rgba(0,0,0,0.75); color: #fff;
      padding: 10px 12px; border-radius: 8px;
      font: 12px/1.3 Arial, sans-serif; min-width: 260px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    `;
    box.innerHTML = `
      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">Auto Mint Coins</div>
      <div>Next check in: <span id="tw-am-countdown">--:--</span></div>
      <div>Last check: <span id="tw-am-lastcheck">never</span></div>
      <div>Status: <span id="tw-am-status">idle</span></div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button id="tw-am-run" style="flex:1; padding:5px 8px; cursor:pointer;">Run now</button>
        <button id="tw-am-refresh" style="padding:5px 8px; cursor:pointer;">Refresh</button>
        <button id="tw-am-stop" style="padding:5px 8px; cursor:pointer;">Stop</button>
      </div>
      <div style="margin-top:6px; opacity:0.9;">
        Auto-refresh: <span id="tw-am-autorefresh">armed</span>
      </div>
    `;
    document.body.appendChild(box);

    box.querySelector('#tw-am-run').addEventListener('click', () => mintCoins(true));
    box.querySelector('#tw-am-refresh').addEventListener('click', () => safeRefresh('manual'));
    box.querySelector('#tw-am-stop').addEventListener('click', stopAll);

    return box;
  }

  function setUI({ status, lastCheck, nextInMs, autoRefreshText }) {
    const box = ensureUI();
    const statusEl = box.querySelector('#tw-am-status');
    const lastEl = box.querySelector('#tw-am-lastcheck');
    const cdEl = box.querySelector('#tw-am-countdown');
    const arEl = box.querySelector('#tw-am-autorefresh');

    if (typeof status === 'string') statusEl.textContent = status;
    if (lastCheck instanceof Date) lastEl.textContent = lastCheck.toLocaleTimeString();
    if (typeof autoRefreshText === 'string') arEl.textContent = autoRefreshText;

    if (typeof nextInMs === 'number') {
      const totalSec = Math.max(0, Math.ceil(nextInMs / 1000));
      const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const s = String(totalSec % 60).padStart(2, '0');
      cdEl.textContent = `${m}:${s}`;
    }
  }

  function scheduleNext(msFromNow) {
    nextRunAt = Date.now() + msFromNow;
    localStorage.setItem(LS_NEXT_RUN, String(nextRunAt));
    setUI({ nextInMs: msFromNow });
  }

  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const remaining = nextRunAt - Date.now();
      setUI({ nextInMs: remaining });
    }, 250);
  }

  function stopAll() {
    if (intervalTimer) clearInterval(intervalTimer);
    if (tickTimer) clearInterval(tickTimer);
    if (refreshTimer) clearTimeout(refreshTimer);
    intervalTimer = null;
    tickTimer = null;
    refreshTimer = null;
    setUI({ status: 'stopped', nextInMs: 0, autoRefreshText: 'off' });
    console.log('[AutoMint] Stopped by user.');
  }

  // Strict selector: only the mint submit button
  function findMintButtonStrict() {
    return (
      document.querySelector('input[type="submit"].btn.btn-default[value="Cunhar"]') ||
      document.querySelector('input[type="submit"][value="Cunhar"]')
    );
  }

  function canRefreshNow() {
    const last = Number(localStorage.getItem(LS_LAST_REFRESH) || '0');
    return !Number.isFinite(last) || (Date.now() - last) >= MIN_REFRESH_GAP_MS;
  }

  function safeRefresh(reason) {
    if (!canRefreshNow()) {
      setUI({ status: 'refresh blocked (too soon)', autoRefreshText: 'armed' });
      return;
    }
    localStorage.setItem(LS_LAST_REFRESH, String(Date.now()));
    console.log('[AutoMint] Refreshing page, reason:', reason);
    setUI({ status: `refreshing (${reason})...`, autoRefreshText: 'refreshing' });

    location.reload();
  }

  function armRefreshBecauseMintMissing() {
    // if already armed, do nothing
    if (refreshTimer) return;

    setUI({ autoRefreshText: `will refresh in ${Math.round(REFRESH_ON_MISSING_AFTER_MS / 1000)}s` });

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      safeRefresh('mint button missing/hidden');
    }, REFRESH_ON_MISSING_AFTER_MS);
  }

  function disarmRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    setUI({ autoRefreshText: 'armed' });
  }

  function mintCoins(manual = false) {
    if (isMintInProgress) {
      setUI({ status: 'skipping (previous run still active)' });
      return;
    }
    isMintInProgress = true;

    try {
      setUI({ status: manual ? 'manual check...' : 'checking...', lastCheck: new Date() });

      const fillMaxButton = document.getElementById('coin_mint_fill_max');
      if (fillMaxButton) fillMaxButton.click();

      setTimeout(() => {
        try {
          const mintBtn = findMintButtonStrict();

          if (mintBtn && !mintBtn.disabled) {
            // If mint button exists, don’t auto-refresh
            disarmRefresh();

            setUI({ status: 'minting...' });
            mintBtn.click();
          } else {
            // Button missing or disabled: arm a refresh so it reappears after cooldown ends
            setUI({ status: mintBtn ? 'mint disabled (cooldown/resources)' : 'mint button not visible' });
            armRefreshBecauseMintMissing();
          }

          scheduleNext(INTERVAL);
        } catch (e) {
          console.error('[AutoMint] Error in delayed mint step:', e);
          setUI({ status: 'error (see console)' });
          armRefreshBecauseMintMissing();
          scheduleNext(INTERVAL);
        } finally {
          isMintInProgress = false;
        }
      }, MINT_CLICK_DELAY);
    } catch (e) {
      console.error('[AutoMint] Error in mintCoins:', e);
      setUI({ status: 'error (see console)' });
      armRefreshBecauseMintMissing();
      scheduleNext(INTERVAL);
      isMintInProgress = false;
    }
  }

  function init() {
    ensureUI();

    const saved = Number(localStorage.getItem(LS_NEXT_RUN) || '0');
    if (Number.isFinite(saved) && saved > Date.now()) nextRunAt = saved;
    else scheduleNext(INTERVAL);

    startTicker();

    // Run once immediately
    mintCoins(false);

    if (intervalTimer) clearInterval(intervalTimer);
    intervalTimer = setInterval(() => mintCoins(false), INTERVAL);
  }

  init();
  window.addEventListener('load', init);
})();