import React, { useEffect, useState } from "react";
import { STORAGE_KEY, ModuleSettings, MODULE_CONFIGS, ModuleId } from "../types/modules";

/* ─── Global enable/disable key ─────────────────────────────────────────── */
const BOT_ENABLED_KEY = "xbot_enabled";

/* ─── Storage helpers ────────────────────────────────────────────────────── */
function readEnabled(): Promise<boolean> {
  return new Promise((res) =>
    chrome.storage.sync.get(BOT_ENABLED_KEY, (r) =>
      res((r[BOT_ENABLED_KEY] as boolean) === true)
    )
  );
}

function writeEnabled(val: boolean): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set({ [BOT_ENABLED_KEY]: val }, res));
}

function readModuleSettings(): Promise<ModuleSettings> {
  return new Promise((res) =>
    chrome.storage.sync.get(STORAGE_KEY, (r) =>
      res((r[STORAGE_KEY] as ModuleSettings) ?? {})
    )
  );
}

function writeModuleSettings(s: ModuleSettings): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set({ [STORAGE_KEY]: s }, res));
}

/* ─── App ────────────────────────────────────────────────────────────────── */
export function App() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    readEnabled().then(setEnabled);
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;

    // When disabling: save current module states as "snapshot", then set all false
    // When enabling: restore the snapshot
    if (!next) {
      // Turning OFF — snapshot current settings, disable all modules
      const current = await readModuleSettings();
      await chrome.storage.sync.set({ xbot_snapshot: current });
      const allOff: ModuleSettings = {};
      for (const mod of MODULE_CONFIGS) allOff[mod.id] = false;
      await writeModuleSettings(allOff);
    } else {
      // Turning ON — restore snapshot if it exists
      const snap = await new Promise<ModuleSettings | null>((res) =>
        chrome.storage.sync.get("xbot_snapshot", (r) =>
          res((r["xbot_snapshot"] as ModuleSettings) ?? null)
        )
      );
      if (snap) {
        await writeModuleSettings(snap);
      }
    }

    await writeEnabled(next);
    setEnabled(next);
  }

  const isLoading = enabled === null;
  const isOn = enabled === true;

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        <div className="header">
          <span className="logo">⚡</span>
          <span className="name">xBot</span>
        </div>

        <div className="body">
          <button
            className={`big-toggle${isOn ? " on" : ""}${isLoading ? " loading" : ""}`}
            onClick={toggle}
            disabled={isLoading}
            aria-label={isOn ? "Disable xBot" : "Enable xBot"}
          >
            <span className="toggle-ring">
              <span className="toggle-dot" />
            </span>
          </button>

          <div className="status-label">
            {isLoading ? "Loading…" : isOn ? "Active" : "Inactive"}
          </div>
          <div className="status-hint">
            {isLoading
              ? ""
              : isOn
              ? "Modules run on matching pages"
              : "All modules are paused"}
          </div>
        </div>

        <div className="footer">
          Manage modules via the ⚡ button in-game
        </div>
      </div>
    </>
  );
}

/* ─── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 200px;
    min-height: 220px;
    font-family: 'DM Sans', -apple-system, sans-serif;
    font-size: 13px;
    background: #ffffff;
    color: #111827;
    -webkit-font-smoothing: antialiased;
  }

  .shell {
    display: flex;
    flex-direction: column;
    width: 200px;
    min-height: 220px;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid #f3f4f6;
  }
  .logo { font-size: 16px; line-height: 1; }
  .name {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
    letter-spacing: -0.01em;
  }

  /* Body */
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 20px;
    gap: 12px;
  }

  /* Big toggle button */
  .big-toggle {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 2px solid #e5e7eb;
    background: #f9fafb;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    position: relative;
    outline: none;
  }
  .big-toggle:hover:not(:disabled) {
    border-color: #d1d5db;
    background: #f3f4f6;
    transform: scale(1.04);
  }
  .big-toggle:active:not(:disabled) { transform: scale(0.97); }
  .big-toggle:disabled { opacity: 0.5; cursor: default; }

  /* ON state */
  .big-toggle.on {
    border-color: #22c55e;
    background: #f0fdf4;
    box-shadow: 0 0 0 4px rgba(34,197,94,0.12);
  }
  .big-toggle.on:hover:not(:disabled) {
    border-color: #16a34a;
    background: #dcfce7;
    box-shadow: 0 0 0 6px rgba(34,197,94,0.15);
  }

  /* Ring + dot inside the button */
  .toggle-ring {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2.5px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s ease;
  }
  .big-toggle.on .toggle-ring {
    border-color: #16a34a;
  }
  .toggle-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #d1d5db;
    transition: background 0.2s ease, transform 0.2s ease;
  }
  .big-toggle.on .toggle-dot {
    background: #16a34a;
    transform: scale(1.1);
  }

  /* Loading pulse */
  .big-toggle.loading .toggle-ring {
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }

  /* Status */
  .status-label {
    font-size: 15px;
    font-weight: 600;
    color: #374151;
    transition: color 0.2s ease;
  }
  .big-toggle.on ~ .status-label { color: #15803d; }

  .status-hint {
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
    line-height: 1.4;
    min-height: 16px;
  }

  /* Footer */
  .footer {
    padding: 8px 14px 10px;
    border-top: 1px solid #f3f4f6;
    font-size: 10.5px;
    color: #9ca3af;
    text-align: center;
    line-height: 1.4;
  }
`;
